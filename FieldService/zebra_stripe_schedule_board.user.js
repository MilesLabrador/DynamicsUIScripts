// ==UserScript==
// @name         D365 Schedule Board Zebra Stripes
// @namespace    Violentmonkey Scripts
// @match        https://*.dynamics.com/main.aspx*
// @grant        none
// @version      1.3
// @author       Miles Labrador
// @description  Zebra stripes for the D365 Field Service Schedule Board timeline grid
// @license MIT
// @downloadURL https://update.greasyfork.org/scripts/572448/D365%20Schedule%20Board%20Zebra%20Stripes.user.js
// @updateURL https://update.greasyfork.org/scripts/572448/D365%20Schedule%20Board%20Zebra%20Stripes.meta.js
// ==/UserScript==

var listObserver = null;
var stripeInterval = null;

function applyListStripes(doc) {
  var rows = doc.querySelectorAll('.ms-GroupHeader');
  rows.forEach(function(row, i) {
    row.style.backgroundColor = i % 2 === 0 ? '#daeaf7' : '#ffffff';
  });
}

function startListObserver(doc) {
  if (listObserver) listObserver.disconnect();
  listObserver = new MutationObserver(function() {
    applyListStripes(doc);
  });
  listObserver.observe(doc.body, { childList: true, subtree: true });
  applyListStripes(doc);
}

function injectStripes() {
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

  // If schedule board is gone, clean up list observer
  if (!scheduleBoardFound && listObserver) {
    listObserver.disconnect();
    listObserver = null;
  }
}

// Watch the main document for navigation changes
var mainObserver = new MutationObserver(function() {
  injectStripes();
});
mainObserver.observe(document.body, { childList: true, subtree: true });

// Also run on an interval as a fallback
setInterval(injectStripes, 2000);
