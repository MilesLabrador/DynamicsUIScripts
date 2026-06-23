// ==UserScript==
// @name         Power Automate – Schema-Stale Error Silencer (Save/Test-Aware)
// @namespace    https://local.userscripts/pa-schema-silencer
// @version      1.0.0
// @description  Suppresses the transient "X is no longer present in the operation schema" banner while reconciling. Determines real readiness from the Save/Test command-bar button state (ground truth) plus network activity to the Dataverse/Power Platform hosts (secondary signal) — instead of relying on a single fixed timer.
// @license MIT
// @match        https://make.powerautomate.com/*
// @match        https://make.powerapps.com/*
// @match        https://*.flow.microsoft.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ====================== CONFIG ======================
  // The marker text that identifies this specific transient error.
  const MARKER = 'is no longer present in the operation schema';

  // Labels of the command-bar buttons that tell us, definitively, whether
  // you're actually able to Save / Test right now. If the pill never says
  // "Ready" on your tenant, run __paSilencer.debug() in the console and
  // adjust these regexes to match what it finds.
  const SAVE_LABELS = [/^save\b/i];
  const TEST_LABELS = [/^test\b/i];

  // Hosts that are part of the Power Platform / Dataverse reconciliation
  // pipeline (pulled from your captured network log: powerplatform.com /
  // powerplatformusercontent.com / dynamics.com, both environment- and
  // tenant-scoped). Used only as a secondary "is it still working?" signal,
  // since the log only shows CONNECT tunnels and not which specific call
  // finishes reconciliation.
  const RELEVANT_HOST_RE = /(^|\.)(dynamics\.com|powerplatform\.com|powerplatformusercontent\.com)$/i;

  // Minimum time with zero in-flight requests to a relevant host before we
  // treat the backend as "settled" (used only to help decide a banner is real).
  const NETWORK_IDLE_MS = 3000;

  // If Save/Test are still disabled (or unknown) after this long AND the
  // network has gone idle, reveal the banner as likely a real error.
  const REVEAL_AFTER_IDLE_MS = 20000;

  // Hard ceiling: reveal regardless of network activity once a hidden
  // banner has been around this long, so you're never stuck waiting.
  const MAX_HIDE_MS = 120000;

  const SWEEP_INTERVAL_MS = 1000;
  const DEBUG = false;
  // ======================================================

  const log = (...a) => DEBUG && console.log('[PA-Silencer]', ...a);

  // ---------------------------------------------------------------------
  // 1) Network activity tracking (fetch + XHR) for relevant hosts only.
  // ---------------------------------------------------------------------
  let pending = 0;
  let lastActivity = Date.now();

  function hostnameOf(u) {
    try { return new URL(u, location.href).hostname; } catch (e) { return ''; }
  }
  function markStart() { pending++; lastActivity = Date.now(); }
  function markEnd() { pending = Math.max(0, pending - 1); lastActivity = Date.now(); }

  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (...args) {
      const urlArg = args[0] instanceof Request ? args[0].url : args[0];
      const relevant = RELEVANT_HOST_RE.test(hostnameOf(urlArg));
      if (relevant) markStart();
      const p = origFetch.apply(this, args);
      if (relevant) p.then(markEnd, markEnd);
      return p;
    };
  }

  const OrigXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OrigXHR();
    let relevant = false;
    const origOpen = xhr.open;
    xhr.open = function (method, url, ...rest) {
      relevant = RELEVANT_HOST_RE.test(hostnameOf(url));
      return origOpen.call(xhr, method, url, ...rest);
    };
    xhr.addEventListener('loadstart', () => { if (relevant) markStart(); });
    xhr.addEventListener('loadend', () => { if (relevant) markEnd(); });
    return xhr;
  }
  PatchedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;

  function networkIdleFor(ms) {
    return pending === 0 && (Date.now() - lastActivity) >= ms;
  }

  // ---------------------------------------------------------------------
  // 2) Save/Test button state — the actual ground truth for "can I save
  //    and test right now?" Re-queried each sweep since PA re-renders.
  // ---------------------------------------------------------------------
  function findCommandButton(labelRegexes) {
    const candidates = document.querySelectorAll('button, [role="button"], [role="menuitem"]');
    for (const el of candidates) {
      const name = (el.getAttribute('aria-label') || el.textContent || '').trim();
      if (!name) continue;
      for (const re of labelRegexes) {
        if (re.test(name)) return el;
      }
    }
    return null;
  }
  function isDisabled(el) {
    if (!el) return null; // unknown — couldn't find the button
    if (el.disabled) return true;
    const aria = el.getAttribute('aria-disabled');
    if (aria === 'true') return true;
    if (aria === 'false') return false;
    const cls = el.className ? String(el.className) : '';
    if (/is-disabled|--disabled\b/i.test(cls)) return true;
    return false;
  }

  function getReadyState() {
    const saveBtn = findCommandButton(SAVE_LABELS);
    const testBtn = findCommandButton(TEST_LABELS);
    const saveDisabled = isDisabled(saveBtn);
    const testDisabled = isDisabled(testBtn);
    const known = saveDisabled !== null || testDisabled !== null;
    const ready = known && saveDisabled === false && testDisabled === false;
    return { saveBtn, testBtn, saveDisabled, testDisabled, known, ready };
  }

  // ---------------------------------------------------------------------
  // 3) Status pill
  // ---------------------------------------------------------------------
  let pill = null;
  let readyFlashTimer = null;
  function ensurePill() {
    if (pill) return pill;
    pill = document.createElement('div');
    Object.assign(pill.style, {
      position: 'fixed', bottom: '16px', right: '16px', zIndex: '2147483647',
      padding: '8px 14px', borderRadius: '999px', color: '#fff',
      font: '600 12px/1.2 "Segoe UI", system-ui, sans-serif',
      boxShadow: '0 2px 10px rgba(0,0,0,0.35)', pointerEvents: 'none',
      transition: 'opacity .2s ease, background .2s ease', opacity: '0',
    });
    document.body.appendChild(pill);
    return pill;
  }
  function setPill(text, bg, visible) {
    const p = ensurePill();
    p.textContent = text;
    p.style.background = bg;
    p.style.opacity = visible ? '1' : '0';
  }

  // ---------------------------------------------------------------------
  // 4) Banner hide/reveal bookkeeping
  // ---------------------------------------------------------------------
  const seen = new WeakSet();
  const active = []; // { el, prevDisplay, start, revealed }
  let wasReconciling = false;

  function bannerFor(el) {
    let node = el;
    for (let i = 0; i < 6 && node && node !== document.body; i++) {
      const role = node.getAttribute && node.getAttribute('role');
      const cls = (node.className && node.className.toString) ? node.className.toString() : '';
      if (role === 'alert' || /MessageBar|msla-[^ ]*error|errorMessage|validation/i.test(cls)) return node;
      node = node.parentElement;
    }
    return el;
  }

  function scan() {
    const all = document.body.querySelectorAll('*');
    for (const el of all) {
      if (seen.has(el)) continue;
      const txt = el.textContent;
      if (!txt || txt.length > 600) continue;
      if (!txt.toLowerCase().includes(MARKER)) continue;
      let childMatches = false;
      for (const child of el.children) {
        const ct = child.textContent;
        if (ct && ct.toLowerCase().includes(MARKER)) { childMatches = true; break; }
      }
      if (childMatches) continue;

      const banner = bannerFor(el);
      if (seen.has(banner)) continue;
      seen.add(el);
      seen.add(banner);

      active.push({ el: banner, prevDisplay: banner.style.display, start: Date.now(), revealed: false });
      banner.style.display = 'none';
      log('Hid a schema-stale banner', banner);
    }
  }

  function sweep() {
    const now = Date.now();
    const { ready, known, saveDisabled, testDisabled } = getReadyState();

    for (let i = active.length - 1; i >= 0; i--) {
      const r = active[i];
      if (!document.contains(r.el)) {
        log('Banner removed by designer (healed).');
        active.splice(i, 1);
        continue;
      }
      if (r.revealed) continue;

      if (ready) {
        log('Save/Test enabled — leaving stale banner hidden.');
        active.splice(i, 1);
        continue;
      }

      const age = now - r.start;
      const idleLongEnough = networkIdleFor(NETWORK_IDLE_MS);

      if (age > MAX_HIDE_MS || (age > REVEAL_AFTER_IDLE_MS && idleLongEnough)) {
        r.el.style.display = r.prevDisplay || '';
        r.revealed = true;
        log('Revealing banner — Save/Test still blocked and network settled (or max wait hit).');
      }
    }

    const anyHidden = active.some(r => !r.revealed && document.contains(r.el));
    const reconciling = anyHidden || (known && (saveDisabled || testDisabled));

    if (reconciling) {
      clearTimeout(readyFlashTimer);
      setPill('⏳ Schema reconciling… Save/Test disabled — wait', 'rgba(32,32,32,0.92)', true);
      wasReconciling = true;
    } else if (wasReconciling) {
      setPill('✅ Ready — Save/Test enabled', 'rgba(16,124,16,0.92)', true);
      wasReconciling = false;
      clearTimeout(readyFlashTimer);
      readyFlashTimer = setTimeout(() => setPill('', '', false), 4000);
    }
  }

  const debounced = (() => {
    let t = null;
    return () => { clearTimeout(t); t = setTimeout(scan, 150); };
  })();
  new MutationObserver(debounced).observe(document.documentElement, { childList: true, subtree: true });

  setInterval(sweep, SWEEP_INTERVAL_MS);
  scan();

  // Debug helper: run __paSilencer.debug() in the devtools console to see
  // what the script currently thinks the Save/Test buttons are, in case
  // SAVE_LABELS/TEST_LABELS need adjusting for your tenant's UI/locale.
  window.__paSilencer = {
    debug() {
      const s = getReadyState();
      console.log('[PA-Silencer] save button:', s.saveBtn, 'disabled:', s.saveDisabled);
      console.log('[PA-Silencer] test button:', s.testBtn, 'disabled:', s.testDisabled);
      console.log('[PA-Silencer] pending relevant requests:', pending, 'idle ms:', Date.now() - lastActivity);
      console.log('[PA-Silencer] active hidden banners:', active.filter(r => !r.revealed).length);
    },
  };

  log('Active.');
})();