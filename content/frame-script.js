/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {interfaces: Ci, utils: Cu, classes: Cc} = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");


Components.utils.importGlobalProperties(["XMLHttpRequest"]);
// Don't use |this| because that's shared between frame scripts.
let gShared = {};

let gWins = new Set();

XPCOMUtils.defineLazyModuleGetter(gShared, "BugzillaHelper",
    "chrome://triage-helper/content/BugzillaHelper.jsm");

function getXHRToPropOnBox(url, prop, methodToCall) {
  if (gShared.SandBox[prop]) {
    return;
  }
  let xhr = new XMLHttpRequest();
  xhr.onload = function(e) {
    gShared.SandBox[prop] = this.responseText;
    for (let win of gWins) {
      gShared.SandBox[methodToCall](win);
    }
    xhr.onload = null;
    xhr = null;
  };
  xhr.overrideMimeType("text/plain");
  xhr.open("GET", url);
  xhr.send(null);
}

function ensureStylesGetLoaded() {
  getXHRToPropOnBox("chrome://triage-helper/skin/bz.css", "_helperCSS", "insertStyle");
}

function ensureContentGetsLoaded() {
  getXHRToPropOnBox("chrome://triage-helper/content/helper.html", "_helperHTML", "insertContent");
}

function ensureScriptGetsLoaded() {
  getXHRToPropOnBox("chrome://triage-helper/content/inserted-helper.js", "_helperJS", "insertScript");
}


const gAllowedHosts = [
  "bugzilla.mozilla.org",
  "landfill.bugzilla.org",
  "bugzilla-dev.allizom.org",
];

XPCOMUtils.defineLazyGetter(gShared, "SandBox", function() {
  let box = new Cu.Sandbox(gAllowedHosts.map(x => "https://" + x), {
    sandboxName: "triage-helper-bmo-sandbox",
    wantComponents: false,
    wantGlobalProperties: ["CSS", "URL", "URLSearchParams", "XMLHttpRequest"],
    wantXrays: true
  });
  for (let x in gShared.BugzillaHelper) {
    if (x[0] == "_") {
      continue;
    }
    if (typeof gShared.BugzillaHelper[x] == "function") {
      Cu.exportFunction(gShared.BugzillaHelper[x], box, {defineAs: x});
    } else {
      try {
        box[x] = Cu.cloneInto(gShared.BugzillaHelper[x], box);
      } catch (ex) {
        console.error("Error cloning " + x + ": ");
        Cu.reportError(ex);
        throw ex;
      }
    }
  }
  return box;
});

function onDOMContentLoad(e) {
  let win = e.target.defaultView;
  // Ensure we're on BMO:
  if (!win.location.protocol.startsWith("https") ||
      !gAllowedHosts.find(x => x == win.location.host) ||
      !win.location.pathname.endsWith("/show_bug.cgi")) {
    return;
  }
  // Don't care about frames:
  if (win != win.top)
    return;

  gWins.add(win);
  win.addEventListener('unload', function(e) {
    if (!e.isTrusted) {
      return;
    }
    let unloadedWin = e.target.defaultView;
    if (!unloadedWin || unloadedWin != unloadedWin.top) {
      return;
    }
    win.removeEventListener('unload', arguments.callee);
    gWins.delete(win);
  }, false);
  // Trigger the lazy getter:
  let box = gShared.SandBox;
  let element = box.createHelperElement(win);
  element.addEventListener('triage-helper-login-request', function(e) {
    if (!gShared.BugzillaHelper.apiKey)
      gShared.BugzillaHelper._askForAPIKey(win);
    if (gShared.BugzillaHelper.apiKey) {
      let ev = new win.CustomEvent('triage-helper-apikey', {detail: gShared.BugzillaHelper.apiKey, bubbles: false, cancelable: false});
      win.document.getElementById(gShared.BugzillaHelper.elementID).dispatchEvent(ev);
    }
  });
  box.handlePage(win);
  ensureStylesGetLoaded();
  ensureContentGetsLoaded();
  ensureScriptGetsLoaded();
}

function onChromeMessage(msg) {
  switch (msg) {
    case "shutdown":
      Cu.nukeSandbox(gShared.SandBox);
      gWins.clear();
      gShared.SandBox = null;
      break;
    default:
      Cu.reportError("Unknown chrome message received: " + msg);
  }
}

addEventListener("DOMContentLoaded", onDOMContentLoad);
addMessageListener("triage-helper:fromchrome", onChromeMessage);
