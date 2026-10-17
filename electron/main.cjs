// Dementa OS for Windows (Electron).
//
// Runs the Dementa OS web app from local files (out/, built with DEMENTA_TARGET=desktop) in a
// full-screen kiosk window. Its browser app uses <webview>, which can show sites like ChatGPT and
// GitHub that refuse to appear inside web pages. Every navigation is checked here against the
// approved list in src/os/browser/hosts.json, and nothing can open outside Dementa OS.
//
// Environment:
//   DEMENTA_KIOSK=0     windowed instead of full-screen kiosk (for testing)
//   DEMENTA_SELFTEST=1  run the automated check in electron/selftest.cjs, then quit
//
// Exit shortcut: Ctrl+Shift+Alt+Q (on a Mac: Control+Shift+Option+Q)

const { app, BrowserWindow, net, powerMonitor, protocol, session } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const hosts = require("../src/os/browser/hosts.json");

const OUT_DIR = path.join(__dirname, "..", "out");
const APP_ORIGIN = "app://dementa";
const BROWSER_PARTITION = "persist:dementa-browser";
const SELFTEST = process.env.DEMENTA_SELFTEST === "1";
const KIOSK = process.env.DEMENTA_KIOSK !== "0" && !SELFTEST;

const ALLOWED_HOSTS = [...hosts.embeddable, ...hosts.appOnly, ...hosts.signIn];

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

/** In kiosk mode only the exit shortcut (or the computer shutting down) may quit. */
let allowQuit = !KIOSK;

function isAllowed(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return false;
    return ALLOWED_HOSTS.some((h) =>
      h.startsWith("*.") ? url.hostname.endsWith(h.slice(1)) : url.hostname === h || url.hostname === `www.${h}`,
    );
  } catch {
    return false;
  }
}

function hostOf(rawUrl) {
  try {
    return new URL(rawUrl).hostname || rawUrl;
  } catch {
    return rawUrl;
  }
}

/** Serves out/ at app://dementa/ so the exported site's absolute paths (/_next/...) work. */
async function serveApp(request) {
  const { pathname } = new URL(request.url);
  let file = path.normalize(path.join(OUT_DIR, decodeURIComponent(pathname)));
  if (!file.startsWith(OUT_DIR)) return new Response("Not found", { status: 404 });
  if (!path.extname(file)) file = path.join(file, "index.html");
  try {
    return await net.fetch(pathToFileURL(file).toString());
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

/** Exit shortcut, listened for in Dementa OS and inside websites. */
function watchExitShortcut(contents) {
  contents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.control && input.shift && input.alt && input.key.toLowerCase() === "q") {
      allowQuit = true;
      app.quit();
    }
  });
}

function guardWebsite(contents) {
  const block = (url) => contents.hostWebContents?.send("dementa:navigation-blocked", contents.id, hostOf(url));

  // Links to unapproved addresses show the "not on the allowed list" page instead.
  const guard = (event) => {
    if (event.isMainFrame === false || isAllowed(event.url)) return;
    event.preventDefault();
    block(event.url);
  };
  contents.on("will-navigate", guard);
  contents.on("will-redirect", guard);

  // "Open in new window" links stay in the same tab; nothing opens outside Dementa OS.
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowed(url)) contents.loadURL(url);
    else block(url);
    return { action: "deny" };
  });

  watchExitShortcut(contents);
}

function guardDementa(contents) {
  // Websites get no access to the computer, and only approved addresses can be loaded.
  contents.on("will-attach-webview", (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    if (!isAllowed(params.src)) event.preventDefault();
  });
  contents.on("will-navigate", (event) => {
    if (!event.url.startsWith(APP_ORIGIN)) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  watchExitShortcut(contents);
}

function setUpBrowserSession() {
  const browser = session.fromPartition(BROWSER_PARTITION);

  // Present as ordinary Chrome; some sign-in pages refuse browsers that say "Electron".
  browser.setUserAgent(browser.getUserAgent().replace(/ (Electron|dementa-office)\/\S+/g, ""));

  // No camera, microphone, location or notifications for websites; full screen video is fine.
  browser.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(["fullscreen", "clipboard-sanitized-write"].includes(permission)),
  );

  // Downloads would leave files outside Dementa OS.
  browser.on("will-download", (event) => event.preventDefault());
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: !SELFTEST,
    kiosk: KIOSK,
    fullscreen: KIOSK,
    backgroundColor: "#000000",
    title: "Dementa OS",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      webviewTag: true,
      backgroundThrottling: !SELFTEST,
      devTools: !app.isPackaged,
    },
  });
  win.removeMenu();

  // In kiosk mode Alt+F4, Cmd+Q and the close button do nothing; only the exit shortcut quits.
  win.on("close", (event) => {
    if (!allowQuit) event.preventDefault();
  });

  win.loadURL(`${APP_ORIGIN}/`);
  return win;
}

app.on("web-contents-created", (_event, contents) => {
  if (contents.getType() === "webview") guardWebsite(contents);
  else guardDementa(contents);
});

app.on("second-instance", () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) win.focus();
});

app.whenReady().then(() => {
  protocol.handle("app", serveApp);
  setUpBrowserSession();

  // Start Dementa OS automatically when the user signs in to the computer.
  if (app.isPackaged && ["win32", "darwin"].includes(process.platform)) app.setLoginItemSettings({ openAtLogin: true });

  // Never block the computer itself from shutting down or restarting.
  powerMonitor.on("shutdown", () => {
    allowQuit = true;
    app.quit();
  });

  const win = createWindow();
  if (SELFTEST) require("./selftest.cjs").run(win);
});

app.on("before-quit", (event) => {
  if (!allowQuit) event.preventDefault();
});

app.on("window-all-closed", () => app.quit());
