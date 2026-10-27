// Selecting several pictures and shapes at once, as in Word: Shift+click adds one to the selection
// (or takes it out), dragging one of them moves them all, and Delete removes them all. Pictures in
// front of or behind the text can then be grouped, so they're selected and moved as one; a group
// is pictures that share a `group` id.

import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const picturesKey = new PluginKey<number[]>("docs-pictures");

type Meta = { set: number[] } | { keep: true };

/** Where the selected pictures are, when more than the one Word-style selection holds. */
export const selectedPictures = (state: EditorState) => picturesKey.getState(state) ?? [];

const isPicture = (node: PMNode | null | undefined) => node?.type.name === "image";
export const isFloating = (node: PMNode | null | undefined) => isPicture(node) && (node!.attrs.wrap === "front" || node!.attrs.wrap === "behind");

/** Every picture in a group, in document order. */
function members(doc: PMNode, group: string | null) {
  const found: number[] = [];
  if (!group) return found;
  doc.descendants((node, pos) => {
    if (isPicture(node) && node.attrs.group === group) found.push(pos);
  });
  return found;
}

/** A picture and the rest of its group, if it's in one. */
const withGroup = (doc: PMNode, pos: number) => {
  const node = doc.nodeAt(pos);
  const group = members(doc, node?.attrs.group ?? null);
  return group.length ? group : [pos];
};

export const MultiSelect = Extension.create({
  name: "multiSelect",
  addProseMirrorPlugins() {
    return [
      new Plugin<number[]>({
        key: picturesKey,
        state: {
          init: () => [],
          apply(tr, value, _old, next) {
            const meta = tr.getMeta(picturesKey) as Meta | undefined;
            if (meta && "set" in meta) return meta.set.filter((pos) => isPicture(next.doc.nodeAt(pos)));
            const mapped = tr.docChanged ? value.map((pos) => tr.mapping.map(pos)).filter((pos) => isPicture(next.doc.nodeAt(pos))) : value;
            if ((meta && "keep" in meta) || !tr.selectionSet) return mapped;
            // A new selection: the picture clicked (with its group), or none.
            const sel = next.selection;
            return sel instanceof NodeSelection && isPicture(sel.node) && sel.node.attrs.group ? members(next.doc, sel.node.attrs.group) : [];
          },
        },
        props: {
          decorations(state) {
            const list = picturesKey.getState(state) ?? [];
            if (list.length < 2) return null;
            return DecorationSet.create(
              state.doc,
              list.map((pos) => Decoration.node(pos, pos + state.doc.nodeAt(pos)!.nodeSize, {}, { multi: true })),
            );
          },
          // Delete and Backspace remove every selected picture.
          handleKeyDown(view, event) {
            const list = picturesKey.getState(view.state) ?? [];
            if (list.length < 2 || (event.key !== "Delete" && event.key !== "Backspace")) return false;
            let tr = view.state.tr;
            for (const pos of [...list].sort((a, b) => b - a)) tr = tr.delete(pos, pos + tr.doc.nodeAt(pos)!.nodeSize);
            view.dispatch(tr.setMeta(picturesKey, { set: [] }));
            return true;
          },
        },
      }),
    ];
  },
});

/** Shift+click: adds the picture (and its group) to the selection, or takes it out. */
export function toggleSelected(editor: Editor, pos: number) {
  const { state } = editor;
  const { doc, selection } = state;
  let list = selectedPictures(state);
  if (!list.length && selection instanceof NodeSelection && isPicture(selection.node)) list = withGroup(doc, selection.from);
  const these = withGroup(doc, pos);
  const removing = list.includes(pos);
  list = removing ? list.filter((p) => !these.includes(p)) : [...new Set([...list, ...these])].sort((a, b) => a - b);
  const tr = state.tr.setMeta(picturesKey, { set: list });
  const primary = removing ? list.at(-1) : pos;
  if (primary !== undefined) tr.setSelection(NodeSelection.create(doc, primary));
  editor.view.dispatch(tr);
  editor.view.focus();
}

/** Selects one picture without letting go of the others selected with it (to drag them all). */
export function selectKeeping(editor: Editor, pos: number) {
  const { state } = editor;
  const keep = selectedPictures(state).includes(pos);
  const tr = state.tr.setSelection(NodeSelection.create(state.doc, pos));
  if (keep) tr.setMeta(picturesKey, { keep: true });
  editor.view.dispatch(tr);
  editor.view.focus();
}

/** The selected pictures that can be grouped: those in front of or behind the text. */
export function groupable(state: EditorState) {
  const list = selectedPictures(state);
  return list.filter((pos) => isFloating(state.doc.nodeAt(pos)));
}

/** The group the selected picture is in, if any. */
export function selectedGroup(state: EditorState): string | null {
  const sel = state.selection;
  return sel instanceof NodeSelection && isPicture(sel.node) ? (sel.node.attrs.group ?? null) : null;
}

export function groupPictures(editor: Editor) {
  const { state } = editor;
  const list = groupable(state);
  if (list.length < 2) return;
  const id = `g${Math.random().toString(36).slice(2, 8)}`;
  let tr = state.tr;
  for (const pos of list) tr = tr.setNodeAttribute(pos, "group", id);
  editor.view.dispatch(tr.setMeta(picturesKey, { set: list }));
}

export function ungroupPictures(editor: Editor) {
  const { state } = editor;
  const list = members(state.doc, selectedGroup(state));
  let tr = state.tr;
  for (const pos of list) tr = tr.setNodeAttribute(pos, "group", null);
  // Still all selected, as in Word, now each on its own.
  editor.view.dispatch(tr.setMeta(picturesKey, { set: list }));
}
