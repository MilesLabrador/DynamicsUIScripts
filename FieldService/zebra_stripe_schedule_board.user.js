// ==UserScript==
// @name         D365 Schedule Board Zebra Stripes
// @namespace    Violentmonkey Scripts
// @match        https://*.crm.dynamics.com/*
// @grant        none
// @version      1.4
// @author       Miles Labrador
// @description  Zebra stripes for the D365 Field Service Schedule Board timeline grid
// @license MIT
// @downloadURL https://update.greasyfork.org/scripts/572448/D365%20Schedule%20Board%20Zebra%20Stripes.user.js
// @updateURL https://update.greasyfork.org/scripts/572448/D365%20Schedule%20Board%20Zebra%20Stripes.meta.js
// ==/UserScript==

var listObserver = null;
var mainObserver = null;
var debounceTimer = null;

function applyListStripes(doc) {
  doc.querySelectorAll('.ms-GroupHeader').forEach(function(row, i) {
    row.style.backgroundColor = i % 2 === 0 ? '#daeaf7' : '#ffffff';
  });
}

function applyMainStripes() {
  document.querySelectorAll('.ms-DetailsRow').forEach(function(row, i) {
    row.style.backgroundColor = i % 2 === 0 ? '#daeaf7' : '#ffffff';
  });
}

function startListObserver(doc) {
  if (listObserver) listObserver.disconnect();
  listObserver = new MutationObserver(function() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
      applyListStripes(doc);
    }, 100);
  });
  listObserver.observe(doc.body, { childList: true, subtree: true });
  applyListStripes(doc);
}

function startMainObserver() {
  if (mainObserver) mainObserver.disconnect();
  mainObserver = new MutationObserver(function() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
      applyMainStripes();
    }, 100);
  });
  mainObserver.observe(document.body, { childList: true, subtree: true });
  applyMainStripes();
}

function injectStripes() {
  // Main document ms-DetailsRow (booking view and list view variant)
  var mainDetailRows = document.querySelectorAll('.ms-DetailsRow').length;
  if (mainDetailRows > 0) {
    if (!mainObserver) startMainObserver();
  } else {
    if (mainObserver) {
      mainObserver.disconnect();
      mainObserver = null;
    }
  }

  // Schedule board iframe
  var iframes = document.querySelectorAll('iframe');
  var scheduleBoardFound = false;

  for (var i = 0; i < iframes.length; i++) {
    try {
      if (iframes[i].src && iframes[i].src.includes('ScheduleBoard')) {
        scheduleBoardFound = true;
        var doc = iframes[i].contentDocument;
        var gridRows = doc.querySelectorAll('.b-grid-row').length;
        var listRows = doc.querySelectorAll('.ms-GroupHeader').length;

        // Timeline grid stripes
        if (gridRows > 0 && !doc.getElementById('zebra-style')) {
          var oddRows = [];
          var evenRows = [];
          for (var n = 0; n < 200; n++) {
            var selector = `.b-grid-row:not([data-id*="_generatedt_"])[data-index="${n}"] .b-grid-cell`;
            if (n % 2 === 0) {
              oddRows.push(selector);
            } else {
              evenRows.push(selector);
            }
          }
          var css = `
            ${oddRows.join(',\n')} {
              background-color: #daeaf7 !important;
            }
            ${evenRows.join(',\n')} {
              background-color: #ffffff !important;
            }
          `;
          var style = doc.createElement('style');
          style.id = 'zebra-style';
          style.innerHTML = css;
          doc.head.appendChild(style);
        }

        // List view stripes
        if (listRows > 0 && !listObserver) {
          startListObserver(doc);
        }
      }
    } catch(e) {}
  }

  if (!scheduleBoardFound && listObserver) {
    listObserver.disconnect();
    listObserver = null;
  }
}

// Watch main document for navigation
var pageObserver = new MutationObserver(function() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(injectStripes, 100);
});
pageObserver.observe(document.body, { childList: true, subtree: true });

// Fallback interval
setInterval(injectStripes, 2000);
