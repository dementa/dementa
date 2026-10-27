// Things the Insert tab puts in a document that Tiptap doesn't ship: page and column breaks, cover pages,
// bookmarks (with links that jump to them) and charts that can be changed after they're inserted.

import { Extension, Node, type ChainedCommands } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, TextSelection, type Transaction } from "@tiptap/pm/state";
import { ReactNodeViewRenderer, type Editor } from "@tiptap/react";
import { PictureView, stackOf } from "./PictureView";
import { EDIT_SHAPE_TEXT, isLine, readShape, shapePicture } from "./shapes";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      setPageBreak: () => ReturnType;
    };
    columnBreak: {
      setColumnBreak: () => ReturnType;
    };
  }
}

/** Puts a page or column break at the cursor, and the cursor on the next line (adding one at the end of the document). */
const insertBreak = (chain: () => ChainedCommands, type: string) =>
  chain()
    .insertContent({ type })
    .command(({ tr, dispatch }) => {
      if (dispatch) {
        const { $to } = tr.selection;
        if ($to.nodeAfter?.isTextblock) tr.setSelection(TextSelection.create(tr.doc, $to.pos + 1));
        else if (!$to.nodeAfter) {
          const end = $to.end();
          tr.insert(end, tr.doc.type.schema.nodes.paragraph.create());
          tr.setSelection(TextSelection.create(tr.doc, end + 1));
        }
        tr.scrollIntoView();
      }
      return true;
    })
    .run();

// ---- Page break (Ctrl+Enter, like Word) ----

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  // Runs before the line break's own Ctrl+Enter.
  priority: 1000,
  parseHTML: () => [{ tag: "div[data-page-break]" }],
  // The inline style makes printers (and Word) start a new page here.
  renderHTML: () => ["div", { "data-page-break": "", style: "break-after: page" }],
  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          insertBreak(chain, this.name),
    };
  },
  addKeyboardShortcuts() {
    return { "Mod-Enter": () => this.editor.commands.setPageBreak() };
  },
});

// ---- Column break (Ctrl+Shift+Enter, like Word) ----

/** Text after it starts at the top of the next column. */
export const ColumnBreak = PageBreak.extend({
  name: "columnBreak",
  parseHTML: () => [{ tag: "div[data-column-break]" }],
  renderHTML: () => ["div", { "data-column-break": "", style: "break-after: column" }],
  addCommands() {
    return {
      setColumnBreak:
        () =>
        ({ chain }) =>
          insertBreak(chain, this.name),
    };
  },
  addKeyboardShortcuts() {
    return { "Mod-Shift-Enter": () => this.editor.commands.setColumnBreak() };
  },
});

// ---- Cover page ----

/** Marks the paragraphs and page break of a cover page, so it can be replaced or removed. */
export const CoverPage = Extension.create({
  name: "coverPage",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "pageBreak"],
        attributes: {
          cover: {
            default: false,
            keepOnSplit: false,
            parseHTML: (el) => el.hasAttribute("data-cover"),
            renderHTML: (attrs) => (attrs.cover ? { "data-cover": "" } : {}),
          },
        },
      },
    ];
  },
});

export type CoverDesign = "simple" | "banded" | "centered";

export const COVER_DESIGNS: { id: CoverDesign; name: string }[] = [
  { id: "simple", name: "Simple" },
  { id: "banded", name: "Banded" },
  { id: "centered", name: "Centered" },
];

const BLUE = "#2b579a";

/** Where the cover page ends (after its page break), or 0 if there isn't one. */
function coverEnd(doc: PMNode) {
  // A cover page starts the document; lines typed into it since still belong to it.
  if (!doc.firstChild?.attrs.cover) return 0;
  let pos = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    pos += child.nodeSize;
    if (child.type.name === "pageBreak" && child.attrs.cover) return pos;
  }
  return 0;
}

export const hasCoverPage = (editor: Editor) => coverEnd(editor.state.doc) > 0;

export function removeCoverPage(editor: Editor) {
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      const end = coverEnd(tr.doc);
      if (!end) return false;
      if (end === tr.doc.content.size) tr.replaceWith(0, end, tr.doc.type.schema.nodes.paragraph.create());
      else tr.delete(0, end);
      return true;
    })
    .run();
}

