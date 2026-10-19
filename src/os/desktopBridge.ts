// Bridge to the Dementa OS Windows app (Electron). See electron/preload.cjs.
// In the web version `window.dementa` is undefined.

export interface DementaBridge {
  isDesktop: true;
  /** Called when the app blocks a website's navigation (link to an unapproved address). */
  onNavigationBlocked: (callback: (webContentsId: number, host: string) => void) => () => void;
  /**
   * Signs the app's requests to the Dementa cloud at `cloud` (pictures and downloads too), or stops
   * when null. The desktop app can't use the cloud's sign-in cookie, so it sends this token instead.
   */
  setCloudSignIn: (signIn: { cloud: string; token: string } | null) => void;
}

declare global {
  interface Window {
    dementa?: DementaBridge;
  }
}

export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && Boolean(window.dementa?.isDesktop);
}
