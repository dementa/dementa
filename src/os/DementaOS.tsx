"use client";

import {
  AppWindow,
  ArrowDownUp,
  ArrowLeftToLine,
  ArrowRightToLine,
  Copy,
  ExternalLink,
  Eye,
  FolderOpen,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  Maximize,
  Minus,
  MonitorDown,
  RefreshCw,
  Settings as SettingsIcon,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useReducer, useState, type MouseEvent } from "react";
import { APPS, getApp, READY_APPS, WALLPAPERS, type AppDef, type AppId, type OSStyle, type PowerAction, type Theme, type WallpaperId } from "./apps";
import { ComingSoon } from "./AppContent";
import { signOut, type Account } from "./account";
import { BootScreen } from "./BootScreen";
import { BrowserApp } from "./browser/BrowserApp";
import { AppTile } from "./common";
import { ContextMenu, menuAt, type MenuEntry, type OpenMenu } from "./ContextMenu";
import { DEFAULT_DESKTOP_VIEW, DesktopIcons, resetDesktopLayout, type DesktopView, type IconSort } from "./Desktop";
import { DocsApp, type DocsRequest } from "./docs/DocsApp";
import { PropertiesDialog, type PropertiesInfo } from "./PropertiesDialog";
import { FilesApp, type FilesRequest } from "./FilesApp";
import { SettingsApp } from "./SettingsApp";
import { enterFullscreen, exitFullscreen, isFullscreen, launchedFullscreen, toggleFullscreen } from "./fullscreen";
import { PowerScreen } from "./PowerScreen";
import { ShutdownScreen } from "./ShutdownScreen";
import { SignInScreen } from "./SignInScreen";
import { Dock, DOCK_RESERVED } from "./mac/Dock";
import { MenuBar, MENUBAR_HEIGHT } from "./mac/MenuBar";
import { Window } from "./Window";
import { initialWM, topWindow, wmReducer } from "./windowManager";
import { Taskbar, TASKBAR_HEIGHT } from "./windows/Taskbar";

const PREFS_KEY = "dementa-os:prefs";

interface Prefs {
  style: OSStyle;
  wallpaper: WallpaperId;
  theme: Theme;
  deviceName: string;
  desktop: DesktopView;
}

const DEFAULT_PREFS: Prefs = {
  style: "windows",
  wallpaper: "aurora",
  theme: "auto",
  deviceName: "DEMENTA-PC",
  desktop: DEFAULT_DESKTOP_VIEW,
};

function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    return {
      style: saved.style === "mac" ? "mac" : "windows",
      wallpaper: saved.wallpaper in WALLPAPERS ? saved.wallpaper : DEFAULT_PREFS.wallpaper,
      theme: ["light", "dark", "auto"].includes(saved.theme) ? saved.theme : DEFAULT_PREFS.theme,
      deviceName: typeof saved.deviceName === "string" && saved.deviceName.trim() ? saved.deviceName : DEFAULT_PREFS.deviceName,
      desktop: { ...DEFAULT_DESKTOP_VIEW, ...(typeof saved.desktop === "object" ? saved.desktop : {}) },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage can be blocked (private mode, browser policies); the choice just won't persist.
  }
}