/** Puts a cover page at the start of the document, replacing the one already there. */
export function insertCoverPage(editor: Editor, design: CoverDesign) {
  const align = design === "centered" ? "center" : "left";
  const banded = design === "banded";
  const text = (value: string, color?: string) => [
    { type: "text", text: value, ...(color ? { marks: [{ type: "textStyle", attrs: { color } }] } : {}) },
  ];
  const para = (attrs: Record<string, unknown> = {}, content?: ReturnType<typeof text>) => ({
    type: "paragraph",
    attrs: { cover: true, textAlign: align, ...attrs },
    ...(content ? { content } : {}),
  });
  const space = (n: number) => Array.from({ length: n }, () => para());
  const date = new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  const content = [
    ...space(design === "centered" ? 8 : 4),
    para({ styleName: "title", ...(banded ? { shading: BLUE } : {}) }, text("[Document title]", banded ? "#ffffff" : undefined)),
    para(
      { styleName: "subtitle", ...(banded ? { shading: "#dbe5f5" } : { border: design === "centered" ? "top" : "bottom" }) },
      text("[Document subtitle]"),
    ),
    ...space(design === "centered" ? 8 : 10),
    para({}, text("[Your name]", BLUE)),
    para({}, text(date)),
    { type: "pageBreak", attrs: { cover: true } },
  ];

  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      const end = coverEnd(tr.doc);
      if (end) tr.delete(0, end);
      return true;
    })
    .insertContentAt(0, content)
    .command(({ tr }) => {
      // Select "[Document title]" so typing replaces it.
      tr.doc.descendants((node, pos) => {
        if (node.isText && node.text === "[Document title]") {
          tr.setSelection(TextSelection.create(tr.doc, pos, pos + node.nodeSize));
          return false;
        }
      });
      tr.scrollIntoView();
      return true;
    })
    .run();
}

// ---- Page numbers ----

/**
 * Word's PAGE and NUMPAGES fields, for headers and footers: the page's number, or how many pages
 * there are. Each page fills in its own number when it's drawn (headerFooter.tsx).
 */
export const PageField = Node.create({
  name: "pageField",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      kind: {
        default: "page",
        parseHTML: (el) => (el.getAttribute("data-field") === "pages" ? "pages" : "page"),
        renderHTML: (attrs) => ({ "data-field": attrs.kind }),
      },
    };
  },
  parseHTML: () => [{ tag: "span[data-field]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", HTMLAttributes],
});

// ---- Bookmarks and cross-references ----

/** Word's rule: starts with a letter, then letters, digits or _ (no spaces), up to 40 long. */
export const BOOKMARK_NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

export const Bookmark = Node.create({
  name: "bookmark",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      name: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-bookmark") || el.id,
        // The id is what a link to "#name" jumps to in a web browser.
        renderHTML: (attrs) => ({ id: attrs.name, "data-bookmark": attrs.name }),
      },
    };
  },
  parseHTML: () => [{ tag: "span[data-bookmark]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", HTMLAttributes],
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          // Ctrl+click on a cross-reference jumps to what it points at, like Word.
          handleClick(_view, _pos, event) {
            const link = (event.target as HTMLElement).closest?.("a[href^='#']");
            if (!link || !(event.ctrlKey || event.metaKey)) return false;
            return goToBookmark(editor, decodeURIComponent(link.getAttribute("href")!.slice(1)));
          },
        },
      }),
    ];
  },
});

export interface Found {
  name: string;
  pos: number;
}

export function listBookmarks(doc: PMNode): Found[] {
  const found: Found[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "bookmark") found.push({ name: node.attrs.name, pos });
  });
  return found;
}

/** Adds a bookmark at the cursor. A bookmark with the same name moves here. */
export function addBookmark(editor: Editor, name: string) {
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      for (const b of listBookmarks(tr.doc).reverse()) if (b.name === name) tr.delete(b.pos, b.pos + 1);
      tr.insert(tr.selection.from, state.schema.nodes.bookmark.create({ name }));
      return true;
    })
    .run();
}

export function deleteBookmark(editor: Editor, name: string) {
  editor
    .chain()
    .command(({ tr }) => {
      for (const b of listBookmarks(tr.doc).reverse()) if (b.name === name) tr.delete(b.pos, b.pos + 1);
      return true;
    })
    .run();
}

