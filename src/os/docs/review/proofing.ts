// Checking as you type, as Word does: misspelt words get a red wavy underline and grammar slips a
// green one. Only the paragraphs that change are checked again, a moment after typing stops; the
// word being typed isn't marked until the cursor leaves it. Right-clicking an underline offers the
// fixes (textMenu.tsx).

import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type NSpell from "nspell";
import { blockIssues, loadSpeller, type Issue } from "./tools";

interface ProofState {
  on: boolean;
  marks: DecorationSet;
  /** Where the document changed since it was last checked (paragraphs there are checked again). */
  dirty: [number, number][];
  /** Grammar slips Ignore Once was used on, as "from:text" (as the Editor pane keeps them). */
  ignored: Set<string>;
}

const proofKey = new PluginKey<ProofState>("docs-proofing");

/** Messages for the plugin: turn checking on or off, check everything again, ignore one slip. */
type Meta = { on?: boolean; all?: boolean; ignore?: string; marks?: DecorationSet; checked?: boolean };

let speller: NSpell | null = null;

/** The spelling checker, once its dictionary has loaded (null until then). */
export const proofingSpeller = () => speller;

/** Turns checking as you type on (for English) or off (Review › Language). */
export function setProofing(editor: Editor, on: boolean) {
  if (proofKey.getState(editor.state)?.on === on) return;
  editor.view.dispatch(editor.state.tr.setMeta(proofKey, { on } satisfies Meta).setMeta("addToHistory", false));
}

/** Checks the whole document again (after Ignore All or Add to Dictionary). */
export function recheckAll(editor: Editor) {
  editor.view.dispatch(editor.state.tr.setMeta(proofKey, { all: true } satisfies Meta).setMeta("addToHistory", false));
}

/** Ignore Once on a grammar slip. */
export function ignoreOnce(editor: Editor, issue: Issue) {
  editor.view.dispatch(editor.state.tr.setMeta(proofKey, { ignore: `${issue.from}:${issue.text}` } satisfies Meta).setMeta("addToHistory", false));
}

/** The spelling or grammar issue underlined at a position, if there is one. */
export function issueAt(state: EditorState, pos: number): Issue | null {
  const found = proofKey.getState(state)?.marks.find(pos, pos, (spec) => !!spec.issue) ?? [];
  // A grammar slip inside a misspelt word: the spelling comes first, as in Word.
  const issues = found.map((d) => d.spec.issue as Issue);
  return issues.find((i) => i.kind === "spelling") ?? issues[0] ?? null;
}

const decorate = (issue: Issue) =>
  Decoration.inline(issue.from, issue.to, { class: issue.kind === "spelling" ? "docs-spell-error" : "docs-grammar-error" }, { issue, inclusiveStart: false, inclusiveEnd: false });

/** Checks the paragraphs touching the dirty ranges (or every paragraph), replacing their underlines. */
function check(state: EditorState, value: ProofState, all: boolean): DecorationSet {
  const { doc, selection } = state;
  let marks = all ? DecorationSet.empty : value.marks;
  const blocks: { node: PMNode; pos: number }[] = [];
  const add = (node: PMNode, pos: number) => {
    if (!node.isTextblock) return true;
    blocks.push({ node, pos });
    return false;
  };
  if (all) doc.descendants(add);
  else for (const [from, to] of value.dirty) doc.nodesBetween(Math.max(0, from), Math.min(doc.content.size, to), add);
  const seen = new Set<number>();
  for (const { node, pos } of blocks) {
    if (seen.has(pos)) continue;
    seen.add(pos);
    const end = pos + node.nodeSize;
    if (!all) marks = marks.remove(marks.find(pos, end));
    const issues = blockIssues(node, pos, speller, value.ignored)
      // The word still being typed (the cursor at its end) waits until you've finished it.
      .filter((i) => !(i.kind === "spelling" && selection.empty && selection.from === i.to));
    marks = marks.add(doc, issues.map(decorate));
  }
  return marks;
}

export const Proofing = Extension.create({
  name: "proofing",
  addProseMirrorPlugins() {
    return [
      new Plugin<ProofState>({
        key: proofKey,
        state: {
          init: () => ({ on: false, marks: DecorationSet.empty, dirty: [], ignored: new Set() }),
          apply(tr, value, old, state) {
            const meta = tr.getMeta(proofKey) as Meta | undefined;
            let next = value;
            if (tr.docChanged) {
              // Underlines move with the text; the changed stretch is checked again shortly.
              const dirty = next.dirty.map(([a, b]): [number, number] => [tr.mapping.map(a, -1), tr.mapping.map(b, 1)]);
              tr.mapping.maps.forEach((map, i) => {
                const rest = tr.mapping.slice(i + 1);
                map.forEach((_a, _b, from, to) => dirty.push([rest.map(from, -1), rest.map(to, 1)]));
              });
              next = { ...next, marks: next.marks.map(tr.mapping, tr.doc), dirty };
            }
            // The cursor leaving a word it was typing: that paragraph is checked again, to mark the word.
            if (next.on && tr.selectionSet && old.selection.empty && old.selection.from !== state.selection.from) {
              const at = tr.mapping.map(old.selection.from);
              next = { ...next, dirty: [...next.dirty, [at - 1, at + 1]] };
            }
            if (!meta) return next;
            if (meta.on === false) return { ...next, on: false, marks: DecorationSet.empty, dirty: [] };
            if (meta.on) next = { ...next, on: true };
            if (meta.ignore) next = { ...next, ignored: new Set([...next.ignored, meta.ignore]) };
            if (!next.on) return next;
            if (meta.all || meta.on || meta.ignore) return { ...next, marks: check(state, next, true), dirty: [] };
            if (meta.checked) return { ...next, marks: check(state, next, false), dirty: [] };
            return next;
          },
        },
        props: {
          decorations: (state) => {
            const value = proofKey.getState(state);
            return value?.on ? value.marks : null;
          },
        },
        view: () => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          let loading = false;
          return {
            update(v) {
              const value = proofKey.getState(v.state);
              if (!value?.on) return;
              // The dictionary loads the first time: everything is checked once it's here.
              if (!speller && !loading) {
                loading = true;
                void loadSpeller().then((spell) => {
                  speller = spell;
                  if (!v.isDestroyed) v.dispatch(v.state.tr.setMeta(proofKey, { all: true } satisfies Meta).setMeta("addToHistory", false));
                });
              }
              if (!value.dirty.length) return;
              clearTimeout(timer);
              timer = setTimeout(() => {
                if (!v.isDestroyed) v.dispatch(v.state.tr.setMeta(proofKey, { checked: true } satisfies Meta).setMeta("addToHistory", false));
              }, 400);
            },
            destroy() {
              clearTimeout(timer);
            },
          };
        },
      }),
    ];
  },
});
