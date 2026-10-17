"use client";

import { useEffect, useState } from "react";
import type { OSStyle } from "./apps";
import { DementaLogo } from "./common";

const BOOT_MS = 2600;
const WELCOME_MS = 900;

export function BootScreen({ style, onDone }: { style: OSStyle; onDone: () => void }) {
  const [welcome, setWelcome] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setWelcome(true), BOOT_MS);
    const t2 = setTimeout(onDone, BOOT_MS + WELCOME_MS);
    const skip = () => onDone();
    window.addEventListener("keydown", skip);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("keydown", skip);
    };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 flex cursor-pointer flex-col items-center justify-center bg-black text-white select-none"
      onClick={onDone}
      role="button"
      aria-label="Starting Dementa OS. Click to skip."
    >
      {welcome ? (
        <p className="boot-fade text-4xl font-light tracking-wide">Welcome</p>
      ) : (
        <>
          <div className="boot-fade">
            <DementaLogo size={112} />
          </div>
          <p className="boot-fade mt-6 text-xl font-medium tracking-wide opacity-90">Dementa OS</p>
          <div className="mt-12 h-10">
            {style === "windows" ? (
              <div className="boot-dots" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />
                ))}
              </div>
            ) : (
              <div className="h-1.5 w-52 overflow-hidden rounded-full bg-white/20">
                <div className="boot-bar h-full rounded-full bg-white" style={{ animationDuration: `${BOOT_MS}ms` }} />
              </div>
            )}
          </div>
        </>
      )}
      <p className="absolute bottom-6 text-xs text-white/40">Click or press any key to skip</p>
    </div>
  );
}