export function goToBookmark(editor: Editor, name: string) {
  const target = listBookmarks(editor.state.doc).find((b) => b.name === name);
  if (!target) return false;
  editor.chain().focus().setTextSelection(target.pos + 1).scrollIntoView().run();
  return true;
}

export interface Heading {
  text: string;
  level: number;
  pos: number;
}

export function listHeadings(doc: PMNode): Heading[] {
  const found: Heading[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    if (node.textContent.trim()) found.push({ text: node.textContent.trim(), level: node.attrs.level, pos });
    return false;
  });
  return found;
}

/** The words after a bookmark, to stand for it in a cross-reference. */
export function bookmarkText(doc: PMNode, pos: number) {
  const $pos = doc.resolve(pos);
  const text = doc.textBetween(pos, $pos.end(), " ").trim();
  return text.length > 60 ? `${text.slice(0, 60).trimEnd()}…` : text;
}

/**
 * Inserts a link to a bookmark or heading at the cursor. Headings get a hidden "_Ref" bookmark
 * (as in Word) so the link has somewhere to point.
 */
export function insertCrossReference(editor: Editor, target: { bookmark: string } | { heading: number }, label: string) {
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      let name: string;
      if ("bookmark" in target) {
        name = target.bookmark;
      } else {
        const heading = tr.doc.nodeAt(target.heading);
        if (!heading) return false;
        const first = heading.firstChild;
        if (first?.type.name === "bookmark" && first.attrs.name.startsWith("_Ref")) {
          name = first.attrs.name;
        } else {
          name = `_Ref${Math.floor(1e8 + Math.random() * 9e8)}`;
          tr.insert(target.heading + 1, state.schema.nodes.bookmark.create({ name }));
        }
      }
      const { from, to } = tr.selection;
      // No new-tab target: this link stays in the document.
      const link = state.schema.marks.link.create({ href: `#${name}`, target: null });
      tr.replaceWith(from, to, state.schema.text(label, [link]));
      tr.setSelection(TextSelection.create(tr.doc, from + label.length));
      return true;
    })
    .run();
}

/** Word's Blank Page: a page break, an empty page with the cursor on it, and another break. */
export function insertBlankPage(editor: Editor) {
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const { pageBreak, paragraph } = state.schema.nodes;
      const { $from } = tr.selection;
      if (!$from.parent.isTextblock) return false;
      // Break the line at the cursor, so the blank page goes between its two halves.
      let pos: number;
      if ($from.parentOffset === 0) pos = $from.before();
      else if ($from.parentOffset === $from.parent.content.size) pos = $from.after();
      else {
        tr.split($from.pos);
        pos = $from.pos + 1;
      }
      tr.insert(pos, [pageBreak.create(), paragraph.create(), pageBreak.create()]);
      tr.setSelection(TextSelection.create(tr.doc, pos + 2)).scrollIntoView();
      return true;
    })
    .run();
}

// ---- Charts ----

