// ==UserScript==
// @name         D365 Schedule Board Zebra Stripes
// @namespace    Violentmonkey Scripts
// @match        https://*.dynamics.com/main.aspx*
// @grant        none
// @version      1.2
// @author       Miles Labrador
// @description  Zebra stripes for the D365 Field Service Schedule Board timeline grid
// @license MIT
// @downloadURL https://update.greasyfork.org/scripts/572448/D365%20Schedule%20Board%20Zebra%20Stripes.user.js
// @updateURL https://update.greasyfork.org/scripts/572448/D365%20Schedule%20Board%20Zebra%20Stripes.meta.js
// ==/UserScript==

function injectZebraStripes() {
  // Only run if the ScheduleBoard iframe is present
  var iframes = document.querySelectorAll('iframe');
  var found = false;
  for (var i = 0; i < iframes.length; i++) {
    try {
      if (iframes[i].src && iframes[i].src.includes('ScheduleBoard')) {
        found = true;
        break;
      }
    } catch(e) {}
  }
  if (!found) return;

  for (var i = 0; i < iframes.length; i++) {
    try {
      var count = iframes[i].contentDocument.querySelectorAll('.b-grid-row').length;
      if (count > 0) {
        var doc = iframes[i].contentDocument;
        if (doc.getElementById('zebra-style')) return;

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
    } catch(e) {}
  }
}

var attempts = 0;
var interval = setInterval(function() {
  injectZebraStripes();
  attempts++;
  if (attempts > 30) clearInterval(interval);
}, 1000);
