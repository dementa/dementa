"use client";

import { Power } from "lucide-react";
import { useEffect } from "react";

/** "Switched off" screen. The child's first press is the user gesture browsers need for full screen. */
export function PowerScreen({ onStart }: { onStart: () => void }) {
  useEffect(() => {
    window.addEventListener("keydown", onStart);
    return () => window.removeEventListener("keydown", onStart);
  }, [onStart]);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-black text-white select-none">
      <button
        autoFocus
        onClick={onStart}
        aria-label="Turn on Dementa OS"
        className="power-pulse flex h-32 w-32 items-center justify-center rounded-full border-2 border-white/30 bg-white/5 text-white/90 transition hover:border-white/70 hover:bg-white/10 focus-visible:ring-4 focus-visible:ring-cyan-300/60 focus-visible:outline-none"
      >
        <Power size={56} strokeWidth={2.2} />
      </button>
      <p className="text-lg text-white/70">Press to start</p>
    </div>
  );
}