export function DementaOS() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [phase, setPhase] = useState<"off" | "booting" | "signin" | "desktop" | "shutdown" | "restart">("off");
  /** Who's signed in; null when using Dementa without an account. */
  const [account, setAccount] = useState<Account | null>(null);
  const [wm, dispatch] = useReducer(wmReducer, initialWM);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  /** Bumped by the desktop's Refresh, which redraws the icons. */
  const [iconsKey, setIconsKey] = useState(0);
  const systemDark = useSystemDark();
  /** Set when something asks Files to show a particular file. */
  const [filesRequest, setFilesRequest] = useState<FilesRequest | null>(null);
  /** Set when Files asks Docs to open a document. */
  const [docsRequest, setDocsRequest] = useState<DocsRequest | null>(null);
  const [properties, setProperties] = useState<PropertiesInfo | null>(null);
  const closeProperties = useCallback(() => setProperties(null), []);

  useEffect(() => {
    setPrefs(loadPrefs());
    // In kiosk mode or the installed app the screen is already full, so boot straight away.
    if (launchedFullscreen()) setPhase("booting");
  }, []);

  const updatePrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...(p ?? DEFAULT_PREFS), ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const powerOn = useCallback(() => {
    enterFullscreen();
    setPhase("booting");
  }, []);
  const finishBoot = useCallback(() => setPhase("signin"), []);
  const finishSignIn = useCallback((signedIn: Account | null) => {
    setAccount(signedIn);
    setPhase("desktop");
  }, []);
  const finishShutdown = useCallback(() => {
    exitFullscreen();
    setPhase("off");
  }, []);
  const finishRestart = useCallback(() => setPhase("booting"), []);

  // Wait for saved prefs so the boot screen matches the chosen style.
  if (!prefs) return <div className="fixed inset-0 bg-black" />;
  if (phase === "off") return <PowerScreen onStart={powerOn} />;
  if (phase === "booting") return <BootScreen style={prefs.style} onDone={finishBoot} />;
  if (phase === "signin") return <SignInScreen wallpaper={prefs.wallpaper} onDone={finishSignIn} />;
  if (phase === "shutdown") return <ShutdownScreen mode="shutdown" onDone={finishShutdown} />;
  if (phase === "restart") return <ShutdownScreen mode="restart" onDone={finishRestart} />;

  const { style } = prefs;
  const dark = prefs.theme === "dark" || (prefs.theme === "auto" && systemDark);
  const insets =
    style === "windows" ? { top: 0, bottom: TASKBAR_HEIGHT } : { top: MENUBAR_HEIGHT, bottom: DOCK_RESERVED };
  const activeId = topWindow(wm)?.appId;

  const open = (appId: AppId) => dispatch({ type: "open", appId, vw: window.innerWidth, vh: window.innerHeight });
  const activate = (appId: AppId) => dispatch({ type: "activate", appId });
  const apps = APPS;
  const power = (mode: PowerAction) => {
    dispatch({ type: "closeAll" });
    if (mode !== "signout") return setPhase(mode);
    setAccount(null);
    setPhase("signin");
    signOut().catch(() => {
      // Offline: the sign-in screen still shows; the cloud forgets the sign-in when it expires.
    });
  };

  // ---- Right-click menus ----

  const wallpaperIds = Object.keys(WALLPAPERS) as WallpaperId[];
  const nextWallpaper = () =>
    updatePrefs({ wallpaper: wallpaperIds[(wallpaperIds.indexOf(prefs.wallpaper) + 1) % wallpaperIds.length] });

  const view = prefs.desktop;
  const setView = (patch: Partial<DesktopView>) => updatePrefs({ desktop: { ...view, ...patch } });
  const sortIcons = (sortBy: IconSort) => {
    setView({ sortBy });
    resetDesktopLayout(style);
    setIconsKey((k) => k + 1);
  };

  const desktopMenu = (): MenuEntry[] => [
    {
      label: "View",
      icon: Eye,
      submenu: [
        { label: "Large icons", checked: view.iconSize === "large", onSelect: () => setView({ iconSize: "large" }) },
        { label: "Medium icons", checked: view.iconSize === "medium", onSelect: () => setView({ iconSize: "medium" }) },
        { label: "Small icons", checked: view.iconSize === "small", onSelect: () => setView({ iconSize: "small" }) },
        "divider",
        { label: "Auto arrange icons", checked: view.autoArrange, onSelect: () => setView({ autoArrange: !view.autoArrange }) },
        { label: "Show desktop icons", checked: view.showIcons, onSelect: () => setView({ showIcons: !view.showIcons }) },
      ],
    },
    {
      label: "Sort by",
      icon: ArrowDownUp,
      submenu: [
        { label: "Name", checked: view.sortBy === "name", onSelect: () => sortIcons("name") },
        { label: "Item type", checked: view.sortBy === "type", onSelect: () => sortIcons("type") },
        { label: "Default order", checked: view.sortBy === "default", onSelect: () => sortIcons("default") },
      ],
    },
    { label: "Refresh", icon: RefreshCw, onSelect: () => setIconsKey((k) => k + 1) },
    "divider",
    { label: "Open Files", icon: FolderOpen, onSelect: () => open("files") },
    "divider",
    { label: "Change wallpaper…", icon: ImageIcon, onSelect: () => open("settings") },
    { label: "Next wallpaper", icon: ImageIcon, onSelect: nextWallpaper },
    { label: "Personalise…", icon: SettingsIcon, onSelect: () => open("settings") },
    "divider",
    { label: "Show desktop", icon: MonitorDown, onSelect: () => dispatch({ type: "minimizeAll" }), disabled: !wm.windows.length },
    { label: isFullscreen() ? "Exit full screen" : "Full screen", icon: Maximize, onSelect: toggleFullscreen },
    {
      label: "Arrange icons",
      icon: LayoutGrid,
      onSelect: () => {
        resetDesktopLayout(style);
        setIconsKey((k) => k + 1);
      },
    },
  ];

  const appProperties = (app: AppDef): PropertiesInfo => ({
    name: app.name,
    icon: <AppTile app={app} size={48} />,
    rows: [
      ["Type", "Application"],
      ["Category", app.kind],
      ["Description", app.blurb],
      "divider",
      ["Location", "Dementa OS › Desktop"],
      ["Status", READY_APPS.has(app.id) ? "Ready" : "Coming soon"],
      ["Opens at", app.size ? `${app.size.w} × ${app.size.h}` : "600 × 420"],
    ],
    action: { label: "Open", onClick: () => open(app.id) },
  });

  const iconMenu = (app: AppDef): MenuEntry[] => [
    { label: "Open", icon: ExternalLink, onSelect: () => open(app.id) },
    "divider",
    { label: "Properties", icon: Info, onSelect: () => setProperties(appProperties(app)) },
  ];

  /** Window actions, shared by the title bar, the taskbar and the dock. */
  const windowMenu = (appId: AppId): MenuEntry[] => {
    const win = wm.windows.find((w) => w.appId === appId);
    if (!win) return [{ label: `Open ${getApp(appId).name}`, icon: ExternalLink, onSelect: () => open(appId) }];
    const fixed = win.maximized || win.snap !== null;
    return [
      win.minimized
        ? { label: "Restore", icon: AppWindow, onSelect: () => activate(appId) }
        : { label: "Minimise", icon: Minus, onSelect: () => dispatch({ type: "minimize", appId }) },
      fixed
        ? { label: "Restore size", icon: Copy, onSelect: () => dispatch({ type: "toggleMax", appId }) }
        : { label: "Maximise", icon: Square, onSelect: () => dispatch({ type: "snap", appId, snap: "max" }) },
      { label: "Snap left", icon: ArrowLeftToLine, onSelect: () => dispatch({ type: "snap", appId, snap: "left" }) },
      { label: "Snap right", icon: ArrowRightToLine, onSelect: () => dispatch({ type: "snap", appId, snap: "right" }) },
      "divider",
      { label: "Close", icon: X, danger: true, hint: style === "windows" ? "Alt+F4" : "⌘W", onSelect: () => dispatch({ type: "close", appId }) },
    ];
  };

  const showMenu = (e: MouseEvent, items: MenuEntry[]) => setMenu(menuAt(e, items));

  return (
    <main
      className={`desktop-in fixed inset-0 overflow-hidden select-none ${dark ? "dark" : ""}`}
      style={{ background: WALLPAPERS[prefs.wallpaper].css }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <DesktopIcons
        key={iconsKey}
        apps={apps}
        style={style}
        view={view}
        insets={insets}
        onOpen={open}
        onMenu={(e, app: AppDef | null) => showMenu(e, app ? iconMenu(app) : desktopMenu())}
      />

      {wm.windows.map((win) => (
        <Window
          key={win.appId}
          win={win}
          style={style}
          active={win.appId === activeId}
          insets={insets}
          onFocus={() => dispatch({ type: "focus", appId: win.appId })}
          onClose={() => dispatch({ type: "close", appId: win.appId })}
          onMinimize={() => dispatch({ type: "minimize", appId: win.appId })}
          onToggleMax={() => dispatch({ type: "toggleMax", appId: win.appId })}
          onMove={(x, y) => dispatch({ type: "move", appId: win.appId, x, y })}
          onResize={(x, y, w, h) => dispatch({ type: "resize", appId: win.appId, x, y, w, h })}
          onSnap={(snap) => dispatch({ type: "snap", appId: win.appId, snap })}
          onUnsnap={(x, y) => dispatch({ type: "unsnap", appId: win.appId, x, y })}
          onTitleMenu={(e) => {
            dispatch({ type: "focus", appId: win.appId });
            showMenu(e, windowMenu(win.appId));
          }}
        >
          {win.appId === "settings" ? (
            <SettingsApp
              style={style}
              wallpaper={prefs.wallpaper}
              theme={prefs.theme}
              deviceName={prefs.deviceName}
              onStyle={(s) => updatePrefs({ style: s })}
              onWallpaper={(w) => updatePrefs({ wallpaper: w })}
              onTheme={(t) => updatePrefs({ theme: t })}
              onRename={(name) => updatePrefs({ deviceName: name })}
              onPower={power}
              onOpen={open}
            />
          ) : win.appId === "files" ? (
            <FilesApp
              request={filesRequest}
              onOpenDocument={(path) => {
                setDocsRequest({ path, nonce: Date.now() });
                open("docs");
              }}
            />
          ) : win.appId === "docs" ? (
            <DocsApp request={docsRequest} />
          ) : win.appId === "browser" ? (
            <BrowserApp onActivate={() => dispatch({ type: "focus", appId: "browser" })} />
          ) : (
            <ComingSoon appId={win.appId} />
          )}
        </Window>
      ))}

      {style === "windows" ? (
        <Taskbar
          apps={apps}
          windows={wm.windows}
          activeId={activeId}
          onActivate={activate}
          onOpen={open}
          onPower={power}
          account={account}
          onOpenFile={(path) => {
            setFilesRequest({ path, nonce: Date.now() });
            open("files");
          }}
          onShowDesktop={() => dispatch({ type: "minimizeAll" })}
          onMenu={(e, appId) =>
            showMenu(
              e,
              appId
                ? windowMenu(appId)
                : [
                    { label: "Show desktop", icon: MonitorDown, onSelect: () => dispatch({ type: "minimizeAll" }), disabled: !wm.windows.length },
                    "divider",
                    { label: "Settings", icon: SettingsIcon, onSelect: () => open("settings") },
                  ],
            )
          }
        />
      ) : (
        <>
          <MenuBar activeId={activeId} onOpen={open} onPower={power} account={account} />
          <Dock apps={apps} windows={wm.windows} onActivate={activate} onOpen={open} onMenu={(e, appId) => showMenu(e, windowMenu(appId))} />
        </>
      )}

      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
      {properties && <PropertiesDialog info={properties} onClose={closeProperties} />}
    </main>
  );
}

/** Whether the computer itself is set to dark mode (for the "Auto" appearance). */
function useSystemDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setDark(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return dark;
}
