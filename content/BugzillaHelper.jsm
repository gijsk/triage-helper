/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {interfaces: Ci, utils: Cu, classes: Cc} = Components;
Cu.import("resource://gre/modules/Services.jsm");
this.EXPORTED_SYMBOLS = ["BugzillaHelper"];

let BugzillaHelper = {
  elementID: "bz-triage-helper-container",
  apiKey: "",
  _askForAPIKey: function(win) {
    var apiKey = {};
    Services.prompt.prompt(win || null, "Bugzilla API key for Triage Helper",
        "Please provide Triage Helper with a bugzilla API key in order for it to work properly:", apiKey, "", {});
    if (apiKey.value) {
      this.apiKey = apiKey.value;
      Services.prefs.setCharPref("extensions.triagehelper.bzapikey", this.apiKey);
    }
  },
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
    let ev = new win.CustomEvent("html-content-loaded");
    div.dispatchEvent(ev);
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
  createHelperElement: function(win) {
    let doc = win.document;
    let div = doc.createElement('div');
    div.id = this.elementID;
    // Avoid reflows as much as possible:
    div.setAttribute("style", "position: absolute; display: none;");
    doc.body.appendChild(div);
    return div;
  },
  handlePage: function(win) {
    this.insertContent(win);
    this.insertStyle(win);
    this.insertScript(win);
  },
};

try {
  BugzillaHelper.apiKey = Services.prefs.getCharPref("extensions.triagehelper.bzapikey");
} catch (ex) {
  // Do nothing.
}

