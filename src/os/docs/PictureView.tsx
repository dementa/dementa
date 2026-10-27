"use client";

// How pictures (photos, shapes, SmartArt and charts) look in the editor: handles to resize them
// when selected, and, for pictures in front of the text, dragging them anywhere on the page.
// Pictures in line with the text are dragged like text, to another place in it.
// Shapes are drawn at their size as they're resized, and hold text: typing while one is selected,
// or double-clicking it, writes in it, as in Word.

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type Ref, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { Side, Wrap } from "./insertNodes";
import { isFloating, selectedPictures, selectKeeping, toggleSelected } from "./multiSelect";
import { EDIT_SHAPE_TEXT, isLine, LINE_PAD, PX_PER_PT, readShape, shapeSvg, textInsets, type Shape } from "./shapes";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type Handle = (typeof HANDLES)[number];

/** The CSS z-index of a picture that isn't in line with the text: behind it, or in front in the order of `z`. */
export const stackOf = (wrap: string, z: number) => (wrap === "behind" ? -1 : 10 + Math.max(-9, Math.min(989, z || 0)));

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

export function PictureView({ node, selected, editor, getPos, updateAttributes, decorations }: NodeViewProps) {
  const { src, alt, title, width, height, wrap, x, y } = node.attrs as {
    src: string;
    alt: string | null;
    title: string | null;
    width: number | null;
    height: number | null;
    wrap: Wrap;
    x: number;
    y: number;
  };
  const shape = readShape(node.attrs.shape);
  // Pictures behind the text move about the same way as ones in front of it.
  const front = wrap === "front" || wrap === "behind";
  // Square: text flows around it on one side. Top and Bottom: on a line of its own.
  const side = (node.attrs.side ?? "left") as Side;
  const flow =
    wrap === "square"
      ? { float: side === "right" ? ("right" as const) : ("left" as const), margin: side === "right" ? "4px 0 4px 12px" : "4px 12px 4px 0" }
      : wrap === "topBottom"
        ? { display: "block", clear: "both" as const, textAlign: side, margin: "6px 0" }
        : undefined;
  const body = useRef<HTMLElement>(null);
  const frame = useRef<HTMLSpanElement>(null);
  /** The size and place while a handle or the picture is being dragged; saved when it's let go. */
  const [live, setLive] = useState<Box | null>(null);
  const box = live ?? { w: width ?? 0, h: height ?? 0, x, y };

  /** Pointer movement → page pixels, allowing for the zoom. */
  const zoom = () => {
    const el = body.current!;
    return el.getBoundingClientRect().width / el.offsetWidth || 1;
  };

  /** Selected along with others (Shift+click, or a group). */
  const multi = decorations.some((d) => (d as unknown as { spec: { multi?: boolean } }).spec.multi);

  // Selects it, keeping any others selected with it, so dragging moves them all.
  const select = () => {
    const pos = getPos();
    if (typeof pos === "number") selectKeeping(editor, pos);
  };

  // Shift+click adds it to the selection (or takes it out), before the editor would select only it.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const down = (e: MouseEvent) => {
      if (!e.shiftKey) return;
      const pos = getPos();
      if (typeof pos !== "number") return;
      e.preventDefault();
      e.stopPropagation();
      toggleSelected(editor, pos);
    };
    el.addEventListener("mousedown", down);
    return () => el.removeEventListener("mousedown", down);
  }, [editor, getPos]);

  /** Follows the pointer until it's let go, then saves the result as one step for Undo. */
  function track(e: PointerEvent, next: (dx: number, dy: number, shift: boolean) => Box, finish?: (box: Box) => void) {
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
      if (latest && finish) finish(latest);
      else if (latest) updateAttributes({ width: latest.w, height: latest.h, ...(front ? { x: latest.x, y: latest.y } : {}) });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function resize(e: PointerEvent, handle: Handle) {
    const el = body.current!;
    const start = { w: el.offsetWidth, h: el.offsetHeight, x, y };
    const ratio = start.w / start.h;
    // In line with the text, a picture can't be wider than the page.
    const maxW = front ? MAX_PICTURE : (el.closest(".ProseMirror") as HTMLElement | null)?.clientWidth ?? MAX_PICTURE;
    track(e, (dx, dy, shift) => {
      let w = start.w + (handle.includes("e") ? dx : handle.includes("w") ? -dx : 0);
      let h = start.h + (handle.includes("s") ? dy : handle.includes("n") ? -dy : 0);
      // Corners keep a picture's proportions unless Shift is held; shapes only keep them with Shift, as in Word.
      if (handle.length === 2 && shift !== Boolean(shape)) {
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
    if (e.button !== 0 || e.shiftKey) return;
    select();
    const el = body.current!;
    const start = { w: el.offsetWidth, h: el.offsetHeight, x, y };
    // The others selected with it (or in its group) that float too move along.
    const self = getPos();
    const others = selectedPictures(editor.state)
      .filter((pos) => pos !== self && isFloating(editor.state.doc.nodeAt(pos)))
      .map((pos) => ({ pos, attrs: editor.state.doc.nodeAt(pos)!.attrs, frame: (editor.view.nodeDOM(pos) as HTMLElement | null)?.querySelector<HTMLElement>(".docs-picture-frame") }));
    track(
      e,
      (dx, dy) => {
        for (const o of others) if (o.frame) o.frame.style.transform = `translate(${o.attrs.x + Math.round(dx)}px, ${o.attrs.y + Math.round(dy)}px)`;
        return { ...start, x: Math.round(start.x + dx), y: Math.round(start.y + dy) };
      },
      others.length
        ? (box) => {
            const dx = box.x - start.x;
            const dy = box.y - start.y;
            let tr = editor.state.tr;
            if (typeof self === "number") tr = tr.setNodeMarkup(self, undefined, { ...node.attrs, x: box.x, y: box.y });
            for (const o of others) tr = tr.setNodeMarkup(o.pos, undefined, { ...o.attrs, x: o.attrs.x + dx, y: o.attrs.y + dy });
            editor.view.dispatch(tr);
          }
        : undefined,
    );
  }

  // ---- Text in a shape ----

  const text = useRef<HTMLDivElement>(null);
  /** What the text starts as when editing begins, or null when it isn't being edited. */
  const [editing, setEditing] = useState<string | null>(null);
  const canType = shape && !isLine(shape.kind);

  useEffect(() => {
    const el = frame.current;
    if (!el || !shape || !canType) return;
    // Straight away, so the next key pressed already lands in the shape's text.
    const start = (e: Event) => flushSync(() => setEditing(shape.text + ((e as CustomEvent<string | null>).detail ?? "")));
    el.addEventListener(EDIT_SHAPE_TEXT, start);
    return () => el.removeEventListener(EDIT_SHAPE_TEXT, start);
  }, [shape, canType]);

  // The text box is filled once when editing starts, then left to the typing (so the cursor stays put).
  useLayoutEffect(() => {
    const el = text.current;
    if (editing === null || !el) return;
    el.textContent = editing;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editing]);

  function finishEditing() {
    if (editing === null || !shape) return;
    const typed = (text.current?.innerText ?? "").replace(/\n$/, "");
    setEditing(null);
    if (typed !== shape.text) updateAttributes({ shape: { ...shape, text: typed } });
  }

  const size = live || width ? { width: box.w, height: box.h } : undefined;

  return (
    <NodeViewWrapper className={`docs-picture ${front ? "docs-picture-front" : ""}`} style={flow} data-drag-handle={front ? undefined : ""}>
      <span
        ref={frame}
        className={`docs-picture-frame ${selected || multi || editing !== null ? "is-selected" : ""} ${shape && isLine(shape.kind) ? "is-line" : ""}`}
        style={front ? { transform: `translate(${box.x}px, ${box.y}px)`, zIndex: stackOf(wrap, node.attrs.z) } : undefined}
        onPointerDown={front && editing === null ? moveFront : undefined}
        onDoubleClick={() => canType && editing === null && setEditing(shape.text)}
      >
        {shape ? (
          <span ref={body} className="docs-shape" role="img" aria-label={alt ?? "Shape"} style={{ width: box.w, height: box.h }}>
            <span className="docs-shape-drawing" dangerouslySetInnerHTML={{ __html: shapeSvg(shape, box.w, box.h, false) }} />
            {canType && (editing !== null || shape.text) && (
              <ShapeText
                shape={shape}
                h={box.h}
                textRef={text}
                editing={editing !== null}
                onDone={() => {
                  finishEditing();
                  select();
                }}
                onBlur={finishEditing}
              />
            )}
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a picture in the document
          <img ref={body as RefObject<HTMLImageElement>} src={src} alt={alt ?? ""} title={title ?? undefined} draggable={false} style={size} />
        )}
        {selected &&
          editing === null &&
          (shape && isLine(shape.kind) ? lineHandles(shape, box) : HANDLES).map((h) => (
            <span key={h} className={`docs-handle docs-handle-${h}`} onPointerDown={(e) => resize(e, h)} aria-hidden />
          ))}
      </span>
    </NodeViewWrapper>
  );
}

/** A line is grabbed by its two ends, which are corners of its box. */
function lineHandles(shape: Shape, box: Box): Handle[] {
  if (box.h <= LINE_PAD * 2 + 2) return ["w", "e"];
  if (box.w <= LINE_PAD * 2 + 2) return ["n", "s"];
  return shape.flipH !== shape.flipV ? ["ne", "sw"] : ["nw", "se"];
}

function ShapeText(p: {
  shape: Shape;
  h: number;
  textRef: Ref<HTMLDivElement>;
  editing: boolean;
  onDone: () => void;
  onBlur: () => void;
}) {
  const { shape } = p;
  const inset = textInsets(shape, p.h);
  return (
    <div
      className="docs-shape-text"
      style={{
        padding: `${inset.top}px ${inset.right}px ${inset.bottom}px ${inset.left}px`,
        justifyContent: shape.valign === "top" ? "flex-start" : shape.valign === "bottom" ? "flex-end" : "center",
      }}
    >
      <div
        ref={p.textRef}
        className={p.editing ? "is-editing" : undefined}
        contentEditable={p.editing ? "plaintext-only" : false}
        suppressContentEditableWarning
        spellCheck
        onBlur={p.onBlur}
        onPointerDown={(e) => p.editing && e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            p.onDone();
          }
        }}
        style={{
          textAlign: shape.align,
          color: shape.textColour,
          fontSize: shape.fontSize * PX_PER_PT,
          fontWeight: shape.bold ? 700 : 400,
          fontStyle: shape.italic ? "italic" : "normal",
        }}
      >
        {p.editing ? null : shape.text}
      </div>
    </div>
  );
}
