// What Word does to a table beyond typing in it: borders and shading on the selected cells,
// lining up their text, making rows or columns the same size, AutoFit, selecting a row, column or
// the whole table, moving the table and resizing it (by its corner or by a row's bottom border).

import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, type EditorState, type Transaction } from "@tiptap/pm/state";
import { CellSelection, selectedRect, TableMap, type Rect } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";

/** Word's plain table line ("Table Grid"): ½ pt, black. */
export const GRID_LINE = "1px solid #000000";

export interface TableAt {
  pos: number;
  node: PMNode;
  map: TableMap;
}

/** The table at a position in the document (the cursor's, by default). */
export function tableAt(state: EditorState, at = state.selection.from): TableAt | null {
  const $pos = state.doc.resolve(at);
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (node.type.name === "table") return { pos: $pos.before(d), node, map: TableMap.get(node) };
  }
  return null;
}

/** The table a DOM table belongs to. */
export function tableOfDom(view: EditorView, table: HTMLTableElement): TableAt | null {
  const cell = table.querySelector("td, th");
  if (!cell) return null;
  try {
    return tableAt(view.state, view.posAtDOM(cell, 0));
  } catch {
    return null;
  }
}

/** The selected cells as a rectangle (just the cursor's cell when no cells are selected). */
function selection(state: EditorState): (Rect & { table: TableAt }) | null {
  const table = tableAt(state);
  if (!table) return null;
  try {
    const rect = selectedRect(state);
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, table };
  } catch {
    return null;
  }
}

/** Each cell of a table, by its position in the document, with where it is in the grid. */
const cellsOf = (t: TableAt) => [...new Set(t.map.map)].map((rel) => ({ pos: t.pos + 1 + rel, rect: t.map.findCell(rel), node: t.node.nodeAt(rel)! }));

/** Sets attributes on many cells in one step (later patches to the same cell add to earlier ones). */
function patchCells(editor: Editor, patches: Map<number, Record<string, unknown>>, tr: Transaction = editor.state.tr) {
  for (const [pos, patch] of patches) {
    const node = tr.doc.nodeAt(pos);
    if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch });
  }
  editor.view.dispatch(tr);
  editor.commands.focus();
}

// ---- Borders and shading ----

export type BorderKind = "all" | "none" | "outside" | "inside" | "top" | "bottom" | "left" | "right" | "insideH" | "insideV";

const SIDES = [
  ["top", "borderTop", "borderBottom"],
  ["bottom", "borderBottom", "borderTop"],
  ["left", "borderLeft", "borderRight"],
  ["right", "borderRight", "borderLeft"],
] as const;

/**
 * Draws (or takes away) lines on the selected cells, as Word's Borders menu does. The cells on the
 * other side of an outside edge get the same line, so the two never disagree.
 */
export function setBorders(editor: Editor, kind: BorderKind) {
  const sel = selection(editor.state);
  if (!sel) return;
  const line = kind === "none" ? "none" : GRID_LINE;
  const patches = new Map<number, Record<string, unknown>>();
  const set = (pos: number, attr: string, value: string) => patches.set(pos, { ...patches.get(pos), [attr]: value });
  const cells = cellsOf(sel.table);
  const inside = (r: Rect) => r.left >= sel.left && r.right <= sel.right && r.top >= sel.top && r.bottom <= sel.bottom;
  for (const cell of cells) {
    if (!inside(cell.rect)) continue;
    for (const [side, attr] of SIDES) {
      const outer = side === "top" ? cell.rect.top === sel.top : side === "bottom" ? cell.rect.bottom === sel.bottom : side === "left" ? cell.rect.left === sel.left : cell.rect.right === sel.right;
      const wanted =
        kind === "all" || kind === "none"
          ? true
          : kind === "outside"
            ? outer
            : kind === "inside"
              ? !outer
              : kind === "insideH"
                ? !outer && (side === "top" || side === "bottom")
                : kind === "insideV"
                  ? !outer && (side === "left" || side === "right")
                  : outer && side === kind;
      if (!wanted) continue;
      set(cell.pos, attr, line);
      if (!outer) continue;
      // The neighbour across this edge, outside the selection.
      for (const other of cells) {
        if (inside(other.rect)) continue;
        const r = other.rect;
        const across =
          side === "top"
            ? r.bottom === cell.rect.top && r.left < cell.rect.right && r.right > cell.rect.left
            : side === "bottom"
              ? r.top === cell.rect.bottom && r.left < cell.rect.right && r.right > cell.rect.left
              : side === "left"
                ? r.right === cell.rect.left && r.top < cell.rect.bottom && r.bottom > cell.rect.top
                : r.left === cell.rect.right && r.top < cell.rect.bottom && r.bottom > cell.rect.top;
        if (across) set(other.pos, SIDES.find((s) => s[0] === side)![2], line);
      }
    }
  }
  patchCells(editor, patches);
}

