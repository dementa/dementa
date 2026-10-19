"use client";

// How pictures (photos, shapes, SmartArt and charts) look in the editor: handles to resize them
// when selected, and, for pictures in front of the text, dragging them anywhere on the page.
// Pictures in line with the text are dragged like text, to another place in it.

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useRef, useState, type PointerEvent } from "react";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type Handle = (typeof HANDLES)[number];

/** Smallest a picture can be made, in pixels. */
export const MIN_PICTURE = 16;
const MAX_PICTURE = 4000;

interface Box {
  w: number;
  h: number;
  x: number;
  y: number;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function PictureView({ node, selected, editor, getPos, updateAttributes }: NodeViewProps) {
  const { src, alt, title, width, height, wrap, x, y } = node.attrs as {
    src: string;
    alt: string | null;
    title: string | null;
    width: number | null;
    height: number | null;
    wrap: "inline" | "front";
    x: number;
    y: number;
  };
  const front = wrap === "front";
  const img = useRef<HTMLImageElement>(null);
  /** The size and place while a handle or the picture is being dragged; saved when it's let go. */
  const [live, setLive] = useState<Box | null>(null);
  const box = live ?? { w: width ?? 0, h: height ?? 0, x, y };

  /** Pointer movement → page pixels, allowing for the zoom. */
  const zoom = () => {
    const el = img.current!;
    return el.getBoundingClientRect().width / el.offsetWidth || 1;
  };

  const select = () => {
    const pos = getPos();
    if (typeof pos === "number") editor.chain().setNodeSelection(pos).focus().run();
  };

  /** Follows the pointer until it's let go, then saves the result as one step for Undo. */
  function track(e: PointerEvent, next: (dx: number, dy: number, shift: boolean) => Box) {
    e.preventDefault();
    e.stopPropagation();
    const scale = zoom();
    const startX = e.clientX;
    const startY = e.clientY;
    let latest: Box | null = null;
    const move = (ev: globalThis.PointerEvent) => {
      latest = next((ev.clientX - startX) / scale, (ev.clientY - startY) / scale, ev.shiftKey);
      setLive(latest);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setLive(null);
      if (latest) updateAttributes({ width: latest.w, height: latest.h, ...(front ? { x: latest.x, y: latest.y } : {}) });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function resize(e: PointerEvent, handle: Handle) {
    const el = img.current!;
    const start = { w: el.offsetWidth, h: el.offsetHeight, x, y };
    const ratio = start.w / start.h;
    // In line with the text, a picture can't be wider than the page.
    const maxW = front ? MAX_PICTURE : (el.closest(".ProseMirror") as HTMLElement | null)?.clientWidth ?? MAX_PICTURE;
    track(e, (dx, dy, shift) => {
      let w = start.w + (handle.includes("e") ? dx : handle.includes("w") ? -dx : 0);
      let h = start.h + (handle.includes("s") ? dy : handle.includes("n") ? -dy : 0);
      // Corners keep the picture's proportions, unless Shift is held.
      if (handle.length === 2 && !shift) {
        if (Math.abs(w / start.w) > Math.abs(h / start.h)) h = w / ratio;
        else w = h * ratio;
      }
      w = Math.round(clamp(w, MIN_PICTURE, maxW));
      h = Math.round(clamp(h, MIN_PICTURE, MAX_PICTURE));
      // Dragging the left or top edge of a picture in front of the text keeps its other edge still.
      return {
        w,
        h,
        x: front && handle.includes("w") ? start.x + start.w - w : start.x,
        y: front && handle.includes("n") ? start.y + start.h - h : start.y,
      };
    });
  }

  function moveFront(e: PointerEvent) {
    if (e.button !== 0) return;
    select();
    const el = img.current!;
    const start = { w: el.offsetWidth, h: el.offsetHeight, x, y };
    track(e, (dx, dy) => ({ ...start, x: Math.round(start.x + dx), y: Math.round(start.y + dy) }));
  }

  const size = live || width ? { width: box.w, height: box.h } : undefined;

  return (
    <NodeViewWrapper className={`docs-picture ${front ? "docs-picture-front" : ""}`} data-drag-handle={front ? undefined : ""}>
      <span
        className={`docs-picture-frame ${selected ? "is-selected" : ""}`}
        style={front ? { transform: `translate(${box.x}px, ${box.y}px)` } : undefined}
        onPointerDown={front ? moveFront : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a picture in the document */}
        <img ref={img} src={src} alt={alt ?? ""} title={title ?? undefined} draggable={false} style={size} />
        {selected &&
          HANDLES.map((h) => (
            <span key={h} className={`docs-handle docs-handle-${h}`} onPointerDown={(e) => resize(e, h)} aria-hidden />
          ))}
      </span>
    </NodeViewWrapper>
  );
}
