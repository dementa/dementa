"use client";

// Terminal: a real Linux (6.8, with busybox) running inside Dementa, in the browser. v86 emulates the
// computer; xterm.js shows its console. The signed-in account's Dementa files are in ~/files
// (cloudFs.ts), so commands work on the same files as Files and Docs.
//
// The Linux and its BIOS are served from public/v86/ (see the README there).

import "@xterm/xterm/css/xterm.css";
import type { V86 } from "v86";
import { useEffect, useRef, useState } from "react";
import type { Account } from "../account";
import { CloudFs } from "./cloudFs";

declare global {
  interface Window {
    V86?: typeof V86;
  }
}

/**
 * v86 as its own script (public/v86/libv86.js) instead of part of Dementa's code: its module
 * version mentions Node's own modules, which the web build can't handle.
 */
function loadV86(): Promise<typeof V86> {
  if (window.V86) return Promise.resolve(window.V86);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/v86/libv86.js";
    script.onload = () => (window.V86 ? resolve(window.V86) : reject(new Error("v86 didn't load")));
    script.onerror = () => reject(new Error("v86 didn't load"));
    document.head.append(script);
  });
}

/** Printed by the start-up command once the shell is ready (a window-title code, so it's never seen). */
const READY = "\x1b]0;dementa-ready\x07";

type Phase = { kind: "loading"; percent: number | null } | { kind: "starting" } | { kind: "ready" } | { kind: "error"; message: string };

export function TerminalApp({ account }: { account: Account | null }) {
  const host = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading", percent: null });

  useEffect(() => {
    let disposed = false;
    let emulator: V86 | null = null;
    let cleanup = () => {};

    (async () => {
      const [{ Terminal }, { FitAddon }, V86Class] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit"), loadV86()]);
      if (disposed || !host.current) return;

      const term = new Terminal({
        cursorBlink: true,
        fontFamily: '"Cascadia Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace',
        fontSize: 13,
        scrollback: 5000,
        theme: { background: "#0c0f14", foreground: "#d8dee9", cursor: "#9ec5ff", selectionBackground: "#3b4b66" },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host.current);
      fit.fit();
      const resize = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {
          // Not laid out yet (minimised window).
        }
      });
      resize.observe(host.current);

      const fs = account ? new CloudFs() : null;
      const emu = new V86Class({
        wasm_path: "/v86/v86.wasm",
        memory_size: 128 * 1024 * 1024,
        vga_memory_size: 2 * 1024 * 1024,
        bios: { url: "/v86/seabios.bin" },
        vga_bios: { url: "/v86/vgabios.bin" },
        bzimage: { url: "/v86/buildroot-bzimage68.bin" },
        cmdline: "tsc=reliable mitigations=off random.trust_cpu=on",
        // The account's files; without an account, an empty folder that's gone when the Terminal closes.
        filesystem: fs ? { handle9p: fs.handle } : {},
        screen_container: null,
        disable_keyboard: true,
        disable_mouse: true,
        disable_speaker: true,
        autostart: true,
      });
      emulator = emu;

      emu.add_listener("download-progress", (e) => {
        if (e.file_name.includes("bzimage") && e.lengthComputable) setPhase({ kind: "loading", percent: Math.round((e.loaded / e.total) * 100) });
      });
      emu.add_listener("download-error", () => setPhase({ kind: "error", message: "Couldn't download Linux. Check the internet connection and open Terminal again." }));
      emu.add_listener("emulator-started", () => setPhase((p) => (p.kind === "loading" ? { kind: "starting" } : p)));

      // Until the shell is ready, its output is watched for the prompt instead of shown.
      let boot = "";
      let setUp = false;
      let ready = false;
      let queue: number[] = [];
      let flushing = false;
      const flush = () => {
        flushing = false;
        term.write(new Uint8Array(queue));
        queue = [];
      };

      emu.add_listener("serial0-output-byte", (byte: number) => {
        if (ready) {
          queue.push(byte);
          if (!flushing) {
            flushing = true;
            requestAnimationFrame(flush);
          }
          return;
        }
        boot += String.fromCharCode(byte);
        if (!setUp && boot.endsWith("~% ")) {
          setUp = true;
          boot = "";
          const files = fs ? "/root/files" : "/root";
          emu.serial0_send(
            `hostname dementa; export HOME=/root PS1='\\u@\\h:\\w\\$ '; ln -sfn /mnt /root/files; cd ${files}; ` +
              `stty rows ${term.rows} cols ${term.cols}; clear; printf '\\033]0;dementa-ready\\007'\n`,
          );
          return;
        }
        const at = boot.indexOf(READY);
        if (setUp && at >= 0) {
          ready = true;
          term.write(
            "\x1b[1;36mDementa Terminal\x1b[0m: Linux 6.8 with busybox, running in this window.\r\n" +
              (fs
                ? "Your Dementa files are in \x1b[1m~/files\x1b[0m (the same as in the Files app).\r\n"
                : "Sign in to Dementa to see your files in ~/files. For now it's an empty folder that's cleared when Terminal closes.\r\n") +
              "Type \x1b[1mhelp\x1b[0m to see the shell's commands, or \x1b[1mls /bin\x1b[0m for the programs.\r\n\r\n",
          );
          // The prompt came after the ready code.
          for (const ch of boot.slice(at + READY.length)) queue.push(ch.charCodeAt(0));
          flush();
          setPhase({ kind: "ready" });
          term.focus();
        }
      });

      // Key presses go to Linux as bytes (UTF-8 for letters beyond English).
      const typing = term.onData((data) => {
        if (!ready) return;
        emu.serial0_send(String.fromCharCode(...new TextEncoder().encode(data)));
      });

      cleanup = () => {
        typing.dispose();
        resize.disconnect();
        term.dispose();
      };
    })().catch((error) => {
      console.error(error);
      if (!disposed) setPhase({ kind: "error", message: "Terminal couldn't start on this computer." });
    });

    return () => {
      disposed = true;
      cleanup();
      emulator?.destroy().catch(() => {});
    };
  }, [account]);

  return (
    <div className="relative h-full bg-[#0c0f14] p-1.5" onMouseDown={() => host.current?.querySelector("textarea")?.focus()}>
      <div ref={host} className="h-full w-full select-text" />
      {phase.kind !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0c0f14] text-sm text-slate-300">
          {phase.kind === "error" ? (
            <p className="max-w-xs text-center text-red-300">{phase.message}</p>
          ) : (
            <>
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400" />
              <p>
                {phase.kind === "loading"
                  ? `Downloading Linux${phase.percent !== null ? `… ${phase.percent}%` : "…"}`
                  : "Starting Linux…"}
              </p>
              <p className="text-xs text-slate-500">This takes a few seconds the first time.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
