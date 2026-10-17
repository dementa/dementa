"use client";

import { Search, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { getApp, type AppDef, type AppId, type PowerAction } from "../apps";
import { AppTile, DementaLogo, FullscreenButton, useClock } from "../common";
import type { WinState } from "../windowManager";
import { StartMenu } from "./StartMenu";

export const TASKBAR_HEIGHT = 48;

/** Always on the taskbar, in this order (like pinned apps in Windows 11). */
const PINNED: AppId[] = ["files", "browser", "docs", "sheets", "slides", "assignments", "settings"];

interface Props {
  apps: AppDef[];
  windows: WinState[];
  activeId: AppId | undefined;
  onActivate: (id: AppId) => void;
  onOpen: (id: AppId) => void;
  /** Opens Files at a file (Recommended in the Start menu). */
  onOpenFile: (path: string) => void;
  onShowDesktop: () => void;
  onPower: (action: PowerAction) => void;
  /** Right-click on a taskbar app (appId) or on the empty taskbar (null). */
  onMenu: (e: MouseEvent, appId: AppId | null) => void;
}

const hover = "hover:bg-black/5 dark:hover:bg-white/10";

export function Taskbar(props: Props) {
  const { apps, windows, activeId, onActivate, onOpen, onPower, onMenu } = props;
  const [start, setStart] = useState<null | "menu" | "search">(null);
  const now = useClock();
  const online = useOnline();

  // Pinned apps first, then any other open apps.
  const running = new Set(windows.map((w) => w.appId));
  const shown = [...PINNED, ...windows.map((w) => w.appId).filter((id) => !PINNED.includes(id))].filter((id) =>
    apps.some((a) => a.id === id),
  );

  return (
    <>
      {start && (
        <StartMenu
          apps={apps}
          searchFirst={start === "search"}
          onClose={() => setStart(null)}
          onOpen={(id) => {
            setStart(null);
            onOpen(id);
          }}
          onOpenFile={(path) => {
            setStart(null);
            props.onOpenFile(path);
          }}
          onPower={onPower}
        />
      )}
      <nav
        className="absolute inset-x-0 bottom-0 z-[9000] flex items-center border-t border-black/5 bg-[#eef0f4]/85 text-black backdrop-blur-2xl dark:border-white/10 dark:bg-[#1c1c1c]/85 dark:text-white"
        style={{ height: TASKBAR_HEIGHT }}
        onContextMenu={(e) => onMenu(e, null)}
      >
        <span className="flex-1" />

        {/* Centre: Start, Search, pinned and open apps */}
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto px-1">
          <TaskbarButton label="Start" pressed={start === "menu"} onClick={() => setStart(start === "menu" ? null : "menu")}>
            <DementaLogo size={24} />
          </TaskbarButton>
          <TaskbarButton label="Search" pressed={start === "search"} onClick={() => setStart(start === "search" ? null : "search")}>
            <Search size={20} strokeWidth={2.2} />
          </TaskbarButton>
          {shown.map((id) => {
            const app = getApp(id);
            const isOpen = running.has(id);
            const isActive = id === activeId;
            return (
              <TaskbarButton
                key={id}
                label={app.name}
                pressed={isActive}
                onClick={() => (isOpen ? onActivate(id) : onOpen(id))}
                onContextMenu={(e) => onMenu(e, id)}
              >
                <AppTile app={app} size={26} />
                {isOpen && (
                  <span
                    className={`absolute bottom-0.5 left-1/2 h-[3px] -translate-x-1/2 rounded-full transition-all ${
                      isActive ? "w-4 bg-blue-600 dark:bg-sky-400" : "w-1.5 bg-black/40 dark:bg-white/50"
                    }`}
                  />
                )}
              </TaskbarButton>
            );
          })}
        </div>

        {/* Right: system tray, clock, show-desktop strip */}
        <div className="flex flex-1 items-center justify-end gap-0.5 self-stretch">
          <span
            title={online ? "Connected to the internet" : "No internet connection"}
            className={`hidden h-10 items-center rounded-md px-2 sm:flex ${hover}`}
          >
            {online ? <Wifi size={16} /> : <WifiOff size={16} className="text-red-500" />}
          </span>
          <span className={`hidden h-10 items-center rounded-md px-2 text-[11px] leading-tight sm:flex ${hover}`}>ENG</span>
          <FullscreenButton className={`flex h-10 w-9 items-center justify-center rounded-md ${hover}`} size={15} />
          {now && (
            <span className={`flex h-10 flex-col items-end justify-center rounded-md px-2 text-[12px] leading-tight ${hover}`}>
              <span>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span>{now.toLocaleDateString()}</span>
            </span>
          )}
          <button
            aria-label="Show desktop"
            title="Show desktop"
            onClick={props.onShowDesktop}
            className="ml-1 h-full w-2 border-l border-black/10 hover:bg-black/10 dark:border-white/15 dark:hover:bg-white/15"
          />
        </div>
      </nav>
    </>
  );
}

function TaskbarButton(props: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.pressed}
      onClick={props.onClick}
      onContextMenu={props.onContextMenu}
      className={`relative flex h-10 w-11 shrink-0 items-center justify-center rounded-md transition ${
        props.pressed ? "bg-black/[.07] dark:bg-white/15" : hover
      }`}
    >
      {props.children}
    </button>
  );
}

/** Whether the computer has an internet connection, kept up to date. */
function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}
