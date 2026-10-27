// View › Outline: the document as an outline, as Word shows it. Headings sit at their level with
// a ⊕ (click it to collapse or expand what's under them), body text under its heading with a
// small circle; Show Level hides deeper levels, and Promote, Demote and Move Up/Down change the
// outline (Outlining tab).

import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

interface OutlineState {
  on: boolean;
  /** Headings up to this level are shown (and body text when it's 10). */
  level: number;
  /** Headings whose content is hidden, by position. */
  collapsed: number[];
  firstLineOnly: boolean;
}

const outlineKey = new PluginKey<OutlineState>("docs-outline");

export const BODY_LEVEL = 10;

export const outlineOf = (state: EditorState): OutlineState => outlineKey.getState(state) ?? { on: false, level: BODY_LEVEL, collapsed: [], firstLineOnly: false };

export function setOutline(editor: Editor, patch: Partial<OutlineState>) {
  editor.view.dispatch(editor.state.tr.setMeta(outlineKey, patch).setMeta("addToHistory", false));
}

/** A top-level block's outline level: its heading level, or body text. */
const levelOf = (node: PMNode) => (node.type.name === "heading" ? (node.attrs.level as number) : BODY_LEVEL);

export const Outline = Extension.create({
  name: "outline",
  addProseMirrorPlugins() {
    return [
      new Plugin<OutlineState>({
        key: outlineKey,
        state: {
          init: () => ({ on: false, level: BODY_LEVEL, collapsed: [], firstLineOnly: false }),
          apply(tr, value) {
            const patch = tr.getMeta(outlineKey) as Partial<OutlineState> | undefined;
            const next = patch ? { ...value, ...patch } : value;
            return tr.docChanged ? { ...next, collapsed: next.collapsed.map((pos) => tr.mapping.map(pos)) } : next;
          },
        },
        props: {
          decorations(state) {
            const outline = outlineKey.getState(state);
            if (!outline?.on) return null;
            const decorations: Decoration[] = [];
            const doc = state.doc;
            // Whether each heading has anything under it (for its ⊕ or ⊖).
            const blocks: { node: PMNode; pos: number; level: number }[] = [];
            doc.forEach((node, pos) => blocks.push({ node, pos, level: levelOf(node) }));
            let hideUnder: number | null = null;
            let parentLevel = 0;
            blocks.forEach((b, i) => {
              // A collapsed heading hides everything until the next heading at its level or higher.
              if (hideUnder !== null && b.level <= hideUnder) hideUnder = null;
              const hasChildren = b.level < BODY_LEVEL && i + 1 < blocks.length && blocks[i + 1].level > b.level;
              const collapsed = outline.collapsed.includes(b.pos);
              const depth = b.level < BODY_LEVEL ? b.level - 1 : parentLevel;
              const hidden = hideUnder !== null || b.level > outline.level;
              decorations.push(
                Decoration.node(b.pos, b.pos + b.node.nodeSize, {
                  class: [
                    "docs-ol",
                    b.level < BODY_LEVEL ? "docs-ol-heading" : "docs-ol-body",
                    hasChildren ? (collapsed ? "docs-ol-collapsed" : "docs-ol-open") : "",
                    hidden ? "docs-ol-hidden" : "",
                    outline.firstLineOnly && b.level === BODY_LEVEL ? "docs-ol-first-line" : "",
                  ]
                    .filter(Boolean)
                    .join(" "),
                  style: `margin-left: ${depth * 28}px`,
                }),
              );
              if (b.level < BODY_LEVEL) parentLevel = b.level;
              if (collapsed && hideUnder === null) hideUnder = b.level;
            });
            return DecorationSet.create(doc, decorations);
          },
          handleDOMEvents: {
            // Clicking a heading's ⊕ (to its left) collapses or expands it.
            mousedown(view, event) {
              const outline = outlineKey.getState(view.state);
              if (!outline?.on) return false;
              const block = (event.target as HTMLElement).closest<HTMLElement>(".docs-ol-heading.docs-ol-open, .docs-ol-heading.docs-ol-collapsed");
              if (!block || event.clientX >= block.getBoundingClientRect().left) return false;
              const pos = view.posAtDOM(block, 0) - 1;
              event.preventDefault();
              const collapsed = outline.collapsed.includes(pos) ? outline.collapsed.filter((p) => p !== pos) : [...outline.collapsed, pos];
              view.dispatch(view.state.tr.setMeta(outlineKey, { collapsed }).setMeta("addToHistory", false));
              return true;
            },
          },
        },
      }),
    ];
  },
});

/** The top-level block the cursor is in. */
function currentBlock(editor: Editor) {
  const $from = editor.state.selection.$from;
  if ($from.depth === 0) return null;
  return { node: $from.node(1), pos: $from.before(1), index: $from.index(0) };
}

/** Promote: up a level (body text becomes Heading 3, Heading 2 becomes Heading 1). */
export function promote(editor: Editor) {
  const b = currentBlock(editor);
  if (!b) return;
  const level = levelOf(b.node);
  if (level === BODY_LEVEL) editor.chain().focus().setHeading({ level: 3 }).run();
  else if (level > 1) editor.chain().focus().setHeading({ level: (level - 1) as 1 | 2 | 3 }).run();
}

/** Demote: down a level (Heading 3 becomes body text). */
export function demote(editor: Editor) {
  const b = currentBlock(editor);
  if (!b) return;
  const level = levelOf(b.node);
  if (level >= 3 && level < BODY_LEVEL) editor.chain().focus().setParagraph().run();
  else if (level < 3) editor.chain().focus().setHeading({ level: (level + 1) as 1 | 2 | 3 }).run();
}

/** Promote to Heading 1, or Demote to Body Text, at once. */
export const promoteToTop = (editor: Editor) => editor.chain().focus().setHeading({ level: 1 }).run();
export const demoteToBody = (editor: Editor) => editor.chain().focus().setParagraph().run();

/** Move Up / Move Down: swaps the paragraph with the one before or after it. */
export function move(editor: Editor, up: boolean) {
  const b = currentBlock(editor);
  if (!b) return;
  const { doc } = editor.state;
  const other = up ? b.index - 1 : b.index + 1;
  if (other < 0 || other >= doc.childCount) return;
  const offset = editor.state.selection.from - b.pos;
  const tr = editor.state.tr;
  if (up) {
    const before = doc.child(other);
    const start = b.pos - before.nodeSize;
    tr.delete(b.pos, b.pos + b.node.nodeSize).insert(start, b.node);
    editor.view.dispatch(tr);
    editor.commands.setTextSelection(start + offset);
  } else {
    const after = doc.child(other);
    tr.delete(b.pos, b.pos + b.node.nodeSize).insert(b.pos + after.nodeSize, b.node);
    editor.view.dispatch(tr);
    editor.commands.setTextSelection(b.pos + after.nodeSize + offset);
  }
  editor.commands.focus();
}

/** Collapses or expands every heading (Expand / Collapse in Word's Outlining tab). */
export function collapseAll(editor: Editor, collapse: boolean) {
  const collapsed: number[] = [];
  if (collapse) editor.state.doc.forEach((node, pos) => node.type.name === "heading" && collapsed.push(pos));
  setOutline(editor, { collapsed });
}
