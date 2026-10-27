// Insert → Shapes, as in Word: after a shape is picked the pointer becomes a +, and dragging on the
// page draws the shape there, at that size. Shift keeps it even (a circle, a square, a line at
// 45°). A click without dragging puts in a one-inch shape. Esc, or clicking off the page, cancels.

import { NodeSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { MIN_PICTURE } from "./PictureView";
import { CLICK_SIZE, EDIT_SHAPE_TEXT, isLine, LINE_PAD, newShape, shapeName, shapeSvg, type ShapeKind } from "./shapes";

interface Point {
  x: number;
  y: number;
}

/** Stops the shape waiting to be drawn, if there is one. */
let cancelDrawing: (() => void) | null = null;

/** Shift: same width and height, or a line at a multiple of 45°. */
function constrain(start: Point, end: Point, line: boolean): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (line) {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(dx, dy);
    return { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
  }
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + Math.sign(dx || 1) * d, y: start.y + Math.sign(dy || 1) * d };
}

/** The shape's box on the screen; a line's box has room around it, and flips say which way it runs. */
function boxFor(start: Point, end: Point, line: boolean, scale: number) {
  const pad = line ? LINE_PAD * scale : 0;
  return {
    left: Math.min(start.x, end.x) - pad,
    top: Math.min(start.y, end.y) - pad,
    w: Math.abs(end.x - start.x) + 2 * pad,
    h: Math.abs(end.y - start.y) + 2 * pad,
    flipH: end.x < start.x,
    flipV: end.y < start.y,
  };
}

export function drawShape(editor: Editor, kind: ShapeKind) {
  cancelDrawing?.();
  const view = editor.view;
  const sheet = view.dom.closest<HTMLElement>(".docs-sheet");
  if (!sheet) return;
  const line = isLine(kind);
  let preview: HTMLDivElement | null = null;

  const stop = () => {
    delete sheet.dataset.drawing;
    preview?.remove();
    window.removeEventListener("pointerdown", down, true);
    window.removeEventListener("keydown", escape, true);
    cancelDrawing = null;
  };
  cancelDrawing = stop;
  sheet.dataset.drawing = "";
  window.addEventListener("pointerdown", down, true);
  window.addEventListener("keydown", escape, true);

  function escape(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    stop();
  }

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    // Clicking anywhere else cancels, and that click still does what it's for.
    if (!sheet!.contains(e.target as Node)) return stop();
    e.preventDefault();
    e.stopPropagation();
    window.removeEventListener("pointerdown", down, true);

    // Screen pixels per page pixel, allowing for the zoom.
    const scale = view.dom.getBoundingClientRect().width / view.dom.offsetWidth || 1;
    const start = { x: e.clientX, y: e.clientY };
    let end = start;
    const shape = newShape(kind);
    preview = document.createElement("div");
    preview.style.cssText = "position:fixed;z-index:2147483000;pointer-events:none;opacity:0.7";
    document.body.append(preview);

    const show = () => {
      const box = boxFor(start, end, line, scale);
      preview!.style.left = `${box.left}px`;
      preview!.style.top = `${box.top}px`;
      preview!.innerHTML = shapeSvg({ ...shape, flipH: box.flipH, flipV: box.flipV }, Math.max(1, box.w), Math.max(1, box.h), false);
    };
    const move = (ev: PointerEvent) => {
      const point = { x: ev.clientX, y: ev.clientY };
      end = ev.shiftKey ? constrain(start, point, line) : point;
      show();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      stop();
      // A click without a drag: a one-inch shape (a line one inch long) from where it was clicked.
      if (Math.hypot(end.x - start.x, end.y - start.y) < 4) {
        end = line ? { x: start.x + CLICK_SIZE * scale, y: start.y } : { x: start.x + CLICK_SIZE * scale, y: start.y + CLICK_SIZE * scale };
      }
      place(editor, kind, boxFor(start, end, line, scale), scale);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
}

/** Puts the shape in front of the text, anchored to the paragraph where it was drawn, and selects it. */
function place(editor: Editor, kind: ShapeKind, box: ReturnType<typeof boxFor>, scale: number) {
  const view = editor.view;
  const page = view.dom.getBoundingClientRect();
  const at = view.posAtCoords({
    left: Math.min(Math.max(box.left, page.left + 1), page.right - 1),
    top: Math.min(Math.max(box.top, page.top + 1), page.bottom - 1),
  });
  const $pos = view.state.doc.resolve(at?.pos ?? view.state.doc.content.size);
  const anchor = $pos.depth >= 1 ? $pos.before(1) : $pos.pos;

  const shape = { ...newShape(kind), flipH: box.flipH, flipV: box.flipV };
  const node = view.state.schema.nodes.image.create({
    src: "",
    alt: shapeName(kind),
    wrap: "front",
    width: Math.max(MIN_PICTURE, Math.round(box.w / scale)),
    height: Math.max(MIN_PICTURE, Math.round(box.h / scale)),
    shape,
  });
  view.dispatch(view.state.tr.insert(anchor, node));

  // Now it's on the page, move it from where it's anchored to where it was drawn.
  const origin = (view.nodeDOM(anchor) as HTMLElement | null)?.getBoundingClientRect();
  const tr = view.state.tr;
  if (origin) {
    tr.setNodeAttribute(anchor, "x", Math.round((box.left - origin.left) / scale));
    tr.setNodeAttribute(anchor, "y", Math.round((box.top - origin.top) / scale));
  }
  // One step for Undo: the shape comes out wherever it was drawn.
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, anchor)).setMeta("addToHistory", false));
  view.focus();

  // A new text box is ready to type in, as in Word.
  if (kind === "textBox") {
    requestAnimationFrame(() => {
      const frame = (view.nodeDOM(anchor) as HTMLElement | null)?.querySelector(".docs-picture-frame");
      frame?.dispatchEvent(new CustomEvent(EDIT_SHAPE_TEXT, { detail: null }));
    });
  }
}
