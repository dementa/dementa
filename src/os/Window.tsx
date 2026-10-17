"use client";

import { Copy, Minus, Square, X } from "lucide-react";
import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { getApp, type OSStyle } from "./apps";
import { AppGlyph } from "./common";
import { MIN_H, MIN_W, type Snap, type WinState } from "./windowManager";

/** How close (px) the pointer must get to a screen edge to snap the window there. */
const SNAP_EDGE = 8;
/** Pointer travel (px) before a maximised/snapped window detaches, so double-clicks still work. */
const DETACH_DISTANCE = 6;

type SnapTarget = Exclude<Snap, null> | "max";
type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface Props {
  win: WinState;
  style: OSStyle;
  active: boolean;
  insets: { top: number; bottom: number };
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMax: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (x: number, y: number, w: number, h: number) => void;
  onSnap: (snap: SnapTarget) => void;
  onUnsnap: (x: number, y: number) => void;
  /** Right-click on the title bar. */
  onTitleMenu: (e: MouseEvent) => void;
  children: ReactNode;
}

export function Window(props: Props) {
  const { win, style, active, insets, onFocus, onClose, onMinimize, onToggleMax, children } = props;
  const app = getApp(win.appId);
  const fixed = win.maximized || win.snap !== null;
  const [preview, setPreview] = useState<SnapTarget | null>(null);

  const drag = useRef<{
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    detached: boolean;
    /** Where the pointer was across the title bar (0–1), to keep it under the pointer when detaching. */
    ratio: number;
  } | null>(null);

  const resize = useRef<{ dir: ResizeDir; px: number; py: number; x: number; y: number; w: number; h: number } | null>(
    null,
  );

  // ---- Moving & snapping ----

  function startDrag(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    const bar = e.currentTarget.getBoundingClientRect();
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      dx: e.clientX - win.x,
      dy: e.clientY - win.y,
      detached: !fixed,
      ratio: (e.clientX - bar.left) / bar.width,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onDrag(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;

    if (!d.detached) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DETACH_DISTANCE) return;
      // Pull the window off the edge at its normal size, keeping the grab point under the pointer.
      const x = e.clientX - win.w * d.ratio;
      const y = Math.max(insets.top, e.clientY - 20);
      props.onUnsnap(x, y);
      d.detached = true;
      d.dx = e.clientX - x;
      d.dy = e.clientY - y;
      // Fall through so a fast flick straight to another edge still shows the snap preview.
    }

    // Keep at least part of the title bar on screen so the window can always be grabbed again.
    const x = Math.min(Math.max(e.clientX - d.dx, 80 - win.w), window.innerWidth - 80);
    const y = Math.min(Math.max(e.clientY - d.dy, insets.top), window.innerHeight - insets.bottom - 40);
    props.onMove(x, y);

    let target: SnapTarget | null = null;
    if (e.clientX <= SNAP_EDGE) target = "left";
    else if (e.clientX >= window.innerWidth - SNAP_EDGE) target = "right";
    else if (e.clientY <= insets.top + SNAP_EDGE) target = "max";
    setPreview(target);
  }

  function endDrag() {
    if (drag.current?.detached && preview) props.onSnap(preview);
    drag.current = null;
    setPreview(null);
  }

  // ---- Resizing ----

  function startResize(dir: ResizeDir) {
    return (e: PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      onFocus();
      resize.current = { dir, px: e.clientX, py: e.clientY, x: win.x, y: win.y, w: win.w, h: win.h };
      e.currentTarget.setPointerCapture(e.pointerId);
    };
  }

  function onResizeMove(e: PointerEvent<HTMLDivElement>) {
    const r = resize.current;
    if (!r) return;
    const dx = e.clientX - r.px;
    const dy = e.clientY - r.py;
    let { x, y, w, h } = r;

    if (r.dir.includes("e")) w = Math.min(Math.max(MIN_W, r.w + dx), window.innerWidth - r.x);
    if (r.dir.includes("s")) h = Math.min(Math.max(MIN_H, r.h + dy), window.innerHeight - insets.bottom - r.y);
    if (r.dir.includes("w")) {
      w = Math.min(Math.max(MIN_W, r.w - dx), r.x + r.w);
      x = r.x + r.w - w;
    }
    if (r.dir.includes("n")) {
      h = Math.min(Math.max(MIN_H, r.h - dy), r.y + r.h - insets.top);
      y = r.y + r.h - h;
    }
    props.onResize(x, y, w, h);
  }

  function endResize() {
    resize.current = null;
  }

  // ---- Layout ----

  const usableHeight = `calc(100% - ${insets.top + insets.bottom}px)`;
  const frame: CSSProperties = win.maximized
    ? { left: 0, top: insets.top, width: "100%", height: usableHeight }
    : win.snap === "left"
      ? { left: 0, top: insets.top, width: "50%", height: usableHeight }
      : win.snap === "right"
        ? { left: "50%", top: insets.top, width: "50%", height: usableHeight }
        : { left: win.x, top: win.y, width: win.w, height: win.h };

  const previewFrame: CSSProperties | null =
    preview === "max"
      ? { left: 8, top: insets.top + 8, right: 8, bottom: insets.bottom + 8 }
      : preview === "left"
        ? { left: 8, top: insets.top + 8, width: "calc(50% - 12px)", bottom: insets.bottom + 8 }
        : preview === "right"
          ? { right: 8, top: insets.top + 8, width: "calc(50% - 12px)", bottom: insets.bottom + 8 }
          : null;

  const mac = style === "mac";

  return (
    <>
      {previewFrame && (
        <div
          className="snap-preview pointer-events-none absolute rounded-xl border-2 border-white/70 bg-white/20 backdrop-blur-sm"
          style={{ ...previewFrame, zIndex: win.z }}
        />
      )}
      <div
        role="dialog"
        aria-label={app.name}
        className={`absolute flex flex-col bg-surface text-slate-800 ${
          fixed ? "" : mac ? "rounded-xl" : "rounded-lg"
        } ${active ? "shadow-2xl" : "shadow-lg"} ring-1 ${mac ? "ring-black/15" : "ring-black/20"} dark:ring-white/15`}
        style={{ ...frame, zIndex: win.z, display: win.minimized ? "none" : undefined }}
        onPointerDown={onFocus}
      >
        <div
          className={`flex h-10 shrink-0 touch-none items-center overflow-hidden select-none ${
            fixed ? "" : mac ? "rounded-t-xl" : "rounded-t-lg"
          } ${mac ? (active ? "bg-slate-100" : "bg-slate-200/70 text-slate-500") : active ? "bg-surface" : "bg-surface text-slate-400"} border-b border-black/10 dark:border-white/10`}
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={(e) => !(e.target as HTMLElement).closest("button") && onToggleMax()}
          onContextMenu={props.onTitleMenu}
        >
          {mac ? (
            <>
              <div className="group flex gap-2 pl-3.5">
                <MacButton color="#ff5f57" label="Close" onClick={onClose} glyph={<X size={9} strokeWidth={3} />} />
                <MacButton color="#febc2e" label="Minimise" onClick={onMinimize} glyph={<Minus size={9} strokeWidth={3} />} />
                <MacButton color="#28c840" label="Maximise" onClick={onToggleMax} glyph={<Square size={7} strokeWidth={3} />} />
              </div>
              <span className="flex-1 pr-16 text-center text-sm font-semibold">{app.name}</span>
            </>
          ) : (
            <>
              <AppGlyph app={app} size={16} className="ml-3 shrink-0" />
              <span className="ml-2.5 flex-1 truncate text-xs">{app.name}</span>
              <WinButton label="Minimise" onClick={onMinimize}><Minus size={16} strokeWidth={1.5} /></WinButton>
              <WinButton label={fixed ? "Restore" : "Maximise"} onClick={onToggleMax}>
                {fixed ? <Copy size={13} strokeWidth={1.5} /> : <Square size={12} strokeWidth={1.5} />}
              </WinButton>
              <WinButton label="Close" onClick={onClose} danger><X size={17} strokeWidth={1.5} /></WinButton>
            </>
          )}
        </div>
        <div
          className={`min-h-0 flex-1 overflow-auto ${fixed ? "" : mac ? "rounded-b-xl" : "rounded-b-lg"}`}
          // Right-clicks inside an app belong to that app, not to the desktop behind it.
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {children}
        </div>

        {!fixed &&
          RESIZE_HANDLES.map(({ dir, className }) => (
            <div
              key={dir}
              aria-hidden="true"
              className={`absolute touch-none ${className}`}
              onPointerDown={startResize(dir)}
              onPointerMove={onResizeMove}
              onPointerUp={endResize}
              onPointerCancel={endResize}
            />
          ))}
      </div>
    </>
  );
}