/** The selected cells' background colour (null: none). */
export function shadeCells(editor: Editor, colour: string | null) {
  const sel = selection(editor.state);
  if (!sel) return;
  const patches = new Map<number, Record<string, unknown>>();
  for (const rel of sel.table.map.cellsInRect(sel)) patches.set(sel.table.pos + 1 + rel, { backgroundColor: colour });
  patchCells(editor, patches);
}

// ---- Lining up the text in cells ----

export type VAlign = "top" | "middle" | "bottom";
export type HAlign = "left" | "center" | "right";

/** Puts the selected cells' text at the top, middle or bottom, and left, centre or right (Cell Alignment). */
export function alignCells(editor: Editor, v: VAlign, h: HAlign) {
  const sel = selection(editor.state);
  if (!sel) return;
  const tr = editor.state.tr;
  for (const rel of sel.table.map.cellsInRect(sel)) {
    const pos = sel.table.pos + 1 + rel;
    const cell = tr.doc.nodeAt(pos);
    if (!cell) continue;
    tr.setNodeMarkup(pos, undefined, { ...cell.attrs, verticalAlign: v === "top" ? null : v });
    cell.descendants((node, offset) => {
      if (node.isTextblock && "textAlign" in node.attrs) tr.setNodeMarkup(pos + 1 + offset, undefined, { ...node.attrs, textAlign: h });
      return !node.isTextblock;
    });
  }
  editor.view.dispatch(tr);
  editor.commands.focus();
}

// ---- Sizes ----

/** Measures with pagination's spacing taken out, so rows are their own height. */
function measuring<T>(view: EditorView, measure: () => T): T {
  const sheet = view.dom.closest(".docs-sheet");
  const had = sheet?.classList.contains("docs-measuring");
  sheet?.classList.add("docs-measuring");
  try {
    return measure();
  } finally {
    if (!had) sheet?.classList.remove("docs-measuring");
  }
}

/** Each column's width and each row's height, as the table is drawn now (in page pixels). */
export function measureTable(view: EditorView, t: TableAt) {
  return measuring(view, () => {
    const { map } = t;
    const widths: number[] = [];
    for (let col = 0; col < map.width; col++) {
      let found = 0;
      for (let row = 0; row < map.height && !found; row++) {
        const rel = map.map[row * map.width + col];
        const r = map.findCell(rel);
        if (r.right - r.left !== 1) continue;
        const dom = view.nodeDOM(t.pos + 1 + rel);
        if (dom instanceof HTMLElement) found = dom.offsetWidth;
      }
      widths.push(found);
    }
    // Columns only ever seen in merged cells share what's left of the table's width.
    const table = (view.nodeDOM(t.pos) as HTMLElement | null)?.querySelector("table");
    const total = table?.offsetWidth ?? 0;
    const missing = widths.filter((w) => !w).length;
    if (missing) {
      const share = Math.max(24, (total - widths.reduce((a, b) => a + b, 0)) / missing);
      widths.forEach((w, i) => (widths[i] = w || share));
    }
    const heights: number[] = [];
    const rows = table?.querySelectorAll(":scope > tbody > tr");
    for (let row = 0; row < map.height; row++) heights.push((rows?.[row] as HTMLElement | undefined)?.offsetHeight ?? 0);
    return { widths, heights };
  });
}

