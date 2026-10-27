// Editor features Tiptap doesn't ship: font size, paragraph formatting (indent, line spacing,
// spacing before and after, shading, borders, Title/Subtitle styles), table cell colours and borders,
// list bullet styles, underline styles and find highlights.
// Everything is written as inline styles, so saved documents look the same anywhere they're opened.

import BulletList from "@tiptap/extension-bullet-list";
import Table, { TableView } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import OrderedList from "@tiptap/extension-ordered-list";
import UnderlineMark from "@tiptap/extension-underline";
import { Extension, type CommandProps } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      /** e.g. "14pt" */
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
    paragraphFormat: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
      setLineHeight: (value: string | null) => ReturnType;
      setShading: (colour: string | null) => ReturnType;
      setBorder: (border: Border | null) => ReturnType;
      setStyleName: (name: StyleName | null) => ReturnType;
      /** Sets any of the attributes below on every paragraph in the selection (the Layout tab's boxes). */
      setParagraphFormat: (attrs: Partial<Record<"indent" | "indentRight" | "firstLine" | "spaceBefore" | "spaceAfter" | "lineHeight" | "noLineNumbers", unknown>>) => ReturnType;
    };
  }
}

// ---- Font size ----

export const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => el.style.fontSize || null,
            renderHTML: (attrs) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (size) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

// ---- Paragraph formatting ----

const BLOCKS = ["paragraph", "heading"];
/** One indent step: half an inch, like Word. */
export const INDENT_PX = 48;
const MAX_INDENT = 8;

export type Border = "bottom" | "top" | "box";
const BORDER_STYLES: Record<Border, string> = {
  bottom: "border-bottom: 1px solid currentColor; padding-bottom: 2px",
  top: "border-top: 1px solid currentColor; padding-top: 2px",
  box: "border: 1px solid currentColor; padding: 2px 6px",
};

/** Paragraph styles that aren't headings. */
export type StyleName = "title" | "subtitle" | "caption";
/** Paragraph styles. How they look comes from the document's design (design.ts). */
const STYLE_NAMES: Record<StyleName, true> = { title: true, subtitle: true, caption: true };

/** Changes the attributes of every paragraph and heading in the selection. */
function updateBlocks(props: CommandProps, change: (attrs: Record<string, unknown>) => Record<string, unknown>) {
  const { state, tr, dispatch } = props;
  const { from, to } = state.selection;
  let found = false;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!BLOCKS.includes(node.type.name)) return;
    found = true;
    if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...change(node.attrs) });
    return false;
  });
  return found;
}

