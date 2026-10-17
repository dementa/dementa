"use client";

import { useEffect, useState } from "react";
import { getApp, type AppId, type PowerAction } from "../apps";
import { DementaLogo, FullscreenButton, useClock } from "../common";

export const MENUBAR_HEIGHT = 28;

interface Props {
  activeId: AppId | undefined;
  onOpen: (id: AppId) => void;
  onPower: (action: PowerAction) => void;
}

export function MenuBar({ activeId, onOpen, onPower }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const now = useClock();

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const item = (label: string, action: () => void) => (
    <button
      onClick={() => {
        setMenuOpen(false);
        action();
      }}
      className="block w-full rounded px-3 py-1 text-left hover:bg-blue-500 hover:text-white"
    >
      {label}
    </button>
  );

  return (
    <>
      <nav
        className="absolute inset-x-0 top-0 z-[9000] flex items-center gap-4 bg-white/30 px-3 text-[13px] text-black backdrop-blur-xl dark:bg-black/35 dark:text-white"
        style={{ height: MENUBAR_HEIGHT }}
      >
        <button aria-label="Dementa menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)} className="flex items-center">
          <DementaLogo size={17} />
        </button>
        <span className="font-bold">{activeId ? getApp(activeId).name : "Desktop"}</span>
        <span className="flex-1" />
        <FullscreenButton size={14} className="flex items-center opacity-80 hover:opacity-100" />
        {now && (
          <span>
            {now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}{" "}
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </nav>
      {menuOpen && (
        <>
          <div className="absolute inset-0 z-[9001]" onPointerDown={() => setMenuOpen(false)} />
          <div
            className="menu-pop absolute left-2 z-[9002] w-56 rounded-lg border border-black/10 bg-white/85 p-1 text-[13px] text-black shadow-xl dark:border-white/10 dark:bg-zinc-800/90 dark:text-white backdrop-blur-xl"
            style={{ top: MENUBAR_HEIGHT + 2 }}
          >
            {item("Settings…", () => onOpen("settings"))}
            <hr className="my-1 border-black/10 dark:border-white/10" />
            {item("Restart…", () => onPower("restart"))}
            {item("Shut Down…", () => onPower("shutdown"))}
          </div>
        </>
      )}
    </>
  );
}