/** "120px" → 120; anything else → null. */
const pixels = (value: string | null | undefined) => {
  const n = value && /^\d+(\.\d+)?(px)?$/.test(value.trim()) ? Math.round(parseFloat(value)) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

const number = (value: string | null | undefined) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Pictures (photos, shapes, SmartArt and charts): their size, and whether they sit in line with the
 * text, or in front of or behind it, moved by x and y from where they're anchored (and stacked by z). Charts also keep their
 * settings (data-chart), so they can be opened and changed again.
 */
/**
 * How a picture sits with the text: in line with it, with the text flowing around it (Square), on
 * its own line (Top and Bottom), or anywhere on the page in front of or behind the text.
 */
export type Wrap = "inline" | "square" | "topBottom" | "front" | "behind";
export const WRAPS: Wrap[] = ["inline", "square", "topBottom", "front", "behind"];
export type Side = "left" | "center" | "right";

/** Word's distance between a picture and the text flowing around it: an eighth of an inch. */
const WRAP_GAP = 12;

/** The CSS that puts a picture text flows around on its side, or on its own line. */
export function flowStyle(wrap: Wrap, side: Side) {
  if (wrap === "square") {
    // Square wrapping can only be on a side: one in the middle keeps to the left.
    return side === "right" ? `float: right; margin: 4px 0 4px ${WRAP_GAP}px` : `float: left; margin: 4px ${WRAP_GAP}px 4px 0`;
  }
  return `display: block; clear: both; margin: ${side === "left" ? "6px auto 6px 0" : side === "right" ? "6px 0 6px auto" : "6px auto"}`;
}

export const ChartImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      chart: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-chart"),
        renderHTML: (attrs) => (attrs.chart ? { "data-chart": attrs.chart } : {}),
      },
      width: {
        default: null,
        parseHTML: (el) => pixels(el.style.width) ?? pixels(el.getAttribute("width")),
        renderHTML: (attrs) => (attrs.width ? { style: `width: ${attrs.width}px` } : {}),
      },
      height: {
        default: null,
        parseHTML: (el) => pixels(el.style.height) ?? pixels(el.getAttribute("height")),
        renderHTML: (attrs) => (attrs.height ? { style: `height: ${attrs.height}px` } : {}),
      },
      wrap: {
        default: "inline",
        parseHTML: (el) => (WRAPS.includes(el.dataset.wrap as Wrap) ? el.dataset.wrap : "inline"),
        // Saved pages show it in the same place; float lets Word files keep it as a floating picture.
        renderHTML: (attrs) =>
          attrs.wrap === "front" || attrs.wrap === "behind"
            ? {
                "data-wrap": attrs.wrap,
                "data-x": attrs.x,
                "data-y": attrs.y,
                ...(attrs.z ? { "data-z": attrs.z } : {}),
                style: `position: absolute; float: left; z-index: ${stackOf(attrs.wrap, attrs.z)}; transform: translate(${attrs.x}px, ${attrs.y}px)`,
              }
            : attrs.wrap === "square" || attrs.wrap === "topBottom"
              ? { "data-wrap": attrs.wrap, "data-side": attrs.side, style: flowStyle(attrs.wrap, attrs.side) }
              : {},
      },
      /** Which side a picture that text flows around sits on: left or right (or the middle, on its own line). */
      side: { default: "left", parseHTML: (el) => (["left", "center", "right"].includes(el.dataset.side ?? "") ? el.dataset.side : "left"), renderHTML: () => ({}) },
      z: { default: 0, parseHTML: (el) => number(el.dataset.z), renderHTML: () => ({}) },
      /** Pictures grouped together (Arrange › Group) share an id, and move as one. */
      group: {
        default: null,
        parseHTML: (el) => el.dataset.group || null,
        renderHTML: (attrs) => (attrs.group ? { "data-group": attrs.group } : {}),
      },
      x: { default: 0, parseHTML: (el) => number(el.dataset.x), renderHTML: () => ({}) },
      y: { default: 0, parseHTML: (el) => number(el.dataset.y), renderHTML: () => ({}) },
      // Shapes (shapes.ts): their fill, outline, text and so on.
      shape: {
        default: null,
        parseHTML: (el) => readShape(el.getAttribute("data-shape")),
        renderHTML: (attrs) => (attrs.shape ? { "data-shape": JSON.stringify(attrs.shape) } : {}),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(PictureView);
  },
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        // A shape's saved picture is redrawn whenever its size or settings change.
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((t) => t.docChanged)) return null;
          let tr: Transaction | null = null;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== "image" || !node.attrs.shape) return;
            const src = shapePicture(node.attrs.shape, node.attrs.width ?? 96, node.attrs.height ?? 96);
            if (src !== node.attrs.src) tr = (tr ?? state.tr).setNodeAttribute(pos, "src", src);
          });
          return tr;
        },
        props: {
          // Typing while a shape is selected puts the text in the shape, as in Word.
          handleKeyDown(view, event) {
            const { selection } = view.state;
            if (!(selection instanceof NodeSelection) || !selection.node.attrs.shape || isLine(selection.node.attrs.shape.kind)) return false;
            const typed = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
            if (!typed && event.key !== "Enter" && event.key !== "F2") return false;
            const frame = (view.nodeDOM(selection.from) as HTMLElement | null)?.querySelector(".docs-picture-frame");
            if (!frame) return false;
            event.preventDefault();
            frame.dispatchEvent(new CustomEvent(EDIT_SHAPE_TEXT, { detail: typed ? event.key : null }));
            return true;
          },
        },
      }),
    ];
  },
});
