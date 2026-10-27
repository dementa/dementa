"use client";

// Word's table handles, shown while the mouse is over a table (or the cursor is in one): the ✥ at
// its top left, which selects the table when clicked and moves it when dragged, and the small
// square at its bottom right, which resizes the whole table.

import type { Editor } from "@tiptap/react";
import { Move } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { dropPlace, moveTable, scaleTable, selectTablePart, tableAt, tableOfDom } from "./tableTools";

/** A line or box drawn over everything while dragging (in screen pixels). */
function guide(className: string) {
  const el = document.createElement("div");
  el.className = className;
  document.body.append(el);
  return el;
}

export function TableHandles({ editor }: { editor: Editor }) {
  const [table, setTable] = useState<HTMLTableElement | null>(null);
  const [, redraw] = useState(0);
  const hovered = useRef<HTMLTableElement | null>(null);
  const overHandle = useRef(false);
  const dragging = useRef(false);

  useEffect(() => {
    const view = editor.view;
    const sheet = view.dom.closest<HTMLElement>(".docs-sheet");
    if (!sheet) return;
    /** The table to show handles on: the one under the mouse, else the one the cursor is in. */
    const pick = () => {
      if (dragging.current) return;
      let current = hovered.current;
      if (!current && editor.isActive("table")) {
        const t = tableAt(editor.state);
        const dom = t && view.nodeDOM(t.pos);
        current = dom instanceof HTMLElement ? dom.querySelector("table") : null;
      }
      setTable(view.editable ? current : null);
      redraw((n) => n + 1);
    };
    let leave: ReturnType<typeof setTimeout> | undefined;
    const move = (e: MouseEvent) => {
      const over = (e.target as HTMLElement).closest?.("table");
      const ours = over && view.dom.contains(over) && over.parentElement?.classList.contains("tableWrapper") ? over : null;
      clearTimeout(leave);
      if (ours || overHandle.current) {
        if (ours) hovered.current = ours;
        pick();
      } else if (hovered.current) {
        // A moment's grace, to reach the handles just outside the table.
        leave = setTimeout(() => {
          hovered.current = null;
          pick();
        }, 400);
      }
    };
    sheet.addEventListener("mousemove", move);
    editor.on("transaction", pick);
    const observer = new ResizeObserver(pick);
    observer.observe(sheet);
    return () => {
      clearTimeout(leave);
      sheet.removeEventListener("mousemove", move);
      editor.off("transaction", pick);
      observer.disconnect();
    };
  }, [editor]);

  if (!table || !table.isConnected) return null;
  const sheet = editor.view.dom.closest<HTMLElement>(".docs-sheet");
  if (!sheet) return null;
  const origin = sheet.getBoundingClientRect();
  const scale = origin.width / sheet.offsetWidth || 1;
  const r = table.getBoundingClientRect();
  const box = { left: (r.left - origin.left) / scale, top: (r.top - origin.top) / scale, width: r.width / scale, height: r.height / scale };
  // The handles stay the same size on screen at any zoom.
  const k = 1 / scale;

  const hover = (on: boolean) => () => (overHandle.current = on);

  /** Click: select the table. Drag: move it, to where the blue line shows. */
  const startMove = (e: PointerEvent) => {
    e.preventDefault();
    const t = tableOfDom(editor.view, table);
    if (!t) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let line: HTMLDivElement | null = null;
    let to: number | null = null;
    const move = (ev: globalThis.PointerEvent) => {
      if (!line && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      dragging.current = true;
      line ??= guide("docs-drop-guide");
      const place = dropPlace(editor.view, ev.clientX, ev.clientY);
      const inside = place && place.pos >= t.pos && place.pos <= t.pos + t.node.nodeSize;
      to = place && !inside ? place.pos : null;
      line.style.display = to === null ? "none" : "";
      if (place) Object.assign(line.style, { left: `${place.rect.left}px`, width: `${place.rect.width}px`, top: `${place.above ? place.rect.top - 2 : place.rect.bottom + 1}px` });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragging.current = false;
      if (line) {
        line.remove();
        if (to !== null) moveTable(editor, t, to);
      } else selectTablePart(editor, "table", t);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /** Drag the corner: the whole table gets bigger or smaller, columns and rows alike. */
  const startResize = (e: PointerEvent) => {
    e.preventDefault();
    const t = tableOfDom(editor.view, table);
    if (!t) return;
    const start = table.getBoundingClientRect();
    const outline = guide("docs-resize-box");
    Object.assign(outline.style, { left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.height}px` });
    dragging.current = true;
    let w = start.width;
    let h = start.height;
    const move = (ev: globalThis.PointerEvent) => {
      w = Math.max(40 * scale, ev.clientX - start.left);
      h = Math.max(16 * scale, ev.clientY - start.top);
      Object.assign(outline.style, { width: `${w}px`, height: `${h}px` });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      outline.remove();
      dragging.current = false;
      if (Math.abs(w - start.width) > 1 || Math.abs(h - start.height) > 1) scaleTable(editor, t, w / start.width, h / start.height);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <>
      <button
        type="button"
        title="Select or move the table"
        aria-label="Table: select or move"
        onPointerDown={startMove}
        onMouseEnter={hover(true)}
        onMouseLeave={hover(false)}
        className="docs-table-handle absolute z-10 flex cursor-move items-center justify-center border border-slate-400 bg-white text-slate-600"
        style={{ left: box.left - 16 * k, top: box.top - 16 * k, width: 14 * k, height: 14 * k, borderWidth: k }}
      >
        <Move size={10 * k} />
      </button>
      <span
        title="Resize the table"
        aria-hidden
        onPointerDown={startResize}
        onMouseEnter={hover(true)}
        onMouseLeave={hover(false)}
        className="docs-table-handle absolute z-10 cursor-nwse-resize border border-slate-500 bg-white"
        style={{ left: box.left + box.width + 2 * k, top: box.top + box.height + 2 * k, width: 7 * k, height: 7 * k, borderWidth: k }}
      />
    </>
  );
}
