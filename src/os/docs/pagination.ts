// Real pages, like Word's Print Layout: the text runs down a sheet of paper, and when the sheet is
// full the rest moves onto the next one. The browser still lays out the text. After every change,
// Docs measures where each line landed and puts a gap where a page fills up, as big as the rest of
// the page, the bottom margin, the space between sheets and the next top margin. The gaps are
// decorations, so they never become part of the document or its saved file.
//
// As in Word, paragraphs split between lines without leaving a single line behind or alone on the
// next page (widow and orphan control), headings stay with the paragraph after them, table rows move
// whole, and a page break starts a new page. Pictures and other blocks move whole too.

import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/** The grey space between sheets. */
export const PAGE_GAP = 24;

/** Margins are never this big, so a correction this big is a mistake (say, the text moving while it was measured). */
const MAX_FIX = 48;

export interface PageSetup {
  /** The height of a sheet. */
  height: number;
  marginBottom: number;
  /** Off while the text is in columns: they're balanced on one long page instead. */
  enabled: boolean;
  onPages: (pages: number) => void;
  /** Which page each footnote is on, and where the endnotes start (after the last line of text). */
  onNotes?: (notes: NotePlaces) => void;
}

export interface NotePlaces {
  footnotes: Record<string, number>;
  endnotes: { page: number; top: number } | null;
}

/** The short line above a page's footnotes, and the space around it. */
export const NOTE_SEPARATOR = 18;

/**
 * Where a page gap goes: inside a paragraph, at the start of a line ("line"), between blocks
 * ("block"), or at the top of a table row's cells ("row").
 */
interface Break {
  kind: "line" | "block" | "row";
  pos: number;
  height: number;
  /** How far a gap between blocks was off last time (margins above and below it stop collapsing). */
  fix: number;
}

interface PagesState {
  breaks: Break[];
  decorations: DecorationSet;
  /** Goes up when the pages must be measured again although the text hasn't changed. */
  version: number;
}

const pagesKey = new PluginKey<PagesState>("docs-pages");

/** Measures again: after a change of paper size, or when the text moves into or out of columns. */
export function setPageSetup(view: EditorView, setup: PageSetup) {
  setups.set(view, setup);
  view.dispatch(view.state.tr.setMeta(pagesKey, { remeasure: true }).setMeta("addToHistory", false));
}

const setups = new WeakMap<EditorView, PageSetup>();

/** Measures the pages again, say when a footnote's text grows. */
export function remeasure(view: EditorView) {
  if (setups.has(view)) view.dispatch(view.state.tr.setMeta(pagesKey, { remeasure: true }).setMeta("addToHistory", false));
}

function gapElement(tag: "span" | "div", height: number) {
  const el = document.createElement(tag);
  el.className = "docs-page-gap";
  el.style.height = `${height}px`;
  el.setAttribute("aria-hidden", "true");
  return el;
}

function decorate(doc: PMNode, breaks: Break[]) {
  const decorations: Decoration[] = [];
  for (const b of breaks) {
    if (b.kind === "row") {
      const row = doc.nodeAt(b.pos);
      row?.forEach((cell, offset) => {
        const from = b.pos + 1 + offset;
        decorations.push(Decoration.node(from, from + cell.nodeSize, { class: "docs-gap-cell", style: `--docs-gap: ${b.height}px` }));
      });
    } else {
      const tag = b.kind === "line" ? "span" : "div";
      decorations.push(Decoration.widget(b.pos, () => gapElement(tag, b.height), { side: -1, key: `${b.kind}-${b.pos}-${b.height}`, ignoreSelection: true }));
    }
  }
  return DecorationSet.create(doc, decorations);
}

const sameBreaks = (a: Break[], b: Break[]) =>
  a.length === b.length && a.every((x, i) => x.kind === b[i].kind && x.pos === b[i].pos && Math.abs(x.height - b[i].height) < 0.5);