/** Writes column widths (and, if given, row heights) into the table's cells; `table` patches the table itself. */
function writeSizes(editor: Editor, t: TableAt, widths: number[] | null, heights: (number | null | undefined)[] | null, table: Record<string, unknown> = {}) {
  const patches = new Map<number, Record<string, unknown>>();
  for (const cell of cellsOf(t)) {
    const patch: Record<string, unknown> = {};
    if (widths) patch.colwidth = widths.slice(cell.rect.left, cell.rect.right).map((w) => Math.max(8, Math.round(w)));
    // A row's height goes on its cells that don't reach into the rows below (undefined: left as it is).
    const h = heights?.[cell.rect.top];
    if (h !== undefined && cell.rect.bottom - cell.rect.top === 1) patch.height = h === null ? null : `${Math.max(8, Math.round(h))}px`;
    patches.set(cell.pos, patch);
  }
  const tr = editor.state.tr;
  // Columns given widths stop fitting their text (AutoFit to Contents).
  tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, ...(widths && { autofit: null }), ...table });
  patchCells(editor, patches, tr);
}

/** Makes the selected rows the same height (Distribute Rows), or the columns the same width. */
export function distribute(editor: Editor, what: "rows" | "columns") {
  const sel = selection(editor.state);
  if (!sel) return;
  const t = sel.table;
  const { widths, heights } = measureTable(editor.view, t);
  // With one row or column picked, Word evens out the whole table.
  const whole = what === "rows" ? sel.bottom - sel.top < 2 : sel.right - sel.left < 2;
  const [from, to] = what === "rows" ? (whole ? [0, t.map.height] : [sel.top, sel.bottom]) : whole ? [0, t.map.width] : [sel.left, sel.right];
  const list = what === "rows" ? heights : widths;
  const even = list.slice(from, to).reduce((a, b) => a + b, 0) / (to - from);
  const next = list.map((v, i) => (i >= from && i < to ? even : v));
  if (what === "rows") writeSizes(editor, t, null, next.map((v, i) => (i >= from && i < to ? v : undefined)));
  else writeSizes(editor, t, next, null);
}

export type AutoFit = "contents" | "window" | "fixed";

/** AutoFit: to the text in the cells, to the page's width, or columns that keep their widths. */
export function autoFit(editor: Editor, how: AutoFit) {
  const t = tableAt(editor.state);
  if (!t) return;
  if (how === "fixed") return writeSizes(editor, t, measureTable(editor.view, t).widths, null);
  const tr = editor.state.tr;
  tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, autofit: how === "contents" ? "contents" : null, indent: null });
  const patches = new Map<number, Record<string, unknown>>();
  for (const cell of cellsOf(t)) patches.set(cell.pos, { colwidth: null });
  patchCells(editor, patches, tr);
}

/** Resizes the whole table by its corner: every column and row by the same proportion. */
export function scaleTable(editor: Editor, t: TableAt, fx: number, fy: number) {
  const { widths, heights } = measureTable(editor.view, t);
  const rows = Math.abs(fy - 1) > 0.02 ? heights.map((h) => h * fy) : null;
  writeSizes(editor, t, widths.map((w) => w * fx), rows);
}

/** The narrowest a column gets by dragging its border. */
const MIN_COLUMN = 16;

/**
 * Moves a column border, as dragging it does in Word: the columns on either side share the
 * change and the rest stay as they are. The table's right edge widens or narrows the last column;
 * its left edge moves the table's left side, the first column taking up the difference.
 */
export function moveColumnBorder(editor: Editor, t: TableAt, border: number, delta: number) {
  const widths = measureTable(editor.view, t).widths;
  const last = t.map.width;
  if (border === 0) {
    const d = Math.min(delta, widths[0] - MIN_COLUMN);
    widths[0] -= d;
    return writeSizes(editor, t, widths, null, { indent: Math.round((Number(t.node.attrs.indent) || 0) + d) || null });
  }
  if (border === last) widths[last - 1] = Math.max(MIN_COLUMN, widths[last - 1] + delta);
  else {
    const d = Math.max(MIN_COLUMN - widths[border - 1], Math.min(delta, widths[border] - MIN_COLUMN));
    widths[border - 1] += d;
    widths[border] -= d;
  }
  writeSizes(editor, t, widths, null);
}

