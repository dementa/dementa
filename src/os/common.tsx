"use client";

import { Maximize, Minimize } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppDef } from "./apps";
import { isFullscreen, toggleFullscreen } from "./fullscreen";

export function FullscreenButton({ size = 16, className = "" }: { size?: number; className?: string }) {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const sync = () => setFull(isFullscreen());
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);
  const label = full ? "Exit full screen" : "Full screen";
  return (
    <button aria-label={label} title={label} onClick={toggleFullscreen} className={className}>
      {full ? <Minimize size={size} /> : <Maximize size={size} />}
    </button>
  );
}

/** Dementa OS brand mark — our own logo, deliberately unlike Microsoft's or Apple's. */
export function DementaLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="dementa-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5ee7df" />
          <stop offset="0.5" stopColor="#6a8cff" />
          <stop offset="1" stopColor="#b46bff" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#dementa-g)" />
      <path d="M22 16h10a16 16 0 0 1 0 32H22z" fill="none" stroke="#fff" strokeWidth="6" strokeLinejoin="round" />
      <circle cx="31" cy="32" r="4" fill="#fff" />
    </svg>
  );
}

export function AppTile({ app, size = 48 }: { app: AppDef; size?: number }) {
  if (app.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={app.image}
        alt=""
        width={size}
        height={size}
        draggable={false}
        className="inline-block drop-shadow-md"
        style={{ width: size, height: size }}
      />
    );
  }
  const Icon = app.icon;
  return (
    <span
      className="inline-flex items-center justify-center shadow-md"
      style={{ width: size, height: size, borderRadius: size * 0.26, background: app.color }}
    >
      <Icon color="#fff" size={size * 0.55} strokeWidth={2} />
    </span>
  );
}

/** Small app icon for title bars and the taskbar: the app's picture if it has one. */
export function AppGlyph({ app, size, className = "" }: { app: AppDef; size: number; className?: string }) {
  if (app.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={app.image} alt="" width={size} height={size} draggable={false} className={className} />;
  }
  return <app.icon size={size} className={className} />;
}

export function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
