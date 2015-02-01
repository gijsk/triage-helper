// NB: loaded once for each bugzilla show_bug.cgi page
/* Avoid interfering with bugzilla itself by wrapping in anon fn: */
(function() {
var gParentEl = document.getElementById("bz-triage-helper-container");
var gMsgEl = gParentEl.querySelector('#triage-tools');
var gBugID = (new URLSearchParams(location.search.substr(1))).get('id');
var gBugData = null;


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
  gMsgEl.textContent = msg;
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
  gBugData = rsp;
  pub("data-loaded", gBugData);
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

function createSuggestedActions() {
  gParentEl.classList.add('loaded');
  console.log(gBugData);
}

on("data-loaded", createSuggestedActions)
fetchBugData();



})();
