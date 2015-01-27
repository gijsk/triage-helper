/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {interfaces: Ci, utils: Cu, classes: Cc} = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

// Don't use |this| because that's shared between frame scripts.
let MyGlobals = {};

XPCOMUtils.defineLazyModuleGetter(MyGlobals, "BugzillaHelper",
    "chrome://triage-helper/content/BugzillaHelper.jsm");

XPCOMUtils.defineLazyGetter(MyGlobals, "SandBox", function() {
  debugger;
  let box = new Cu.Sandbox("https://bugzilla.mozilla.org", {
    sandboxName: "triage-helper-bmo-sandbox",
    wantComponents: false,
    wantGlobalProperties: ["CSS", "URL", "URLSearchParams", "XMLHttpRequest"],
    wantXrays: true
  });
  for (let x in MyGlobals.BugzillaHelper) {
    Cu.exportFunction(MyGlobals.BugzillaHelper[x], box, {defineAs: x});
  }
  return box;
});

function onDOMContentLoad(e) {
  let win = e.target.defaultView;
  // Ensure we're on BMO:
  if (!win.location.protocol.startsWith("https") ||
      win.location.host != "bugzilla.mozilla.org" ||
      win.location.pathname != "/show_bug.cgi") {
    return;
  }
  // Don't care about frames:
  if (win != win.top)
    return;
  debugger;
  MyGlobals.SandBox.handlePage(win);
}

function onChromeMessage(msg) {
  switch (msg) {
    case "shutdown":
      Cu.nukeSandbox(MyGlobals.gSandBox);
      gSandBox = null;
      break;
    default:
      Cu.reportError("Unknown chrome message received: " + msg);
  }
}

addEventListener("DOMContentLoaded", onDOMContentLoad);
addMessageListener("triage-helper:fromchrome", onChromeMessage);
