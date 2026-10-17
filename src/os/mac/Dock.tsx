"use client";

import type { MouseEvent } from "react";
import { type AppDef, type AppId } from "../apps";
import { AppTile } from "../common";
import type { WinState } from "../windowManager";

/** Space reserved at the bottom of the screen so maximised windows stop above the dock. */
export const DOCK_RESERVED = 84;

interface Props {
  apps: AppDef[];
  windows: WinState[];
  onActivate: (id: AppId) => void;
  onOpen: (id: AppId) => void;
  onMenu: (e: MouseEvent, appId: AppId) => void;
}

export function Dock({ apps, windows, onActivate, onOpen, onMenu }: Props) {
  const dockApps = apps.filter((a) => a.id !== "trash");
  const trash = apps.find((a) => a.id === "trash")!;

  const icon = (app: AppDef) => {
    const running = windows.some((w) => w.appId === app.id);
    return (
      <button
        key={app.id}
        aria-label={app.name}
        title={app.name}
        onClick={() => (running ? onActivate(app.id) : onOpen(app.id))}
        onContextMenu={(e) => onMenu(e, app.id)}
        className="dock-item relative flex flex-col items-center"
      >
        <AppTile app={app} size={48} />
        <span className={`mt-1 h-1 w-1 rounded-full bg-black/70 dark:bg-white/80 ${running ? "" : "invisible"}`} />
      </button>
    );
  };

  return (
    <nav className="absolute bottom-2 left-1/2 z-[9000] max-w-[calc(100vw-16px)] -translate-x-1/2">
      <div className="dock-scroll flex items-end gap-2 overflow-x-auto rounded-2xl border border-white/30 bg-white/25 px-2.5 dark:border-white/10 dark:bg-black/30 pt-2 pb-1 backdrop-blur-xl sm:overflow-visible">
        {dockApps.map(icon)}
        <span className="mx-1 mb-3 h-10 w-px shrink-0 self-center bg-black/20 dark:bg-white/20" />
        {icon(trash)}
      </div>
    </nav>
  );
}