/** Sets one row's height (dragging its bottom border). */
export function setRowHeight(editor: Editor, t: TableAt, row: number, height: number) {
  writeSizes(editor, t, null, Array.from({ length: t.map.height }, (_, i) => (i === row ? height : undefined)));
}

// ---- Selecting and moving ----

export function selectTablePart(editor: Editor, part: "cell" | "row" | "column" | "table", t = tableAt(editor.state)) {
  if (!t) return;
  const { doc } = editor.state;
  const first = t.pos + 1 + t.map.map[0];
  const last = t.pos + 1 + t.map.map[t.map.map.length - 1];
  const here = (() => {
    try {
      const rect = selectedRect(editor.state);
      return t.pos + 1 + rect.map.map[rect.top * rect.map.width + rect.left];
    } catch {
      return first;
    }
  })();
  const $here = doc.resolve(here);
  const sel =
    part === "table"
      ? CellSelection.create(doc, first, last)
      : part === "row"
        ? CellSelection.rowSelection($here)
        : part === "column"
          ? CellSelection.colSelection($here)
          : CellSelection.create(doc, here);
  editor.view.dispatch(editor.state.tr.setSelection(sel));
  editor.commands.focus();
}

/** Moves the table to a place between blocks (a position in the document). */
export function moveTable(editor: Editor, t: TableAt, to: number) {
  if (to >= t.pos && to <= t.pos + t.node.nodeSize) return;
  const tr = editor.state.tr.delete(t.pos, t.pos + t.node.nodeSize);
  const at = tr.mapping.map(to);
  tr.insert(at, t.node);
  // Keep the cursor in the table, at its first cell.
  tr.setSelection(CellSelection.create(tr.doc, at + 1 + t.map.map[0]));
  editor.view.dispatch(tr.scrollIntoView());
  editor.commands.focus();
}

/** Where a table dropped at a point would go: before or after the block under it. */
export function dropPlace(view: EditorView, x: number, y: number): { pos: number; rect: DOMRect; above: boolean } | null {
  const hit = view.posAtCoords({ left: x, top: y });
  if (!hit) return null;
  const $pos = view.state.doc.resolve(hit.pos);
  if ($pos.depth === 0) return null;
  const start = $pos.before(1);
  const dom = view.nodeDOM(start);
  if (!(dom instanceof HTMLElement)) return null;
  const rect = dom.getBoundingClientRect();
  const above = y < rect.top + rect.height / 2;
  return { pos: above ? start : $pos.after(1), rect, above };
}

// ---- The mouse on a table: right-clicking what's selected, and dragging its borders ----

const EDGE = 4;

/** Whether a document position is inside what's selected (selected cells, or selected text). */
export function inSelection(state: EditorState, pos: number) {
  const sel = state.selection;
  if (sel instanceof CellSelection) return sel.ranges.some((r) => pos >= r.$from.pos && pos <= r.$to.pos);
  return !sel.empty && pos >= sel.from && pos <= sel.to;
}

type Edge = { t: TableAt; table: HTMLTableElement } & ({ kind: "column"; border: number } | { kind: "row"; row: number });