/** Something on the page that a gap can go before: a line of text, a table row, or a block. */
interface Unit {
  top: number;
  bottom: number;
  /** Where its gap goes, worked out only when it needs one. */
  place: () => { kind: Break["kind"]; pos: number };
  /** Its top again once the gaps are in, for the gaps between blocks, which are checked. */
  measure?: () => number;
  /** The paragraph it's a line of: the index of its first line, which line it is, and how many there are. */
  line?: { first: number; k: number; n: number };
  /** A heading's last line: it stays on the same page as what follows. */
  keepWithNext?: boolean;
  /** Comes after a page break. */
  newPage?: boolean;
  /** Footnotes marked on this line: they go at the bottom of its page. */
  notes?: string[];
  pageBreak?: boolean;
}

/** The lines of a paragraph, in the sheet's pixels. */
function linesOf(el: HTMLElement, toSheet: (r: DOMRect) => { top: number; bottom: number }) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const lines: { top: number; bottom: number; client: DOMRect }[] = [];
  for (const r of range.getClientRects()) {
    if (!r.height) continue;
    const { top, bottom } = toSheet(r);
    // Pieces side by side (a bold word, a link, the span around them) are on the same line.
    const same = lines.find((l) => top < l.bottom - 2 && bottom > l.top + 2);
    if (same) {
      same.top = Math.min(same.top, top);
      same.bottom = Math.max(same.bottom, bottom);
      if (r.left < same.client.left) same.client = r;
    } else lines.push({ top, bottom, client: r });
  }
  // An empty paragraph is still a line.
  if (!lines.length) {
    const r = el.getBoundingClientRect();
    lines.push({ ...toSheet(r), client: r });
  }
  return lines.sort((a, b) => a.top - b.top);
}

/**
 * Where a gap before the block at `pos` goes: before the list, quote or list item it starts, so
 * the bullet or the quote's bar moves with its text.
 */
function outside(doc: PMNode, pos: number) {
  let $pos = doc.resolve(pos);
  while ($pos.depth > 0 && $pos.index() === 0 && !$pos.parent.type.spec.tableRole) {
    pos = $pos.before();
    $pos = doc.resolve(pos);
  }
  return pos;
}

