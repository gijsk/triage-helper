// NB: loaded once for each bugzilla show_bug.cgi page
/* Avoid interfering with bugzilla itself by wrapping in anon fn: */
(function() {
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

function fetchBugData() {
  var xhr = new XMLHttpRequest();
  var url = location.protocol + "//" + location.host + "/rest/bug/" + gBugID;
  xhr.open("GET", url);
  xhr.setRequestHeader("Accept", "application/json");
  xhr.responseType = "json";
  xhr.onload = onBugzillaData;
  xhr.onerror = onNoBugzillaData;
  xhr.send();
}

function createSuggestionUI(filter) {
  var el = document.createElement("li");
  el.className = "bz-triage-suggestion";
  el.id = "bz-triage-suggestion-" + filter.id;
  var button = document.createElement("button");
  button.className = "bz-triage-suggestion-btn";
  button.textContent = filter.label;
  button.addEventListener('click', function(e) {
    filter.onDoAction();
  }, false);
  el.appendChild(button);
  gSuggestionList.appendChild(el);
}

function createSuggestedActions() {
  gSuggestionList = document.createElement("ol");
  gSuggestionList.id = "bz-triage-suggestions";
  toggleVisible(gContentEl, false);
  gContentEl.textContent = "Suggested actions:";
  for (var i = 0; i < gFilters.length; i++) {
    var filter = gFilters[i];
    if (filter.applies()) {
      createSuggestionUI(filter);
    }
  }
  gContentEl.appendChild(gSuggestionList);
}

var gFilters = [];

var gMarkAsInvalidFilter = {
  id: "mark-invalid",
  applies: function() {
    // FIXME do something cleverer
    return true;
  },
  label: "Mark as invalid",
  onDoAction: function() {
    alert("Go mark the bug invalid!");
  }
};

gFilters.push(gMarkAsInvalidFilter);

on("data-loaded", createSuggestedActions)
fetchBugData();

gParentEl.querySelector('#triage-header').addEventListener('click', function(e) {
  toggleVisible(gContentEl);
}, false);

})();
