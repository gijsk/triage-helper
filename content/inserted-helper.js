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
var gBugData = null;
var gSuggestionList = null;


function on(msg, handler) {
  gParentEl.addEventListener("triage-helper-" + msg, handler, false);
}
function off(msg, handler) {
  gParentEl.removeEventListener("triage-helper-" + msg, handler, false);
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

function onBugzillaData(e) {
  var rsp = this.response;
  if (!rsp) {
    onNoBugzillaData();
    return;
  }
  if (rsp.faults && rsp.faults.length > 0 || rsp.error) {
    onErrorBugzilla(rsp);
    return;
  }
  gBugData = rsp.bugs[0];
  pub("data-loaded", gBugData);
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

function getBZAPIURLForBug() {
  var root = location.host + location.pathname.substring(0, location.pathname.lastIndexOf('/'));
  return location.protocol + "//" + root + "/rest/bug/" + gBugID;
}

function doBZXHR(method, postData, onload, onerror) {
  var xhr = new XMLHttpRequest();
  xhr.open(method, getBZAPIURLForBug());
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

function onAfterPost(e) {
  var xhr = e.target;
  if (xhr && xhr.response && xhr.response.error) {
    alert("There was an error submitting this data to bugzilla: " + xhr.response.message);
    return;
  }
  location.reload(true);
}

function onAfterPostError(e) {
  console.log(e);
  alert("Error posting to bugzilla: " + e);
}

function postBugData(data) {
  doBZXHR("PUT", JSON.stringify(data), onAfterPost, onAfterPostError);
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
      filter.onDoAction(filter.extraActions.filter(function(action) {
        return el.querySelector('input[data-id="' + action.id + '"]').checked;
      }));
    }, false);
    el.appendChild(button);
    if (filter.extraActions) {
      el.appendChild(document.createElement("br"));
      for (var i = 0; i < filter.extraActions.length; i++) {
        var action = filter.extraActions[i];
        var cb = document.createElement("input");
        cb.setAttribute("type", "checkbox");
        cb.setAttribute("data-id", action.id);
        var label = document.createElement("label");
        label.appendChild(cb);
        label.appendChild(document.createTextNode(" " + action.label));
        el.appendChild(label);
        el.appendChild(document.createElement("br"));
      }
    }
  }
  gSuggestionList.appendChild(el);
}

function createSuggestedActions() {
  gSuggestionList = document.createElement("ol");
  gSuggestionList.id = "bz-triage-suggestions";
  toggleVisible(gContentEl, false);
  gContentEl.textContent = "Suggested actions:";
  var myFilters = gFilters.slice(0).filter(function(f) { return f.applies(); });
  myFilters.sort(function(a, b) { return a.applyLikelihood() < b.applyLikelihood() });
  for (var i = 0; i < myFilters.length; i++) {
    createSuggestionUI(myFilters[i]);
  }
  gContentEl.appendChild(gSuggestionList);
}

var gFilters = [];

var gMarkAsInvalidFilter = {
  id: "mark-invalid",
  applyLikelihood: function() {
    // FIXME do something cleverer
    return 1;
  },
  applies: function() {
    return gBugData.status != "RESOLVED";
  },
  label: "Mark as invalid",
  onDoAction: function(additionalActions) {
    var bugData = {"status": "RESOLVED", "resolution": "INVALID"};
    additionalActions.forEach(function(action) { action.filterAction(bugData); });
    postBugData(bugData);
  },
  extraActions: [
    {
      label: "Spammy",
      id: "spam",
      filterAction: function(d) {
        d.product = "Invalid Bugs";
        d.component = "General";
        d.comment = {body: INVALID_BUG_SPAM};
        d.version = 'unspecified';
        // FIXME: tag comment as spam:
        //doTagCommentSpam(gBugData.commentsdd
      },
    }
  ],
};

gFilters.push(gMarkAsInvalidFilter);

var gFixKeywordsFilter = {
  id: "fix-keywords",
  _words: {
    crash: "crash",
    "crash-stats.mozilla.com": "crashreportid",
    hang: "hang",
    freeze: "hang",
    "stopped working": ["regression", "regressionwindow-wanted"],
    broken: ["regression", "regressionwindow-wanted"],
    flash: "flashplayer",
  },
  _normalKeywords: new Set([
    "crash", "hang", "crashreportid", "steps-wanted", "stackwanted",
    "testcase", "testcase-wanted", "helpwanted", "pp",
    "regression", "regressionwindow-wanted", "addon-compat",
    "dev-doc-needed", "dev-doc-complete", "qawanted",
    "sec-low", "sec-moderate", "sec-high", "sec-critical", "sec-audit", "sec-want", "sec-other",
    "sec-vector", "sec-incident", "sec508",
    "meta",
    "flashplayer",
  ]),
  _hasSuggestedKeywords: function() {
    if (this.__suggestedKeywords) {
      return this.__suggestedKeywords;
    }
    this.__suggestedKeywords = [];
    var summary = gBugData.summary.toLowerCase();
    var self = this;
    for (var k in this._words) {
      var keywordsToAdd = this._words[k];
      if (!Array.isArray(keywordsToAdd)) {
        keywordsToAdd = [keywordsToAdd];
      }

      function bugHasKeyword(kw) {
        return gBugData.keywords.indexOf(kw) != -1;
      }
      if (summary.contains(k) && !keywordsToAdd.every(bugHasKeyword)) {
        this.__suggestedKeywords = this.__suggestedKeywords.concat(keywordsToAdd);
      }
    }
    return this.__suggestedKeywords.length > 0;
    // FIXME really want attachments & comments here to check for jsbin/fiddle/codepen link
  },
  _hasWeirdKeywords: function() {
    function isNormal(kw) {
      return !gFixKeywordsFilter._normalKeywords.has(kw);
    }
    return gBugData.keywords.filter(isNormal).length;
  },
  applyLikelihood: function() {
    // FIXME do something cleverer
    return 1;
  },
  applies: function() {
    return gBugData.status != "RESOLVED" &&
           (this._hasSuggestedKeywords() || this._hasWeirdKeywords());
  },
  onDoAction: function() {
  },
  createUI: function() {
    var div = document.createElement("div");
    var button = document.createElement("button");
    button.textContent = "Fix keywords";
    button.addEventListener("click", function(e) {
      var keywordField = document.querySelector("#keywords");
      var existingList = keywordField.value.split(',').map(function(s) { return s.trim(); });
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

on("data-loaded", createSuggestedActions)
fetchBugData();

gParentEl.querySelector('#triage-header').addEventListener('click', function(e) {
  toggleVisible(gContentEl);
}, false);

})();