/** Everything a gap can go before, top to bottom, measured as the text lies without gaps. */
function unitsOf(view: EditorView, toSheet: (r: DOMRect) => { top: number; bottom: number }) {
  const { doc } = view.state;
  const units: Unit[] = [];
  let afterBreak = false;
  const push = (unit: Unit) => {
    if (afterBreak) unit.newPage = true;
    afterBreak = !!unit.pageBreak;
    units.push(unit);
  };

  doc.descendants((node, pos) => {
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return false;

    if (node.type.name === "table") {
      // Rows held together by a cell merged down across them move as one: the merged cell spreads
      // its height over its rows, so a gap between them wouldn't land where it's put.
      const rows: { pos: number; tr: HTMLElement; joined: boolean }[] = [];
      let spanEnd = 0;
      node.forEach((row, offset, r) => {
        const rowPos = pos + 1 + offset;
        const tr = view.nodeDOM(rowPos);
        if (!(tr instanceof HTMLElement)) return;
        rows.push({ pos: rowPos, tr, joined: r > 0 && r < spanEnd });
        row.forEach((cell) => (spanEnd = Math.max(spanEnd, r + ((cell.attrs.rowspan as number) || 1))));
      });
      let start = 0;
      while (start < rows.length) {
        let end = start + 1;
        while (end < rows.length && rows[end].joined) end++;
        const first = rows[start];
        const top = toSheet(first.tr.getBoundingClientRect()).top;
        const bottom = toSheet(rows[end - 1].tr.getBoundingClientRect()).bottom;
        push(
          start === 0
            ? { top, bottom, place: () => ({ kind: "block", pos: outside(doc, pos) }), measure: () => toSheet(first.tr.getBoundingClientRect()).top }
            : { top, bottom, place: () => ({ kind: "row", pos: first.pos }) },
        );
        start = end;
      }
      return false;
    }

    if (node.isTextblock) {
      const lines = linesOf(dom, toSheet);
      // Which line each footnote mark is on.
      const marks = [...dom.querySelectorAll<HTMLElement>("sup[data-note='footnote']")].map((m) => {
        const box = toSheet(m.getBoundingClientRect());
        return { id: m.getAttribute("data-id") ?? "", middle: (box.top + box.bottom) / 2 };
      });
      const first = units.length;
      const heading = node.type.name === "heading";
      lines.forEach((line, k) =>
        push({
          top: line.top,
          bottom: line.bottom,
          notes: marks.filter((m) => m.middle >= line.top - 1 && m.middle <= line.bottom + 1).map((m) => m.id),
          line: { first, k, n: lines.length },
          keepWithNext: heading && k === lines.length - 1,
          place: () => {
            if (k > 0) {
              const at = view.posAtCoords({ left: line.client.left + 1, top: line.client.top + line.client.height / 2 });
              if (at && at.pos > pos + 1 && at.pos < pos + node.nodeSize - 1) return { kind: "line", pos: at.pos };
            }
            return { kind: "block", pos: outside(doc, pos) };
          },
          measure: k === 0 ? () => linesOf(dom, toSheet)[0].top : undefined,
        }),
      );
      return false;
    }

    if (node.isAtom || node.isLeaf) {
      const box = toSheet(dom.getBoundingClientRect());
      const pageBreak = node.type.name === "pageBreak";
      // Pictures in front of or behind the text take no room.
      if (box.bottom - box.top < 1 && !pageBreak) return false;
      push({ ...box, pageBreak, place: () => ({ kind: "block", pos: outside(doc, pos) }), measure: () => toSheet(dom.getBoundingClientRect()).top });
      return false;
    }
    // Lists, list items and quotes: what's inside them.
    return true;
  });
  return units;
}

