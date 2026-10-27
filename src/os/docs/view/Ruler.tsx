"use client";

// View › Ruler: Word's ruler above the page, in inches or centimetres from the left margin. The
// grey ends are the margins (drag their edges to change them); the markers are the paragraph's
// indents: first line (▽ at the top), hanging (△ below it), left (the box: both together) and
// right (△ at the right).

import type { Editor } from "@tiptap/react";
import { useEffect, useState, type PointerEvent } from "react";
import { INDENT_PX } from "../extensions";
import { measureUnit, type PageLayout, type Sides } from "../layout";

interface Geometry {
  /** Where the page and its text are, across the ruler, in screen pixels. */
  sheetLeft: number;
  sheetWidth: number;
  textLeft: number;
  textRight: number;
  /** Screen pixels per page pixel (the zoom). */
  scale: number;
  /** The paragraph's indents, in page pixels. */
  left: number;
  first: number;
  right: number;
}

type Drag = "marginLeft" | "marginRight" | "first" | "hanging" | "left" | "right";

export function Ruler(p: { editor: Editor; layout: PageLayout; zoom: number; onMargins: (m: Sides) => void }) {
  const { editor } = p;
  const [g, setG] = useState<Geometry | null>(null);
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ what: Drag; dx: number } | null>(null);

  // Measure the page and the paragraph the cursor is in, whenever either may have moved.
  useEffect(() => {
    if (!bar) return;
    const sheet = editor.view.dom.closest<HTMLElement>(".docs-sheet");
    const scroller = sheet?.parentElement;
    if (!sheet || !scroller) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const origin = bar.getBoundingClientRect();
        const s = sheet.getBoundingClientRect();
        const text = editor.view.dom.getBoundingClientRect();
        const scale = s.width / sheet.offsetWidth || 1;
        const { $from } = editor.state.selection;
        const block = $from.depth ? editor.view.nodeDOM($from.before($from.depth)) : null;
        const css = block instanceof HTMLElement ? getComputedStyle(block) : null;
        setG({
          sheetLeft: s.left - origin.left,
          sheetWidth: s.width,
          textLeft: text.left - origin.left,
          textRight: text.right - origin.left,
          scale,
          left: css ? parseFloat(css.marginLeft) || 0 : 0,
          first: css ? parseFloat(css.textIndent) || 0 : 0,
          right: css ? parseFloat(css.marginRight) || 0 : 0,
        });
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    observer.observe(scroller);
    scroller.addEventListener("scroll", measure);
    editor.on("transaction", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scroller.removeEventListener("scroll", measure);
      editor.off("transaction", measure);
    };
  }, [bar, editor, p.zoom, p.layout.margins]);

  if (!g) return <div ref={setBar} className="h-6 shrink-0 border-b border-slate-200 bg-slate-100" />;

  const unit = measureUnit();
  const px = unit.px * g.scale;
  const d = (what: Drag) => (drag?.what === what ? drag.dx : 0);
  // Where each marker is now (moved by the drag, if it's the one being dragged).
  const marginLeft = g.textLeft + d("marginLeft");
  const marginRight = g.textRight + d("marginRight");
  const leftX = g.textLeft + g.left * g.scale + d("left") + d("hanging");
  const firstX = g.textLeft + (g.left + g.first) * g.scale + d("first") + d("left");
  const rightX = g.textRight - g.right * g.scale + d("right");

  const start = (what: Drag) => (e: PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    let dx = 0;
    const moveTo = (ev: globalThis.PointerEvent) => {
      dx = ev.clientX - x0;
      setDrag({ what, dx });
    };
    const done = () => {
      window.removeEventListener("pointermove", moveTo);
      window.removeEventListener("pointerup", done);
      setDrag(null);
      commit(what, dx / g.scale);
    };
    window.addEventListener("pointermove", moveTo);
    window.addEventListener("pointerup", done);
  };

  /** Saves a drag: margins in the layout, indents on the paragraph (`delta` is in page pixels). */
  const commit = (what: Drag, delta: number) => {
    if (!delta) return;
    const m = p.layout.margins;
    const textWidth = (g.textRight - g.textLeft) / g.scale;
    if (what === "marginLeft") return p.onMargins({ ...m, left: Math.max(0, Math.min(m.left + delta, m.left + textWidth - 96)) });
    if (what === "marginRight") return p.onMargins({ ...m, right: Math.max(0, Math.min(m.right - delta, m.right + textWidth - 96)) });
    let { left, first, right } = g;
    if (what === "left") left += delta;
    if (what === "first") first += delta;
    // The hanging marker moves the left indent but leaves the first line where it was.
    if (what === "hanging") {
      left += delta;
      first -= delta;
    }
    if (what === "right") right -= delta;
    left = Math.max(-g.textLeft / g.scale, left);
    editor
      .chain()
      .focus()
      .setParagraphFormat({
        indent: Math.round((left / INDENT_PX) * 100) / 100,
        firstLine: Math.round(first) || null,
        indentRight: Math.round(Math.max(0, right)) || null,
      })
      .run();
  };

  // Ticks every eighth of an inch (or quarter centimetre), numbered from the left margin.
  const steps = unit.name === "in" ? 8 : 4;
  const ticks: { x: number; size: "s" | "m" | "l"; n?: number }[] = [];
  const from = Math.floor((g.sheetLeft - marginLeft) / px) - 1;
  const to = Math.ceil((g.sheetLeft + g.sheetWidth - marginLeft) / px) + 1;
  for (let u = from; u <= to; u++) {
    for (let k = 0; k < steps; k++) {
      const x = marginLeft + (u + k / steps) * px;
      if (x < g.sheetLeft || x > g.sheetLeft + g.sheetWidth) continue;
      ticks.push(k === 0 ? { x, size: "l", n: Math.abs(u) } : { x, size: k === steps / 2 ? "m" : "s" });
    }
  }

  return (
    <div ref={setBar} aria-label="Ruler" className="relative h-6 shrink-0 overflow-hidden border-b border-slate-200 bg-slate-100 select-none">
      {/* The page: grey margins, white for the text */}
      <div className="absolute top-1 bottom-1 bg-slate-300/70" style={{ left: g.sheetLeft, width: g.sheetWidth }} />
      <div className="absolute top-1 bottom-1 bg-white" style={{ left: marginLeft, width: Math.max(0, marginRight - marginLeft) }} />
      {ticks.map((t, i) =>
        t.n !== undefined && t.n !== 0 ? (
          <span key={i} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] leading-none text-slate-600" style={{ left: t.x }}>
            {t.n}
          </span>
        ) : (
          <span key={i} className="absolute w-px bg-slate-500" style={{ left: t.x, top: t.size === "s" ? 10 : t.size === "m" ? 8 : 7, height: t.size === "s" ? 4 : t.size === "m" ? 8 : 10 }} />
        ),
      )}
      {/* Margin edges */}
      <span title="Left Margin" onPointerDown={start("marginLeft")} className="absolute top-1 bottom-1 w-2 -translate-x-1/2 cursor-ew-resize" style={{ left: marginLeft }} />
      <span title="Right Margin" onPointerDown={start("marginRight")} className="absolute top-1 bottom-1 w-2 -translate-x-1/2 cursor-ew-resize" style={{ left: marginRight }} />
      {/* Indent markers */}
      <Marker title="First Line Indent" x={firstX} top onDown={start("first")} />
      <Marker title="Hanging Indent" x={leftX} onDown={start("hanging")} />
      <span title="Left Indent" onPointerDown={start("left")} className="absolute bottom-0 h-1.5 w-2.5 -translate-x-1/2 cursor-ew-resize border border-slate-500 bg-slate-100" style={{ left: leftX }} />
      <Marker title="Right Indent" x={rightX} onDown={start("right")} />
      {drag && <span className="pointer-events-none absolute top-0 bottom-0 w-px bg-slate-500" style={{ left: { marginLeft, marginRight, first: firstX, hanging: leftX, left: leftX, right: rightX }[drag.what] }} />}
    </div>
  );
}

/** A small triangle: pointing down at the top (first line), or up near the bottom. */
function Marker(p: { title: string; x: number; top?: boolean; onDown: (e: PointerEvent) => void }) {
  return (
    <span title={p.title} onPointerDown={p.onDown} className="absolute -translate-x-1/2 cursor-ew-resize" style={{ left: p.x, ...(p.top ? { top: 0 } : { bottom: 5 }) }}>
      <svg width="10" height="7" viewBox="0 0 10 7" aria-hidden>
        <path d={p.top ? "M0.5 0.5h9L5 6.5z" : "M0.5 6.5h9L5 0.5z"} fill="#f1f5f9" stroke="#64748b" />
      </svg>
    </span>
  );
}
