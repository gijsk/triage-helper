/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {interfaces: Ci, utils: Cu, classes: Cc} = Components;
this.EXPORTED_SYMBOLS = ["BootstrapModule"];

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyServiceGetter(this, "gMM", 
    "@mozilla.org/globalmessagemanager;1", "nsIMessageListenerManager");

const kCacheBuster = Date.now();
const kFrameScript = "chrome://triage-helper/content/frame-script.js" + "?_" + kCacheBuster + "=0";


let BootstrapModule = {
  startup: function() {
    gMM.loadFrameScript(kFrameScript, true);
  },
  shutdown: function() {
    gMM.sendAsyncMessage("triage-helper:fromchrome", "shutdown");
    gMM.removeDelayedFrameScript(kFrameScript);
  },
  loadIntoWindow: function(win) {
    
  },
  unloadFromWindow: function(win) {
  },
};

