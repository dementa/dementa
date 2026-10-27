// Keeps the References tab's pieces up to date as the document changes, as Word's "Update
// Table" and "Update Field" do, but on its own: footnote and caption numbers, citations in the
// citation style, the bibliography, and the tables of contents, of figures and the index with
// their page numbers. What each shows is saved with it (refNodes.ts), so the changes are made
// as one step that Undo skips over.

import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { PAGINATED, pageAt } from "./pagination";
import { bibliographyEntry, bibliographyOrder, citationText, NO_REFERENCES, type References } from "./references";
import type { IndexEntry, TocEntry } from "./refNodes";

const refsByView = new WeakMap<EditorView, References>();

/** Marks a refresh, so it isn't counted as an edit (DocsApp) or kept for Undo. */
export const REFRESH = "docsRefresh";

const refreshKey = new PluginKey("docs-refresh");

/** The sources and citation style, from the document's settings; the citations follow them. */
export function setReferences(view: EditorView, refs: References) {
  refsByView.set(view, refs);
  view.dispatch(view.state.tr.setMeta(refreshKey, true).setMeta("addToHistory", false).setMeta(REFRESH, true));
}

const ROMAN = [
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
] as const;

/** 1 → i, 4 → iv: Word numbers endnotes like this. */
export function roman(n: number) {
  let out = "";
  for (const [value, letters] of ROMAN) {
    while (n >= value) {
      out += letters;
      n -= value;
    }
  }
  return out;
}

/** A paragraph's text as shown, with caption numbers in it. */
function shownText(node: PMNode) {
  let text = "";
  node.forEach((child) => {
    if (child.isText) text += child.text;
    else if (child.type.name === "captionNumber") text += String(child.attrs.n);
  });
  return text.trim();
}

/** What every reference piece should show now: attribute changes by position. */
function work(view: EditorView) {
  const { doc } = view.state;
  const refs = refsByView.get(view) ?? NO_REFERENCES;
  const byId = new Map(refs.sources.map((s) => [s.id, s]));
  const page = (pos: number) => {
    try {
      return pageAt(view, view.coordsAtPos(Math.min(pos + 1, doc.content.size)).top);
    } catch {
      return 1;
    }
  };

  const changes: { pos: number; attrs: Record<string, unknown> }[] = [];
  const set = (node: PMNode, pos: number, attrs: Record<string, unknown>) => {
    if (Object.entries(attrs).some(([k, v]) => node.attrs[k] !== v)) changes.push({ pos, attrs: { ...node.attrs, ...attrs } });
  };

  // Numbers in document order, and which sources are cited first.
  let footnotes = 0;
  let endnotes = 0;
  const captions = new Map<string, number>();
  const citedOrder: string[] = [];
  const headings: TocEntry[] = [];
  const captionLines: (TocEntry & { label: string })[] = [];
  const marks: { main: string; sub: string; page: number }[] = [];
  const blocks: { node: PMNode; pos: number }[] = [];

  doc.descendants((node, pos, parent) => {
    switch (node.type.name) {
      case "note":
        set(node, pos, { label: node.attrs.kind === "endnote" ? roman(++endnotes) : String(++footnotes) });
        break;
      case "captionNumber": {
        const n = (captions.get(node.attrs.label) ?? 0) + 1;
        captions.set(node.attrs.label, n);
        set(node, pos, { n });
        if (parent) captionLines.push({ label: node.attrs.label, text: "", level: 1, page: 0, pos });
        break;
      }
      case "citation":
        for (const id of String(node.attrs.sources).split(",").filter(Boolean)) if (!citedOrder.includes(id)) citedOrder.push(id);
        break;
      case "heading":
        if (node.textContent.trim()) headings.push({ text: node.textContent.trim(), level: node.attrs.level, page: page(pos), pos });
        break;
      case "indexMark":
        if (node.attrs.main) marks.push({ main: node.attrs.main, sub: node.attrs.sub, page: page(pos) });
        break;
      case "refBlock":
        blocks.push({ node, pos });
        break;
    }
  });

  // Caption lines: the whole paragraph each number is in.
  for (const line of captionLines) {
    const $pos = doc.resolve(line.pos);
    const para = $pos.parent;
    line.text = shownText(para);
    line.pos = $pos.before();
    line.page = page(line.pos);
  }

  const number = (s: { id: string }) => {
    const i = citedOrder.indexOf(s.id);
    return i < 0 ? citedOrder.length + 1 : i + 1;
  };
  doc.descendants((node, pos) => {
    if (node.type.name !== "citation") return;
    const cited = String(node.attrs.sources)
      .split(",")
      .map((id) => byId.get(id))
      .filter((s) => s !== undefined);
    set(node, pos, { text: citationText(cited, refs.style, node.attrs.pages, number) });
  });

  const sorted = bibliographyOrder(refs.sources, refs.style, citedOrder);
  for (const { node, pos } of blocks) {
    let entries: unknown;
    switch (node.attrs.kind) {
      case "toc":
        entries = headings.filter((h) => h.level <= node.attrs.levels);
        break;
      case "figures":
        entries = captionLines.filter((c) => c.label === node.attrs.label).map(({ text, level, page, pos }) => ({ text, level, page, pos }));
        break;
      case "bibliography":
        entries = sorted.map((s, i) => bibliographyEntry(s, refs.style, i + 1));
        break;
      case "index": {
        const terms = new Map<string, IndexEntry>();
        for (const m of marks) {
          const key = `${m.main}\u0000${m.sub}`;
          const entry = terms.get(key) ?? { term: m.main, sub: m.sub, pages: [] };
          if (!entry.pages.includes(m.page)) entry.pages.push(m.page);
          terms.set(key, entry);
          // A sub-entry sits under its main entry, which is listed even without pages of its own.
          if (m.sub && !terms.has(`${m.main}\u0000`)) terms.set(`${m.main}\u0000`, { term: m.main, sub: "", pages: [] });
        }
        entries = [...terms.values()]
          .sort((a, b) => a.term.localeCompare(b.term) || a.sub.localeCompare(b.sub))
          .map((e) => ({ ...e, pages: e.pages.sort((a, b) => a - b) }));
        break;
      }
    }
    set(node, pos, { entries: JSON.stringify(entries ?? []) });
  }
  return changes;
}

export const ReferenceRefresh = Extension.create({
  name: "referenceRefresh",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: refreshKey,
        view(view) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const run = () => {
            if (view.isDestroyed) return;
            const changes = work(view);
            if (!changes.length) return;
            let tr = view.state.tr;
            for (const c of changes) tr = tr.setNodeMarkup(c.pos, undefined, c.attrs);
            view.dispatch(tr.setMeta("addToHistory", false).setMeta(REFRESH, true));
          };
          // Soon after a change, once the pages have settled.
          const soon = () => {
            clearTimeout(timer);
            timer = setTimeout(run, 120);
          };
          view.dom.addEventListener(PAGINATED, soon);
          soon();
          return {
            // Its own changes come back here too, but then there's nothing left to change.
            update(view, previous) {
              if (view.state.doc !== previous.doc || refreshKey.getState(view.state) !== refreshKey.getState(previous)) soon();
            },
            destroy() {
              clearTimeout(timer);
              view.dom.removeEventListener(PAGINATED, soon);
            },
          };
        },
        state: {
          init: () => 0,
          apply: (tr, n) => (tr.getMeta(refreshKey) ? n + 1 : n),
        },
      }),
    ];
  },
});

/** Runs the refresh now (Update Table, Update Index). */
export function refreshNow(view: EditorView) {
  view.dom.dispatchEvent(new CustomEvent(PAGINATED));
}
