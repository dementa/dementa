// What the References tab puts in a document: footnote and endnote marks, citations, caption
// numbers and index entries in the text, and blocks for the table of contents, a table of
// figures, the bibliography and the index. Each keeps what it shows (its number, its entries) so
// a saved page or Word file has it; refresh.ts works these out again as the document changes.

import { Node } from "@tiptap/core";

export type NoteKind = "footnote" | "endnote";

const json = <T>(text: string | null, fallback: T): T => {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
};

/** A footnote or endnote: its mark in the text holds the note's own text. */
export const Note = Node.create({
  name: "note",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      id: { default: "", parseHTML: (el) => el.getAttribute("data-id") ?? "", renderHTML: (a) => ({ "data-id": a.id }) },
      kind: {
        default: "footnote",
        parseHTML: (el) => (el.getAttribute("data-note") === "endnote" ? "endnote" : "footnote"),
        renderHTML: (a) => ({ "data-note": a.kind }),
      },
      text: { default: "", parseHTML: (el) => el.getAttribute("data-text") ?? "", renderHTML: (a) => ({ "data-text": a.text }) },
      /** Its number as shown: 1, 2, 3 for footnotes; i, ii, iii for endnotes. */
      label: { default: "", parseHTML: (el) => el.textContent ?? "", renderHTML: () => ({}) },
    };
  },
  parseHTML: () => [{ tag: "sup[data-note]" }],
  renderHTML: ({ node, HTMLAttributes }) => ["sup", { ...HTMLAttributes, class: "docs-note-ref" }, node.attrs.label || "*"],
});

/** A citation of one or more sources (references.ts), shown in the document's citation style. */
export const Citation = Node.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      sources: { default: "", parseHTML: (el) => el.getAttribute("data-citation") ?? "", renderHTML: (a) => ({ "data-citation": a.sources }) },
      pages: { default: "", parseHTML: (el) => el.getAttribute("data-pages") ?? "", renderHTML: (a) => (a.pages ? { "data-pages": a.pages } : {}) },
      text: { default: "", parseHTML: (el) => el.textContent ?? "", renderHTML: () => ({}) },
    };
  },
  parseHTML: () => [{ tag: "span[data-citation]" }],
  renderHTML: ({ node, HTMLAttributes }) => ["span", { ...HTMLAttributes, class: "docs-citation" }, node.attrs.text || "(Citation)"],
});

/** The number in a caption: "Figure 1", "Table 2". */
export const CaptionNumber = Node.create({
  name: "captionNumber",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      label: { default: "Figure", parseHTML: (el) => el.getAttribute("data-caption") ?? "Figure", renderHTML: (a) => ({ "data-caption": a.label }) },
      n: { default: 1, parseHTML: (el) => Number(el.textContent) || 1, renderHTML: () => ({}) },
    };
  },
  parseHTML: () => [{ tag: "span[data-caption]" }],
  renderHTML: ({ node, HTMLAttributes }) => ["span", { ...HTMLAttributes, class: "docs-caption-number" }, String(node.attrs.n)],
});

/** Index › Mark Entry: hidden in the text, like Word's XE field, unless paragraph marks show. */
export const IndexMark = Node.create({
  name: "indexMark",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      main: { default: "", parseHTML: (el) => el.getAttribute("data-index") ?? "", renderHTML: (a) => ({ "data-index": a.main }) },
      sub: { default: "", parseHTML: (el) => el.getAttribute("data-index-sub") ?? "", renderHTML: (a) => (a.sub ? { "data-index-sub": a.sub } : {}) },
    };
  },
  parseHTML: () => [{ tag: "span[data-index]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", { ...HTMLAttributes, class: "docs-index-mark" }],
});

export type RefBlockKind = "toc" | "figures" | "bibliography" | "index";

/** A line of a table of contents or table of figures, with where it points. */
export interface TocEntry {
  text: string;
  level: number;
  page: number;
  pos: number;
}

export interface IndexEntry {
  term: string;
  sub: string;
  pages: number[];
}

/** Builds the block's page from what it keeps: its title and entries. */
function refBlockDom(kind: RefBlockKind, attrs: Record<string, unknown>) {
  const el = document.createElement("div");
  el.className = `docs-ref-block docs-ref-${kind}`;
  el.setAttribute("data-ref-block", kind);
  el.setAttribute("data-title", String(attrs.title ?? ""));
  el.setAttribute("data-label", String(attrs.label ?? ""));
  el.setAttribute("data-levels", String(attrs.levels ?? 3));
  el.setAttribute("data-entries", String(attrs.entries ?? "[]"));
  el.contentEditable = "false";
  if (attrs.title) {
    const title = document.createElement("p");
    title.className = "docs-ref-title";
    title.textContent = String(attrs.title);
    el.append(title);
  }
  if (kind === "toc" || kind === "figures") {
    const entries = json<TocEntry[]>(String(attrs.entries), []);
    for (const e of entries) {
      const line = document.createElement("p");
      line.className = "docs-toc-entry";
      line.setAttribute("data-target", String(e.pos));
      line.style.paddingLeft = `${(e.level - 1) * 1.5}em`;
      const text = document.createElement("span");
      text.className = "docs-toc-text";
      text.textContent = e.text;
      const dots = document.createElement("span");
      dots.className = "docs-toc-dots";
      const page = document.createElement("span");
      page.className = "docs-toc-page";
      page.textContent = String(e.page);
      line.append(text, dots, page);
      el.append(line);
    }
    if (!entries.length) el.append(Object.assign(document.createElement("p"), { className: "docs-ref-empty", textContent: kind === "toc" ? "No table of contents entries found. Use heading styles for the titles you want in it." : "No table of figures entries found. Insert captions first." }));
  } else if (kind === "bibliography") {
    // Entries are HTML Docs made itself (references.ts escapes the text), with titles in italics.
    for (const html of json<string[]>(String(attrs.entries), [])) {
      const line = document.createElement("p");
      line.className = "docs-bib-entry";
      line.innerHTML = html;
      el.append(line);
    }
  } else {
    for (const e of json<IndexEntry[]>(String(attrs.entries), [])) {
      const line = document.createElement("p");
      line.className = e.sub ? "docs-index-entry docs-index-sub" : "docs-index-entry";
      line.textContent = `${e.sub || e.term}, ${e.pages.join(", ")}`;
      el.append(line);
    }
  }
  return el;
}

/** The table of contents, a table of figures, the bibliography or the index. */
export const RefBlock = Node.create({
  name: "refBlock",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      kind: { default: "toc", parseHTML: (el) => el.getAttribute("data-ref-block") ?? "toc" },
      title: { default: "", parseHTML: (el) => el.getAttribute("data-title") ?? "" },
      /** Tables of figures: which captions (Figure, Table, Equation). */
      label: { default: "", parseHTML: (el) => el.getAttribute("data-label") ?? "" },
      /** Tables of contents: how many heading levels. */
      levels: { default: 3, parseHTML: (el) => Number(el.getAttribute("data-levels")) || 3 },
      entries: { default: "[]", parseHTML: (el) => el.getAttribute("data-entries") ?? "[]" },
    };
  },
  parseHTML: () => [{ tag: "div[data-ref-block]" }],
  renderHTML: ({ node }) => refBlockDom(node.attrs.kind as RefBlockKind, node.attrs),
});