/** The table border under the mouse: a column's side (by its place in the grid) or a row's bottom. */
function edgeAt(view: EditorView, e: MouseEvent): Edge | null {
  const cell = (e.target as HTMLElement).closest?.<HTMLElement>("td, th");
  const table = cell?.closest("table");
  if (!cell || !table || !view.dom.contains(cell)) return null;
  const t = tableOfDom(view, table);
  if (!t) return null;
  let rel: number;
  try {
    const $in = view.state.doc.resolve(view.posAtDOM(cell, 0));
    let d = $in.depth;
    while (d > 0 && !/^table(Cell|Header)$/.test($in.node(d).type.name)) d--;
    if (!d) return null;
    rel = $in.before(d) - t.pos - 1;
  } catch {
    return null;
  }
  const grid = t.map.findCell(rel);
  const r = cell.getBoundingClientRect();
  const right = Math.abs(e.clientX - r.right);
  const left = Math.abs(e.clientX - r.left);
  // A row's border is also the top of the cell below it (not the table's top edge, which doesn't move).
  const bottom = Math.abs(e.clientY - r.bottom);
  const top = grid.top > 0 ? Math.abs(e.clientY - r.top) : Infinity;
  const side = Math.min(right, left);
  if (side <= EDGE && side <= Math.min(bottom, top)) return { t, table, kind: "column", border: right <= left ? grid.right : grid.left };
  if (Math.min(bottom, top) <= EDGE) return { t, table, kind: "row", row: bottom <= top ? grid.bottom - 1 : grid.top - 1 };
  return null;
}

/** A dashed line along a border being dragged (in screen pixels). */
function dragGuide(edge: Edge, at: number) {
  const box = edge.table.getBoundingClientRect();
  const guide = document.createElement("div");
  guide.className = edge.kind === "row" ? "docs-resize-guide" : "docs-resize-guide-v";
  Object.assign(guide.style, edge.kind === "row" ? { left: `${box.left}px`, width: `${box.width}px`, top: `${at}px` } : { top: `${box.top}px`, height: `${box.height}px`, left: `${at}px` });
  document.body.append(guide);
  return guide;
}

/**
 * Keeps the selection when it's right-clicked (the browser would select the word under the mouse
 * instead, losing selected cells before Merge Cells could use them), and lets a table's borders be
 * dragged as in Word: a column border moves between its two columns, a row's bottom border changes
 * that row's height.
 */
export const TableMouse = Extension.create({
  name: "tableMouse",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            mousemove(view, e) {
              if (e.buttons || !view.editable) return false;
              const edge = edgeAt(view, e);
              view.dom.classList.toggle("docs-row-resize", edge?.kind === "row");
              view.dom.classList.toggle("docs-col-resize", edge?.kind === "column");
              return false;
            },
            mouseleave(view) {
              view.dom.classList.remove("docs-row-resize", "docs-col-resize");
              return false;
            },
            mousedown(view, e) {
              if (e.button === 2) {
                const hit = view.posAtCoords({ left: e.clientX, top: e.clientY });
                if (!hit || !inSelection(view.state, hit.pos)) return false;
                e.preventDefault();
                return true;
              }
              if (e.button !== 0 || !view.editable) return false;
              const edge = edgeAt(view, e);
              if (!edge) return false;
              e.preventDefault();
              const sheet = view.dom.closest<HTMLElement>(".docs-sheet");
              const scale = sheet ? sheet.getBoundingClientRect().width / sheet.offsetWidth || 1 : 1;
              const row = edge.kind === "row";
              const start = row ? e.clientY : e.clientX;
              const guide = dragGuide(edge, start);
              const startHeight = row ? measureTable(view, edge.t).heights[edge.row] : 0;
              let moved = 0;
              const move = (ev: MouseEvent) => {
                moved = (row ? ev.clientY : ev.clientX) - start;
                // A row can't be dragged shorter than a line.
                if (row) moved = Math.max(moved, (8 - startHeight) * scale);
                guide.style[row ? "top" : "left"] = `${start + moved}px`;
              };
              const up = () => {
                window.removeEventListener("mousemove", move);
                window.removeEventListener("mouseup", up);
                guide.remove();
                if (Math.abs(moved) < 1) return;
                if (edge.kind === "row") setRowHeight(editor, edge.t, edge.row, startHeight + moved / scale);
                else moveColumnBorder(editor, edge.t, edge.border, moved / scale);
              };
              window.addEventListener("mousemove", move);
              window.addEventListener("mouseup", up);
              return true;
            },
          },
        },
      }),
    ];
  },
});
