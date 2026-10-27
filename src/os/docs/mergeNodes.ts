// Merge fields in the document (Mailings › Insert Merge Field, Address Block, Greeting Line,
// Rules). They read «First Name» and so on, or, while previewing, what they'll say for the
// recipient shown; which recipient that is, and the list itself, come from the document's
// mail merge settings (setMergeData), kept in the editor's state.

import { Extension, Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { fieldLabel, fieldText, includedRecords, NO_MERGE, type FieldAttrs, type MailMerge } from "./mailMerge";

interface PreviewState {
  merge: MailMerge;
  on: boolean;
  /** Which of the included records is shown, from 0. */
  at: number;
  highlight: boolean;
}

export const previewKey = new PluginKey<PreviewState>("docs-merge-preview");

export const previewOf = (view: EditorView): PreviewState => previewKey.getState(view.state) ?? { merge: NO_MERGE, on: false, at: 0, highlight: false };

/** The recipient list and settings, from the document's settings. */
export function setMergeData(view: EditorView, merge: MailMerge) {
  view.dispatch(view.state.tr.setMeta(previewKey, { merge }).setMeta("addToHistory", false));
}

/** Preview Results on or off, which recipient to show, Highlight Merge Fields. */
export function setPreview(view: EditorView, patch: Partial<Omit<PreviewState, "merge">>) {
  view.dispatch(view.state.tr.setMeta(previewKey, patch).setMeta("addToHistory", false));
}

export const MergeField = Node.create({
  name: "mergeField",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    const attr = (name: string, fallback = "") => ({
      default: fallback,
      parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) ?? fallback,
      renderHTML: (a: Record<string, unknown>) => (a[name] ? { [`data-${name}`]: a[name] } : {}),
    });
    return {
      kind: attr("kind", "field"),
      name: { default: "", parseHTML: (el) => el.getAttribute("data-merge") ?? "", renderHTML: (a) => ({ "data-merge": a.name }) },
      op: attr("op", "equal"),
      value: attr("value"),
      then: attr("then"),
      otherwise: attr("otherwise"),
      options: attr("options"),
    };
  },
  parseHTML: () => [{ tag: "span[data-merge]" }],
  renderHTML: ({ node, HTMLAttributes }) => ["span", { ...HTMLAttributes, class: "docs-merge-field" }, fieldLabel(node.attrs as FieldAttrs)],
  // While previewing, it shows the recipient's details instead (a decoration carries them).
  addNodeView() {
    return ({ node, HTMLAttributes }) => {
      const dom = document.createElement("span");
      Object.entries(HTMLAttributes).forEach(([k, v]) => dom.setAttribute(k, String(v)));
      dom.className = "docs-merge-field";
      const show = (attrs: FieldAttrs, value: string | null) => {
        dom.textContent = value ?? fieldLabel(attrs);
        dom.classList.toggle("is-preview", value !== null);
      };
      show(node.attrs as FieldAttrs, null);
      return {
        dom,
        update(next, decorations) {
          if (next.type.name !== "mergeField") return false;
          const preview = decorations.find((d) => (d as unknown as { spec: { value?: string } }).spec.value !== undefined);
          show(next.attrs as FieldAttrs, preview ? (preview as unknown as { spec: { value: string } }).spec.value : null);
          return true;
        },
      };
    };
  },
});

export const MergePreview = Extension.create({
  name: "mergePreview",
  addProseMirrorPlugins() {
    return [
      new Plugin<PreviewState>({
        key: previewKey,
        state: {
          init: () => ({ merge: NO_MERGE, on: false, at: 0, highlight: false }),
          apply: (tr, value) => {
            const patch = tr.getMeta(previewKey) as Partial<PreviewState> | undefined;
            return patch ? { ...value, ...patch } : value;
          },
        },
        props: {
          attributes: (state): Record<string, string> => (previewKey.getState(state)?.highlight ? { class: "show-merge-fields" } : {}),
          decorations(state) {
            const preview = previewKey.getState(state);
            if (!preview?.on) return null;
            const { merge } = preview;
            const records = includedRecords(merge);
            const at = Math.min(Math.max(0, preview.at), Math.max(0, records.length - 1));
            const record = records[at]?.r;
            if (!record) return null;
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "mergeField") return;
              decorations.push(Decoration.node(pos, pos + node.nodeSize, {}, { value: fieldText(merge, record, node.attrs as FieldAttrs, at + 1) }));
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
