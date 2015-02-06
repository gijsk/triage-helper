const {interfaces: Ci, utils: Cu, classes: Cc} = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const kAddonPackageID = "triage-helper";
const kBootstrapModuleURL = "chrome://" + kAddonPackageID + "/content/BootstrapModule.jsm";
XPCOMUtils.defineLazyModuleGetter(this, "BootstrapModule", kBootstrapModuleURL);

function safe(fn) {
  try {
    fn();
  } catch (ex) {
    Cu.reportError(ex);
  }
}

function startup(data,reason) {
    safe(() => BootstrapModule.startup());  // Do whatever initial startup stuff you need to do

    forEachOpenWindow(safe((w) => BootstrapModule.loadIntoWindow(w)));
    Services.wm.addListener(WindowListener);
}
function shutdown(data,reason) {
    if (reason == APP_SHUTDOWN)
        return;

    forEachOpenWindow(safe((w) => BootstrapModule.unloadFromWindow(w)));
    Services.wm.removeListener(WindowListener);

    safe(() => BootstrapModule.shutdown());  // Do whatever shutdown stuff you need to do on addon disable

    Components.utils.unload(kBootstrapModuleURL);

    // HACK WARNING: The Addon Manager does not properly clear all addon related caches on update;
    //               in order to fully update images and locales, their caches need clearing here
    Services.obs.notifyObservers(null, "chrome-flush-caches", null);
}
function install(data,reason) { }
function uninstall(data,reason) { }
function forEachOpenWindow(todo)  // Apply a function to all open browser windows
{
    var windows = Services.wm.getEnumerator("navigator:browser");
    while (windows.hasMoreElements())
        todo(windows.getNext().QueryInterface(Components.interfaces.nsIDOMWindow));
}
var WindowListener =
{
    onOpenWindow: function(xulWindow)
    {
        var window = xulWindow.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                              .getInterface(Components.interfaces.nsIDOMWindow);
        function onWindowLoad()
        {
            window.removeEventListener("load",onWindowLoad);
            if (window.document.documentElement.getAttribute("windowtype") == "navigator:browser")
                BootstrapModule.loadIntoWindow(window);
        }
        window.addEventListener("load",onWindowLoad);
    },
    onCloseWindow: function(xulWindow) { },
    onWindowTitleChange: function(xulWindow, newTitle) { }
};