export const ParagraphFormat = Extension.create({
  name: "paragraphFormat",
  addGlobalAttributes() {
    return [
      {
        types: BLOCKS,
        attributes: {
          // In steps of half an inch; documents from Word can be anywhere in between.
          indent: {
            default: 0,
            parseHTML: (el) => Math.min(MAX_INDENT, Math.round(((parseFloat(el.style.marginLeft) || 0) / INDENT_PX) * 100) / 100),
            renderHTML: (attrs) => (attrs.indent ? { style: `margin-left: ${Math.round(attrs.indent * INDENT_PX * 10) / 10}px` } : {}),
          },
          /** Indent from the right margin, in pixels. */
          indentRight: {
            default: null,
            parseHTML: (el) => parseFloat(el.style.marginRight) || null,
            renderHTML: (attrs) => (attrs.indentRight ? { style: `margin-right: ${attrs.indentRight}px` } : {}),
          },
          /** Left out of the line numbers (Layout › Line Numbers › Suppress for Current Paragraph). */
          noLineNumbers: {
            default: false,
            parseHTML: (el) => el.hasAttribute("data-no-line-numbers"),
            renderHTML: (attrs) => (attrs.noLineNumbers ? { "data-no-line-numbers": "" } : {}),
          },
          /** First-line indent in pixels; less than 0 is a hanging indent. */
          firstLine: {
            default: null,
            parseHTML: (el) => (el.style.textIndent ? parseFloat(el.style.textIndent) || null : null),
            renderHTML: (attrs) => (attrs.firstLine ? { style: `text-indent: ${attrs.firstLine}px` } : {}),
          },
          /** Space above and below the paragraph in pixels, as Word documents set it (null: Docs' usual). */
          spaceBefore: {
            default: null,
            parseHTML: (el) => (el.style.marginTop ? parseFloat(el.style.marginTop) : null),
            renderHTML: (attrs) => (attrs.spaceBefore !== null ? { style: `margin-top: ${attrs.spaceBefore}px` } : {}),
          },
          spaceAfter: {
            default: null,
            parseHTML: (el) => (el.style.marginBottom ? parseFloat(el.style.marginBottom) : null),
            renderHTML: (attrs) => (attrs.spaceAfter !== null ? { style: `margin-bottom: ${attrs.spaceAfter}px` } : {}),
          },
          lineHeight: {
            default: null,
            parseHTML: (el) => el.style.lineHeight || null,
            renderHTML: (attrs) => (attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {}),
          },
          shading: {
            default: null,
            parseHTML: (el) => el.style.backgroundColor || null,
            renderHTML: (attrs) => (attrs.shading ? { style: `background-color: ${attrs.shading}` } : {}),
          },
          border: {
            default: null,
            parseHTML: (el) => (el.dataset.border && el.dataset.border in BORDER_STYLES ? el.dataset.border : null),
            renderHTML: (attrs) =>
              attrs.border ? { "data-border": attrs.border, style: BORDER_STYLES[attrs.border as Border] } : {},
          },
          styleName: {
            default: null,
            parseHTML: (el) => (el.dataset.style && el.dataset.style in STYLE_NAMES ? el.dataset.style : null),
            renderHTML: (attrs) =>
              attrs.styleName ? { "data-style": attrs.styleName } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      // In a list, indenting nests the item (like Word); elsewhere it moves the paragraph in.
      indent: () => (props) =>
        props.editor.isActive("listItem")
          ? props.commands.sinkListItem("listItem")
          : updateBlocks(props, (a) => ({ indent: Math.min(MAX_INDENT, Number(a.indent ?? 0) + 1) })),
      outdent: () => (props) =>
        props.editor.isActive("listItem")
          ? props.commands.liftListItem("listItem")
          : updateBlocks(props, (a) => ({ indent: Math.max(0, Number(a.indent ?? 0) - 1) })),
      setLineHeight: (value) => (props) => updateBlocks(props, () => ({ lineHeight: value })),
      setShading: (colour) => (props) => updateBlocks(props, () => ({ shading: colour })),
      setBorder: (border) => (props) => updateBlocks(props, () => ({ border })),
      setStyleName: (name) => (props) => updateBlocks(props, () => ({ styleName: name })),
      setParagraphFormat: (attrs) => (props) => updateBlocks(props, () => attrs),
    };
  },
});

// ---- Tables: where they sit (from Word documents) ----

/** Shows a table moved from the left margin (negative: into the margin, as Word's centred wide tables are). */
class IndentedTableView extends TableView {
  constructor(node: ProseMirrorNode, cellMinWidth: number) {
    super(node, cellMinWidth);
    this.indent(node);
  }

  update(node: ProseMirrorNode) {
    const same = super.update(node);
    if (same) this.indent(node);
    return same;
  }

  private indent(node: ProseMirrorNode) {
    // Tiptap leaves a column's old width when its width is taken away (AutoFit): clear it.
    const widths: (number | undefined)[] = [];
    node.firstChild?.forEach((cell) => {
      for (let j = 0; j < cell.attrs.colspan; j++) widths.push(cell.attrs.colwidth?.[j]);
    });
    this.colgroup.querySelectorAll("col").forEach((col, i) => {
      if (!widths[i]) col.style.removeProperty("width");
    });
    this.table.style.marginLeft = node.attrs.indent ? `${node.attrs.indent}px` : "";
    // AutoFit to Contents (table/tableTools.ts)
    if (node.attrs.autofit) this.table.dataset.autofit = node.attrs.autofit;
    else delete this.table.dataset.autofit;
  }
}

export const StyledTable = Table.extend({
  addOptions() {
    return { ...Table.options, View: IndentedTableView };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      indent: {
        default: null,
        parseHTML: (el) => parseFloat(el.style.marginLeft) || null,
        renderHTML: (attrs) => (attrs.indent ? { style: `margin-left: ${attrs.indent}px` } : {}),
      },
      autofit: {
        default: null,
        parseHTML: (el) => (el.dataset.autofit === "contents" ? "contents" : null),
        renderHTML: (attrs) => (attrs.autofit ? { "data-autofit": attrs.autofit } : {}),
      },
    };
  },
});

// ---- Table cells: their colour, borders, padding and alignment (from Word documents) ----

/** A cell attribute kept as one CSS property, e.g. borderTop ↔ border-top. */
const cellCss = (name: string) => {
  const property = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return {
    [name]: {
      default: null,
      // A border of "none" reads back as only its style, not as the whole border-top value.
      parseHTML: (el: HTMLElement) => el.style.getPropertyValue(property) || el.style.getPropertyValue(`${property}-style`) || null,
      renderHTML: (attrs: Record<string, unknown>) => (attrs[name] ? { style: `${property}: ${attrs[name]}` } : {}),
    },
  };
};

const cellLook = {
  ...cellCss("backgroundColor"),
  // Each side on its own: Word often draws only some of a cell's sides (a dotted line to write on).
  ...cellCss("borderTop"),
  ...cellCss("borderRight"),
  ...cellCss("borderBottom"),
  ...cellCss("borderLeft"),
  ...cellCss("padding"),
  ...cellCss("verticalAlign"),
  ...cellCss("height"),
};

export const StyledTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellLook };
  },
});

export const StyledTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellLook };
  },
});

// ---- Lists and underline with a choice of style ----

const listStyle = {
  listStyle: {
    default: null,
    parseHTML: (el: HTMLElement) => el.style.listStyleType || null,
    renderHTML: (attrs: Record<string, unknown>) => (attrs.listStyle ? { style: `list-style-type: ${attrs.listStyle}` } : {}),
  },
};

export const StyledBulletList = BulletList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...listStyle };
  },
});

export const StyledOrderedList = OrderedList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...listStyle };
  },
});

export type UnderlineStyle = "solid" | "double" | "dotted" | "dashed" | "wavy";

export const StyledUnderline = UnderlineMark.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      lineStyle: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.textDecorationStyle || null,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.lineStyle ? { style: `text-decoration-style: ${attrs.lineStyle}` } : {},
      },
    };
  },
});

// ---- Find: highlights every match, and the current one more strongly ----

export interface Match {
  from: number;
  to: number;
}

const searchKey = new PluginKey<DecorationSet>("docs-search");

export const SearchHighlight = Extension.create({
  name: "searchHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: searchKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(searchKey) as { matches: Match[]; current: number } | undefined;
            if (meta) {
              return DecorationSet.create(
                tr.doc,
                meta.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === meta.current ? "search-current" : "search-match" })),
              );
            }
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => searchKey.getState(state),
        },
      }),
    ];
  },
});

export function showMatches(editor: Editor, matches: Match[], current: number) {
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, { matches, current }).setMeta("addToHistory", false));
}
