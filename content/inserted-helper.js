// NB: loaded once for each bugzilla show_bug.cgi page
/* Avoid interfering with bugzilla itself by wrapping in anon fn: */
(function() {

var INVALID_BUG_SPAM =
`This is a production bug tracker used by the Mozilla community.
Filing test bugs here wastes the time of all our contributors, volunteers as well as paid employees.
Please use https://landfill.bugzilla.org/ for testing instead, and don't file test bugs here.
If you continue to abuse this bugzilla instance, your account will be disabled.`;

var gAPIKey;
var gAPIToken = window.BUGZILLA && window.BUGZILLA.api_token;
var gParentEl = document.getElementById("bz-triage-helper-container");
var gContentEl = gParentEl.querySelector('#triage-tools');
if (!gContentEl) {
  // Deal with the HTML content not being here yet:
  var self = arguments.callee;
  gParentEl.addEventListener("html-content-loaded", function() {
    gParentEl.removeEventListener("html-content-loaded", arguments.callee);
    self();
  }, false);
}
var gBugID = (new URLSearchParams(location.search.substr(1))).get('id');
var gBZAPIBugRoot = location.protocol + "//" + location.host +
                    location.pathname.substring(0, location.pathname.lastIndexOf('/')) +
                    "/rest/bug/" + gBugID;
var gBugData = null;
var gSuggestionList = null;
var gComments = null;
var gAttachments = null;

var gIsProd = location.host == "bugzilla.mozilla.org";


function on(messages, handler) {
  if (!Array.isArray(messages)) {
    messages = [messages];
  }
  for (var i = 0; i < messages.length; i++) {
    gParentEl.addEventListener("triage-helper-" + messages[i], handler, false);
  }
}
function off(messages, handler) {
  if (!Array.isArray(messages)) {
    messages = [messages];
  }
  for (var i = 0; i < messages.length; i++) {
    gParentEl.removeEventListener("triage-helper-" + messages[i], handler, false);
  }
}
function pub(msg, data) {
  var ev = new CustomEvent("triage-helper-" + msg, {detail: data});
  gParentEl.dispatchEvent(ev);
}

function displayError(msg) {
  gContentEl.textContent = msg;
  gParentEl.classList.add("error");
}

function onNoBugzillaData() {
  displayError("Um, no bugzilla data? Try refreshing...");
}

function onErrorBugzilla(rsp) {
  displayError("You made bugzilla sad! Check the console for more error info");
  console.error(rsp);
}

function noResponseError(rsp) {
  if (!rsp) {
    onNoBugzillaData();
    return false;
  }
  if (rsp.faults && rsp.faults.length > 0 || rsp.error) {
    onErrorBugzilla(rsp);
    return false;
  }
  return true;
}

function onBugzillaData(e) {
  var rsp = this.response;
  if (noResponseError(rsp)) {
    gBugData = rsp.bugs[0];
    pub("data-loaded", gBugData);
  }
}

function onBugComments(e) {
  var rsp = this.response;
  if (noResponseError(rsp)) {
    gComments = rsp.bugs[gBugID].comments;
    pub("comments-loaded", gComments);
  }
}

function onBugAttachments(e) {
  var rsp = this.response;
  if (noResponseError(rsp)) {
    gAttachments = rsp.bugs[gBugID];
    pub("attachments-loaded", gAttachments);
  }
}

function toggleVisible(el, v) {
  if (typeof v == "undefined") {
    v = el.style.display == "none";
  }

  if (v) {
    el.style.removeProperty("display");
  } else {
    el.style.display = "none";
  }
}

function doBZXHR(method, postData, onload, onerror, path) {
  var xhr = new XMLHttpRequest();
  if (gAPIToken) {
    path = (path || gBZAPIBugRoot) + "?Bugzilla_api_token=" + encodeURIComponent(gAPIToken);
  } else if (gAPIKey && method === "GET") {
    path = (path || gBZAPIBugRoot) + "?api_key=" + encodeURIComponent(gAPIKey);
  }
  xhr.open(method, path || gBZAPIBugRoot);
  xhr.setRequestHeader("Accept", "application/json");
  xhr.responseType = "json";
  xhr.onload = onload;
  xhr.onerror = onerror;
  if (postData) {
    xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
    xhr.send(postData);
  } else {
    xhr.send();
  }
}

function fetchBugData() {
  doBZXHR("GET", null, onBugzillaData, onNoBugzillaData);
}

function fetchSecondaryData() {
  doBZXHR("GET", null, onBugComments, onNoBugzillaData, gBZAPIBugRoot + "/comment");
  doBZXHR("GET", null, onBugAttachments, onNoBugzillaData, gBZAPIBugRoot + "/attachment");
}

function doLogin(forceWantAPIKey) {
  if (!forceWantAPIKey && gAPIToken) {
    return Promise.resolve();
  }
  if (gAPIKey) {
    return Promise.resolve(gAPIKey);
  }
  return new Promise(function(resolve, reject) {
    on("apikey", function(ev) {
      off("apikey", arguments.callee);
      gAPIKey = ev.detail;
      resolve(gAPIKey);
    });
    pub("login-request");
  });
}

function onAfterPost(retryForbidden, resolve, reject, repostData, e) {
  var xhr = e.target;
  if (xhr && xhr.response && xhr.response.error) {
    if (xhr.response.code === 410 && repostData && !retryForbidden) {
      doLogin(true).then(function() {
        postBugData(repostData, true, true).then(resolve, reject);
      });
      return;
    }

    alert("There was an error submitting this data to bugzilla: " + xhr.response.message);
    console.error(xhr.response);
    reject(xhr.response);
    return;
  }
  resolve(e);
}

function onAfterPostError(resolve, reject, e) {
  console.log(e);
  alert("Error posting to bugzilla: " + e);
  reject(e);
}

function postBugData(data, retryForbidden, forceWantAPIKey) {
  if (!forceWantAPIKey && gAPIToken) {
    data.Bugzilla_api_token = gAPIToken;
  } else if (gAPIKey) {
    data.api_key = gAPIKey;
  }
  return new Promise(function(resolve, reject) {
    doBZXHR("PUT", JSON.stringify(data),
            onAfterPost.bind(null, retryForbidden, resolve, reject, data),
            onAfterPostError.bind(null, resolve, reject));
  });
}

function tagComment(commentObj, tag) {
  var url = gBZAPIBugRoot.replace(/[^\/]*$/, "comment/" + commentObj.id + "/tags");
  return new Promise(function(resolve, reject) {
    doBZXHR("PUT", JSON.stringify({comment_id: commentObj.id, add: [tag]}),
            onAfterPost.bind(null, false, resolve, reject, null), onAfterPostError.bind(null, resolve, reject), url);
  });
}

function createSuggestionUI(filter) {
  var el = document.createElement("li");
  el.className = "bz-triage-suggestion";
  el.id = "bz-triage-suggestion-" + filter.id;
  if (filter.createUI) {
    el.appendChild(filter.createUI());
  } else {
    var button = document.createElement("button");
    button.className = "bz-triage-suggestion-btn";
    button.textContent = filter.label;
    button.addEventListener('click', function(e) {
      filter.onDoAction();
    }, false);
    el.appendChild(button);
  }
  gSuggestionList.appendChild(el);
}

function createSuggestedActions() {
  gSuggestionList = document.createElement("ol");
  gSuggestionList.id = "bz-triage-suggestions";
  toggleVisible(gContentEl, false);
  gContentEl.textContent = "Suggested actions:";
  var myFilters = gFilters.slice(0).filter(function(f) { return f.applies(); });
  if (myFilters.length) {
    myFilters.sort(function(a, b) { return a.applyLikelihood() < b.applyLikelihood() });
    for (var i = 0; i < myFilters.length; i++) {
      createSuggestionUI(myFilters[i]);
    }
    gContentEl.appendChild(gSuggestionList);
    toggleVisible(gParentEl, true);
  } else {
    gContentEl.textContent = "No suggested actions.";
    toggleVisible(gParentEl, false);
  }
}

var gFilters = [];

var gMarkAsInvalidFilter = {
  id: "mark-invalid",
  applyLikelihood: function() {
    // FIXME do something cleverer
    return 1;
  },
  applies: function() {
    return gBugData.status != "RESOLVED" && gBugData.status != "VERIFIED" &&
           gComments.length < 4;
  },
  label: "Spam/Test bug",
  onDoAction: function(additionalActions) {
    var bugData = {"status": "RESOLVED", "resolution": "INVALID"};
    if (gIsProd) {
      bugData.product = "Invalid Bugs";
      bugData.component = "General";
    }
    var undesiredGroups = gBugData.groups.filter(function(group) {
      return group.endsWith("core-security");
    });
    if (undesiredGroups.length) {
      bugData.groups = {remove: undesiredGroups};
    }
    bugData.comment = {body: INVALID_BUG_SPAM};
    bugData.version = 'unspecified';
    Promise.all([postBugData(bugData), tagComment(gComments[0], "spam")]).then(function() {
      location.reload();
    });
  },
};

gFilters.push(gMarkAsInvalidFilter);

var gFixKeywordsFilter = {
  id: "fix-keywords",
  _words: {
    crash: "crash",
    "codepen.io": "testcase",
    "jsbin.com": "testcase",
    "jsfiddle.net": "testcase",
    "crash-stats.mozilla.com": "crashreportid",
    hang: "hang",
    freeze: "hang",
    "stopped working": ["regression", "regressionwindow-wanted"],
    broken: ["regression", "regressionwindow-wanted"],
    flash: "flashplayer",
  },
  _hasSuggestedKeywords: function() {
    if (this.__suggestedKeywords) {
      return this.__suggestedKeywords;
    }
    this.__suggestedKeywords = [];
    var summary = gBugData.summary.toLowerCase();
    var self = this;
    for (var word in this._words) {
      var keywordsToAdd = this._words[word];
      if (!Array.isArray(keywordsToAdd)) {
        keywordsToAdd = [keywordsToAdd];
      }

      function bugHasKeyword(kw) {
        return gBugData.keywords.indexOf(kw) != -1;
      }
      if ((summary.indexOf(word) != -1 || gComments[0].text.indexOf(word) != -1) && !keywordsToAdd.every(bugHasKeyword)) {
        this.__suggestedKeywords = this.__suggestedKeywords.concat(keywordsToAdd);
      }
    }
    gAttachments.forEach(function(att) {
      if (att.summary.toLowerCase().indexOf("test") != -1) {
        this.__suggestedKeywords.push("testcase");
      }
    }.bind(this));
    return this.__suggestedKeywords.length > 0;
  },
  applyLikelihood: function() {
    // FIXME do something cleverer
    return 1;
  },
  applies: function() {
    return gBugData.status != "RESOLVED" && gBugData.status != "VERIFIED" && this._hasSuggestedKeywords();
  },
  createUI: function() {
    var div = document.createElement("div");
    var button = document.createElement("button");
    button.textContent = "Fix keywords";
    button.addEventListener("click", function(e) {
      var keywordField = document.querySelector("#keywords");
      var existingList = keywordField.value.trim() ? keywordField.value.split(',') : [];
      existingList = existingList.map(function(s) { return s.trim(); });
      var listEls = Array.slice(e.target.parentNode.querySelectorAll('input[type=checkbox]'), 0);
      listEls.forEach(function(el) {
        if (!el.checked) {
          return;
        }
        var todo = el.getAttribute("data-kw-type");
        var kw = el.getAttribute("data-kw");
        if (todo == "add" && existingList.indexOf(kw) == -1) {
          existingList.push(kw);
        } else if (todo == "remove" && existingList.indexOf(kw) != -1) {
          var i = existingList.indexOf(kw);
          existingList.splice(i, 1);
        }
      });
      keywordField.value = existingList.join(', ');
      var container = e.target.parentNode.parentNode;
      container.remove();
    });
    div.appendChild(button);
    var ul = document.createElement("ul");
    this.__suggestedKeywords.forEach(function(kw) {
      var li = document.createElement("li");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.setAttribute("data-id", "triage-helper-fix-keyword-" + kw);
      cb.setAttribute("data-kw-type", "add");
      cb.setAttribute("data-kw", kw);
      cb.checked = true;
      var label = document.createElement("label");
      label.appendChild(cb);
      label.appendChild(document.createTextNode(kw));
      li.appendChild(label);
      ul.appendChild(li);
    });
    div.appendChild(ul);
    return div;
  },
};
gFilters.push(gFixKeywordsFilter);

var gAskQuestionFilter = {
  id: "ask-questions",
  _questions: new Map([
    {
      id: "new-profile",
      label: "New profile",
      question: "Have you tried if you see this issue in a new profile, too? You can find " +
                "details on how to create a new profile (without changing anything in your " +
                "regular profile!) at " +
                "https://support.mozilla.org/kb/profile-manager-create-and-remove-firefox-profiles ."
    },
    {
      id: "safe-mode",
      label: "Safe mode",
      question: "Have you tried if you see this issue in Firefox's safe mode, too? " +
                "You can restart Firefox into safe mode by using the " +
                "'Restart Firefox with add-ons disabled' entry in the 'Help' menu. This will " +
                "also disable graphics hardware acceleration and some JS engine optimizations, " +
                "not just extensions and plugins. See " +
                "https://support.mozilla.org/kb/troubleshoot-firefox-issues-using-safe-mode" +
                " ."
    },
    {
      id: "crash-report-id",
      label: "crash report?",
      question: "Do you have a crash report ID? You can find crash report IDs for crash reports " +
                "you have submitted by going to the 'about:crashes' page in Firefox. "
    },
    {
      id: "testcase",
      label: "testcase?",
      question: "Do you have a testcase we can use to try to reproduce the issue you're seeing?"
    },
    {
      id: "other-browsers",
      label: "other browsers",
      question: "Do you see the same thing happening in other browsers, like Safari, " +
                "Internet Explorer, or Chrome?"
    },
  ].map(x => [x.id, x])),
  createUI: function() {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode("Needinfo reporter about:"));
    var button = document.createElement("button");
    button.textContent = "Ask";
    var ul = document.createElement("ul");
    this._questions.forEach(function(q) {
      var li = document.createElement("li");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.setAttribute("data-questionid", q.id);
      var label = document.createElement("label");
      label.appendChild(cb);
      label.appendChild(document.createTextNode(q.label));
      li.appendChild(label);
      ul.appendChild(li);
    });
    div.appendChild(ul);

    button.addEventListener("click", function(e) {
      var listEls = Array.slice(e.target.parentNode.querySelectorAll('input[type=checkbox]'), 0);
      var questionTexts = [];
      listEls.forEach(function(el) {
        if (!el.checked) {
          return;
        }
        var questionId = el.getAttribute("data-questionid");
        var question = gAskQuestionFilter._questions.get(questionId);
        questionTexts.push(question.question);
      });
      var bugData = {comment: {body: questionTexts.join("\n\n")}};
      bugData.flags = [{"new": true, status: "?", name: "needinfo", requestee: gBugData.creator}];
      postBugData(bugData).then(function() {
        location.reload();
      });
    });
    div.appendChild(button);
    return div;
  },
  applies: function() {
    return gBugData.status != "RESOLVED" && gBugData.status != "VERIFIED";
  },
  applyLikelihood: function() {
    // FIXME...
    return 1;
  },
};
gFilters.push(gAskQuestionFilter);

on(["data-loaded", "comments-loaded", "attachments-loaded"], function() {
  if (gBugData && gComments && gAttachments) {
    createSuggestedActions();
  }
});

doLogin().then(function() {
  fetchBugData();
  fetchSecondaryData();
});

gParentEl.querySelector('#triage-header').addEventListener('click', function(e) {
  toggleVisible(gContentEl);
}, false);

})();
