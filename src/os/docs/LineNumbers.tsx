"use client";

// Layout › Line Numbers: a number in the margin beside each line of text, as in Word. Lines are
// found by measuring where the browser wrapped the text, so they're counted again whenever the
// text, the page or the zoom changes. Tables, shapes and paragraphs marked "suppress" aren't counted.

import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { pageBox, type LineNumbering, type PageLayout } from "./layout";
import { PAGE_GAP } from "./pagination";

/** How far the numbers sit from the text: Word's "Auto" (a quarter of an inch). */
const GAP = 24;

interface Line {
  n: number;
  top: number;
  height: number;
  /** The left edge of the line's column. */
  left: number;
}

const SKIP = "table, .docs-picture, [data-no-line-numbers]";

/**
 * The lines of one paragraph, top to bottom and column by column, in page pixels (before zoom).
 * `columnOf` tells which column a spot on the page is in.
 */
function linesOf(block: HTMLElement, origin: DOMRect, scale: number, columnOf: (x: number) => number) {
  const range = document.createRange();
  range.selectNodeContents(block);
  // The gap where a page fills up (pagination.ts) isn't a line.
  const gaps = [...block.querySelectorAll(".docs-page-gap")].map((g) => g.getBoundingClientRect());
  const rects = [...range.getClientRects()].filter((r) => (r.width > 0 || r.height > 0) && !gaps.some((g) => g.top === r.top && g.height === r.height));
  // An empty paragraph is still a line.
  if (!rects.length) rects.push(block.getBoundingClientRect());
  const lines: { top: number; bottom: number; column: number }[] = [];
  for (const r of rects) {
    if (!r.height) continue;
    const top = (r.top - origin.top) / scale;
    const bottom = (r.bottom - origin.top) / scale;
    const column = columnOf((r.left - origin.left) / scale);
    // Pieces side by side (a bold word, a link, the span around them) are on the same line.
    const same = lines.find((l) => l.column === column && top < l.bottom - 2 && bottom > l.top + 2);
    if (same) {
      same.top = Math.min(same.top, top);
      same.bottom = Math.max(same.bottom, bottom);
    } else lines.push({ top, bottom, column });
  }
  return lines.sort((a, b) => a.column - b.column || a.top - b.top);
}

export function LineNumbers({ editor, numbering, layout, zoom }: { editor: Editor; numbering: LineNumbering; layout: PageLayout; zoom: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    const sheet = ref.current?.parentElement;
    if (!sheet) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const origin = sheet.getBoundingClientRect();
        const scale = origin.width / sheet.offsetWidth || 1;
        const content = editor.view.dom.getBoundingClientRect();
        const left = (content.left - origin.left) / scale;
        const width = content.width / scale;
        const columnWidth = (width - (layout.columns - 1) * layout.columnGap) / layout.columns;
        const blocks = [...editor.view.dom.querySelectorAll<HTMLElement>("p, h1, h2, h3, h4, h5, h6")].filter((b) => !b.closest(SKIP));
        const found: Line[] = [];
        // Which column a spot is in, so each number sits beside its own column.
        const columnOf = (x: number) => Math.max(0, Math.min(layout.columns - 1, Math.floor((x - left + 1) / (columnWidth + layout.columnGap))));
        let n = numbering.start;
        // Pages are only real when the text isn't in columns.
        const stride = layout.columns === 1 ? pageBox(layout).h + PAGE_GAP : Infinity;
        let page = 0;
        for (const block of blocks) {
          for (const line of linesOf(block, origin, scale, columnOf)) {
            const on = Math.floor(line.top / stride);
            if (numbering.perPage && on !== page) n = numbering.start;
            page = on;
            if (n % numbering.countBy === 0)
              found.push({ n, top: line.top, height: line.bottom - line.top, left: left + line.column * (columnWidth + layout.columnGap) });
            n++;
          }
        }
        setLines(found);
      });
    };
    measure();
    editor.on("update", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(editor.view.dom);
    document.fonts?.ready.then(measure);
    return () => {
      cancelAnimationFrame(frame);
      editor.off("update", measure);
      observer.disconnect();
    };
  }, [editor, numbering, layout, zoom]);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 select-none">
      {lines.map((l) => (
        <span
          key={`${l.n}-${l.top}`}
          className="absolute text-right text-[11px] text-slate-500 tabular-nums"
          style={{ top: l.top, left: l.left - GAP - 40, width: 40, height: l.height, lineHeight: `${l.height}px` }}
        >
          {l.n}
        </span>
      ))}
    </div>
  );
}
