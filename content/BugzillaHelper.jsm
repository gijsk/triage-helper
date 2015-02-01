/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {interfaces: Ci, utils: Cu, classes: Cc} = Components;
this.EXPORTED_SYMBOLS = ["BugzillaHelper"];

let BugzillaHelper = {
  elementID: "bz-triage-helper-container",
  insertContent: function(win) {
    if (!this._helperHTML) {
      return;
    }
    let div = win.document.getElementById(this.elementID);
    if (div.childNodes.length > 0) {
      div.innerHTML += this._helperHTML;
    } else {
      div.innerHTML = this._helperHTML;
    }
  },
  insertStyle: function(win) {
    if (!this._helperCSS) {
      return;
    }
    let div = win.document.getElementById(this.elementID);
    let styleEl = win.document.createElement("style");
    styleEl.setAttribute("scoped", "true");
    styleEl.textContent = this._helperCSS;
    div.appendChild(styleEl);
  },
  insertScript: function(win) {
    if (!this._helperJS) {
      return;
    }
    let div = win.document.getElementById(this.elementID);
    let script = win.document.createElement("script");
    script.textContent = this._helperJS;
    div.appendChild(script);
  },
  handlePage: function(win) {
    let doc = win.document;
    let div = doc.createElement('div');
    Cu.reportError("Creating: " + this.elementID);
    div.id = this.elementID;
    // Avoid reflows as much as possible:
    div.setAttribute("style", "position: absolute; display: none;");
    doc.body.appendChild(div);
    this.insertContent(win);
    this.insertStyle(win);
    this.insertScript(win);
  },
};

