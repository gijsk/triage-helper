// NB: loaded once for each bugzilla show_bug.cgi page
/* Avoid interfering with bugzilla itself by wrapping in anon fn: */
(function() {

var INVALID_BUG_SPAM =
`This is a production bug tracker used by the Mozilla community.
Filing test bugs here wastes the time of all our contributors, volunteers as well as paid employees.
Please use http://landfill.bugzilla.org/ for testing instead, and don't file test bugs here.
If you continue to abuse this bugzilla instance, your account will be disabled.`;

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

function onAfterPost(resolve, reject, e) {
  var xhr = e.target;
  if (xhr && xhr.response && xhr.response.error) {
    alert("There was an error submitting this data to bugzilla: " + xhr.response.message);
    Cu.reportError(xhr.response.message);
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

function postBugData(data) {
  return new Promise(function(resolve, reject) {
    doBZXHR("PUT", JSON.stringify(data), onAfterPost.bind(null, resolve, reject), onAfterPostError.bind(null, resolve, reject));
  });
}

function tagComment(commentObj, tag) {
  var url = gBZAPIBugRoot.replace(/[^\/]*$/, "comment/" + commentObj.id + "/tags");
  return new Promise(function(resolve, reject) {
    doBZXHR("PUT", JSON.stringify({comment_id: commentObj.id, add: [tag]}),
            onAfterPost.bind(null, resolve, reject), onAfterPostError.bind(null, resolve, reject), url);
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
    return gBugData.status != "RESOLVED" && gComments.length < 4;
  },
  label: "Spam/Test bug",
  onDoAction: function(additionalActions) {
    var bugData = {"status": "RESOLVED", "resolution": "INVALID"};
    bugData.product = "Invalid Bugs";
    bugData.component = "General";
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
    "codepen.com": "testcase",
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
      if ((summary.contains(word) || gComments[0].text.contains(word)) && !keywordsToAdd.every(bugHasKeyword)) {
        this.__suggestedKeywords = this.__suggestedKeywords.concat(keywordsToAdd);
      }
    }
    gAttachments.forEach(function(att) {
      if (att.summary.toLowerCase().contains("test")) {
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
    return gBugData.status != "RESOLVED" && this._hasSuggestedKeywords();
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

on(["data-loaded", "comments-loaded", "attachments-loaded"], function() {
  if (gBugData && gComments && gAttachments) {
    createSuggestedActions();
  }
});
fetchBugData();
fetchSecondaryData();

gParentEl.querySelector('#triage-header').addEventListener('click', function(e) {
  toggleVisible(gContentEl);
}, false);

})();
