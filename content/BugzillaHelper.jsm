/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {interfaces: Ci, utils: Cu, classes: Cc} = Components;
this.EXPORTED_SYMBOLS = ["BugzillaHelper"];

let BugzillaHelper = {
  handlePage: function(win) {
    win.setTimeout(function() { win.alert('hurray'); }, 10000);
  },
};

