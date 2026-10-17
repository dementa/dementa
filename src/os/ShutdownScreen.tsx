"use client";

import { useEffect } from "react";

const DURATION_MS = 2000;

/** Shown while the OS "shuts down" or "restarts". */
export function ShutdownScreen({ mode, onDone }: { mode: "shutdown" | "restart"; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, DURATION_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="shutdown-in fixed inset-0 flex flex-col items-center justify-center gap-8 bg-[#0b1430] text-white select-none">
      <div className="boot-dots" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </div>
      <p className="text-2xl font-light tracking-wide" role="status">
        {mode === "shutdown" ? "Shutting down…" : "Restarting…"}
      </p>
    </div>
  );
}
