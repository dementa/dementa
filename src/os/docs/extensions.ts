// Editor features Tiptap doesn't ship: font size, paragraph formatting (indent, line spacing,
// shading, borders, Title/Subtitle styles), list bullet styles, underline styles and find highlights.
// Everything is written as inline styles, so saved documents look the same anywhere they're opened.

import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import UnderlineMark from "@tiptap/extension-underline";
import { Extension, type CommandProps } from "@tiptap/core";
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
export type StyleName = "title" | "subtitle";
const STYLE_NAMES: Record<StyleName, string> = {
  title: "font-size: 2.6em; font-weight: 300; line-height: 1.15; letter-spacing: -0.01em",
  subtitle: "font-size: 1.3em; color: #64748b",
};

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
          indent: {
            default: 0,
            parseHTML: (el) => Math.min(MAX_INDENT, Math.round((parseFloat(el.style.marginLeft) || 0) / INDENT_PX)),
            renderHTML: (attrs) => (attrs.indent ? { style: `margin-left: ${attrs.indent * INDENT_PX}px` } : {}),
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
              attrs.styleName ? { "data-style": attrs.styleName, style: STYLE_NAMES[attrs.styleName as StyleName] } : {},
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
    };
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
