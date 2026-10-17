// Browsers only allow full screen in response to a click or key press, so these must be
// called from an event handler. Errors are swallowed: some devices (e.g. iPhone Safari)
// don't support the Fullscreen API, and the OS still works in a normal window there.

type WebkitDocument = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => void };

export function isFullscreen(): boolean {
  const doc = document as WebkitDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

/**
 * True when the browser itself is already full screen: Chrome/Edge kiosk mode, F11, or the
 * installed app (manifest display "fullscreen"/"standalone"). Then no click is needed to start.
 */
export function launchedFullscreen(): boolean {
  const mode = (m: string) => window.matchMedia(`(display-mode: ${m})`).matches;
  // Fallback for kiosk mode: the page covers the entire physical screen (no browser bars or taskbar).
  const coversScreen = window.innerWidth >= screen.width && window.innerHeight >= screen.height;
  return isFullscreen() || mode("fullscreen") || mode("standalone") || coversScreen;
}

export function enterFullscreen() {
  if (isFullscreen()) return;
  const el = document.documentElement as WebkitElement;
  try {
    if (el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    else el.webkitRequestFullscreen?.();
  } catch {
    // Unsupported — carry on in a normal window.
  }
}

export function toggleFullscreen() {
  if (isFullscreen()) exitFullscreen();
  else enterFullscreen();
}

export function exitFullscreen() {
  if (!isFullscreen()) return;
  const doc = document as WebkitDocument;
  try {
    if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
    else doc.webkitExitFullscreen?.();
  } catch {
    // Ignore.
  }
}