/** Splits the text into pages: where the gaps go, and how many pages there are. */
function paginate(view: EditorView, setup: PageSetup, previous: Break[]) {
  const sheet = view.dom.closest<HTMLElement>(".docs-sheet");
  if (!sheet) return null;
  const toSheet = (r: DOMRect) => {
    // Read each time: when a gap above the window changes size, the browser scrolls to keep the
    // text in view still, and the page moves.
    const origin = sheet.getBoundingClientRect();
    // The page may be zoomed: everything is worked out at 100%.
    const scale = origin.width / sheet.offsetWidth || 1;
    return { top: (r.top - origin.top) / scale, bottom: (r.bottom - origin.top) / scale };
  };
  const marginTop = toSheet(view.dom.getBoundingClientRect()).top;
  const marginBottom = setup.marginBottom;
  const stride = setup.height + PAGE_GAP;
  const textTop = (page: number) => page * stride + marginTop;
  const textBottom = (page: number) => page * stride + setup.height - marginBottom;

  // Measure the text as it lies with no gaps.
  sheet.classList.add("docs-measuring");
  const units = unitsOf(view, toSheet);
  // Each note's height, as the page shows it (DocsApp keeps copies of them to measure).
  const measured = sheet.querySelector(".docs-notes-measure");
  const noteHeight = (id: string) => measured?.querySelector<HTMLElement>(`[data-note-id="${CSS.escape(id)}"]`)?.offsetHeight ?? 0;
  const need = (u: Unit) => (u.notes ?? []).reduce((h, id) => h + noteHeight(id), 0);
  const fixes = new Map(previous.map((b) => [`${b.kind}-${b.pos}`, b.fix]));

  const breaks: (Break & { unit: number; target: number })[] = [];
  // How far each unit has been pushed down, and which page it's on.
  const offsets: number[] = [];
  const pages: number[] = [];
  let offset = 0;
  let page = 0;
  let pageStart = 0;
  // The footnotes on the page so far: the text stops above them.
  let reserved = 0;
  const reservedAt: number[] = [];
  const placed: number[] = [];
  const room = (more: number) => textBottom(page) - (reserved + more > 0 ? reserved + more + NOTE_SEPARATOR : 0);
  const breakAt = (i: number, newPage: number) => {
    const u = units[i];
    const top = u.top + offset;
    while (textTop(newPage) < top - 0.5) newPage++;
    const spot = u.place();
    const fix = spot.kind === "block" ? (fixes.get(`${spot.kind}-${spot.pos}`) ?? 0) : 0;
    const height = Math.max(0, Math.round((textTop(newPage) - top + fix) * 100) / 100);
    breaks.push({ ...spot, height, fix, unit: i, target: textTop(newPage) });
    offset += textTop(newPage) - top;
    page = newPage;
    pageStart = i;
    reserved = need(u);
  };

  for (let i = 0; i < units.length; i++) {
    offsets[i] = offset;
    pages[i] = page;
    reservedAt[i] = reserved;
    const u = units[i];
    if (i > 0 && u.newPage) {
      breakAt(i, page + 1);
      placed[i] = page;
      continue;
    }
    // A page break stays at the end of its page, even in the bottom margin.
    if (i === pageStart || u.pageBreak || u.bottom + offset <= room(need(u)) + 0.5) {
      if (i !== pageStart) reserved += need(u);
      placed[i] = page;
      continue;
    }
    // It doesn't fit: it, or an earlier line that should go with it, starts the next page.
    let j = i;
    if (u.line && u.line.n >= 2) {
      const { k, n } = u.line;
      // One line left behind (an orphan), or one line alone on the next page (a widow).
      if (k === 1 || (k === n - 1 && n >= 3)) j = i - 1;
    }
    for (;;) {
      const before = units[j - 1];
      const startsBlock = !units[j].line || units[j].line!.k === 0;
      if (!startsBlock || !before?.keepWithNext || !before.line) break;
      j = before.line.first;
    }
    if (j <= pageStart) j = i;
    if (j < i) {
      // Go back and start the page earlier.
      const from = breaks.findIndex((b) => b.unit >= j);
      if (from >= 0) breaks.length = from;
      offset = offsets[j];
      page = pages[j];
      reserved = reservedAt[j];
    }
    breakAt(j, page + 1);
    placed[j] = page;
    i = j;
  }
  sheet.classList.remove("docs-measuring");

  // Footnotes go on the page of the line they're marked on.
  const footnotes: Record<string, number> = {};
  units.forEach((u, i) => u.notes?.forEach((id) => (footnotes[id] = placed[i] ?? 0)));

  const last = units.at(-1);
  let count = page + 1 + (last?.pageBreak ? 1 : 0);
  // Something taller than a page runs on below it.
  if (last) count = Math.max(count, Math.floor((last.bottom + offset) / stride) + 1);

  // Endnotes come after the last line of text, on a new page if they don't fit there.
  let endnotes: NotePlaces["endnotes"] = null;
  const endHeight = measured?.querySelector<HTMLElement>("[data-endnotes]")?.offsetHeight ?? 0;
  if (endHeight) {
    let top = last ? last.bottom + offset + 12 : textTop(0);
    let at = page;
    if (top + endHeight > room(0)) {
      at = page + 1;
      top = textTop(at);
    }
    endnotes = { page: at, top };
    count = Math.max(count, at + 1);
  }
  return { breaks: breaks.map((b) => ({ ...b, measure: units[b.unit].measure })), pages: count, notes: { footnotes, endnotes } };
}