// Invisible grab strips just outside each edge and corner (larger corners for small fingers).
const RESIZE_HANDLES: { dir: ResizeDir; className: string }[] = [
  { dir: "n", className: "-top-1 left-3 right-3 h-2 cursor-ns-resize" },
  { dir: "s", className: "-bottom-1 left-3 right-3 h-2 cursor-ns-resize" },
  { dir: "e", className: "-right-1 top-3 bottom-3 w-2 cursor-ew-resize" },
  { dir: "w", className: "-left-1 top-3 bottom-3 w-2 cursor-ew-resize" },
  { dir: "nw", className: "-top-1.5 -left-1.5 h-4 w-4 cursor-nwse-resize" },
  { dir: "ne", className: "-top-1.5 -right-1.5 h-4 w-4 cursor-nesw-resize" },
  { dir: "sw", className: "-bottom-1.5 -left-1.5 h-4 w-4 cursor-nesw-resize" },
  { dir: "se", className: "-bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize" },
];

function MacButton({ color, label, onClick, glyph }: { color: string; label: string; onClick: () => void; glyph: ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-black/60 ring-1 ring-black/10"
      style={{ background: color }}
    >
      <span className="opacity-0 group-hover:opacity-100">{glyph}</span>
    </button>
  );
}

function WinButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`flex h-full w-12 items-center justify-center ${danger ? "hover:bg-red-600 hover:text-white" : "hover:bg-black/10 dark:hover:bg-white/10"}`}
    >
      {children}
    </button>
  );
}