function measure(view: EditorView) {
  const setup = setups.get(view);
  const state = pagesKey.getState(view.state);
  if (!setup || !state) return;
  if (!setup.enabled) {
    if (state.breaks.length) apply(view, []);
    setup.onPages(1);
    view.dom.dispatchEvent(new CustomEvent(PAGINATED));
    return;
  }
  const result = paginate(view, setup, state.breaks);
  if (!result) return;
  const breaks: Break[] = result.breaks.map(({ kind, pos, height, fix }) => ({ kind, pos, height, fix }));
  if (!sameBreaks(breaks, state.breaks)) {
    apply(view, breaks);
    // A gap between blocks stops the margins above and below it collapsing into one, so it may
    // be a little off: measure each one's block and correct it.
    let moved = 0;
    let corrected = false;
    result.breaks.forEach((b, i) => {
      if (b.kind !== "block" || !b.measure) return;
      const off = b.target - (b.measure() + moved);
      if (Math.abs(off) < 0.5) return;
      breaks[i] = { ...breaks[i], height: Math.max(0, Math.round((breaks[i].height + off) * 100) / 100), fix: Math.max(-MAX_FIX, Math.min(MAX_FIX, breaks[i].fix + off)) };
      moved += off;
      corrected = true;
    });
    if (corrected) apply(view, breaks);
  }
  setup.onPages(result.pages);
  setup.onNotes?.(result.notes);
  // Page numbers in tables of contents and the index may have changed (refresh.ts).
  view.dom.dispatchEvent(new CustomEvent(PAGINATED));
}

/** Sent on the editor's page after the pages are worked out again. */
export const PAGINATED = "docs-paginated";

/** The page number (from 1) a spot on the screen is on. */
export function pageAt(view: EditorView, clientY: number) {
  const setup = setups.get(view);
  const sheet = view.dom.closest<HTMLElement>(".docs-sheet");
  if (!setup?.enabled || !sheet) return 1;
  const origin = sheet.getBoundingClientRect();
  const y = (clientY - origin.top) / (origin.width / sheet.offsetWidth || 1);
  return Math.max(1, Math.floor(y / (setup.height + PAGE_GAP)) + 1);
}

function apply(view: EditorView, breaks: Break[]) {
  view.dispatch(view.state.tr.setMeta(pagesKey, { breaks }).setMeta("addToHistory", false));
}

export const Pagination = Extension.create({
  name: "pagination",
  addProseMirrorPlugins() {
    return [
      new Plugin<PagesState>({
        key: pagesKey,
        state: {
          init: () => ({ breaks: [], decorations: DecorationSet.empty, version: 0 }),
          apply(tr, state, _old, next) {
            const meta = tr.getMeta(pagesKey) as { breaks?: Break[]; remeasure?: boolean } | undefined;
            if (meta?.breaks) return { ...state, breaks: meta.breaks, decorations: decorate(next.doc, meta.breaks) };
            const version = state.version + (meta?.remeasure ? 1 : 0);
            if (!tr.docChanged) return version === state.version ? state : { ...state, version };
            return {
              version,
              breaks: state.breaks.map((b) => ({ ...b, pos: tr.mapping.map(b.pos, -1) })),
              decorations: state.decorations.map(tr.mapping, tr.doc),
            };
          },
        },
        props: {
          decorations: (state) => pagesKey.getState(state)?.decorations,
        },
        view(view) {
          let queued = false;
          // Before the browser paints, so the text never shows without its gaps.
          const queue = () => {
            if (queued) return;
            queued = true;
            queueMicrotask(() => {
              queued = false;
              if (!view.isDestroyed) measure(view);
            });
          };
          // Pictures loading, fonts arriving and the window changing width all move the text.
          const observer = new ResizeObserver(queue);
          observer.observe(view.dom);
          document.fonts?.ready.then(queue);
          queue();
          return {
            update(view, previous) {
              const before = pagesKey.getState(previous);
              const now = pagesKey.getState(view.state);
              if (view.state.doc !== previous.doc || before?.version !== now?.version) queue();
            },
            destroy: () => observer.disconnect(),
          };
        },
      }),
    ];
  },
});
