// Home tab actions that work on the document's text: Change case, Sort and Find.

import { TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import type { Match } from "./extensions";

export type CaseMode = "sentence" | "lower" | "upper" | "title" | "toggle";

const isLetter = (ch: string) => /\p{L}/u.test(ch);

/** Changes the case of the selected text, keeping its formatting. */
export function changeCase(editor: Editor, mode: CaseMode): boolean {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  if (empty) return false;
  const tr = state.tr;
  // What comes just before the selection decides whether it starts a sentence or a word.
  const before = state.doc.textBetween(Math.max(0, from - 3), from, "\n", "\n");
  let sentenceStart = before.trim() === "" || /[.!?\n]\s*$/.test(before);
  let wordStart = !/\S$/.test(before);

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isBlock && pos >= from) {
      sentenceStart = true;
      wordStart = true;
    }
    if (!node.isText || !node.text) return;
    const start = Math.max(from, pos);
    const end = Math.min(to, pos + node.nodeSize);
    const text = node.text.slice(start - pos, end - pos);
    let out = "";
    for (const ch of text) {
      if (mode === "lower") out += ch.toLowerCase();
      else if (mode === "upper") out += ch.toUpperCase();
      else if (mode === "toggle") out += ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
      else if (mode === "title") out += wordStart ? ch.toUpperCase() : ch.toLowerCase();
      else out += sentenceStart && isLetter(ch) ? ch.toUpperCase() : ch.toLowerCase();
      if (isLetter(ch)) sentenceStart = false;
      if (/[.!?]/.test(ch)) sentenceStart = true;
      wordStart = /\s/.test(ch);
    }
    if (out !== text) tr.replaceWith(tr.mapping.map(start), tr.mapping.map(end), state.schema.text(out, node.marks));
  });

  if (!tr.docChanged) return false;
  tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(from, -1), tr.mapping.map(to)));
  editor.view.dispatch(tr);
  return true;
}

const byText = (a: PMNode, b: PMNode) => a.textContent.localeCompare(b.textContent, undefined, { numeric: true, sensitivity: "base" });

/** Puts nodes A→Z, or Z→A if they already are A→Z (so pressing Sort twice reverses it). */
function sorted(nodes: PMNode[]) {
  const up = [...nodes].sort(byText);
  return up.every((n, i) => n === nodes[i]) ? up.reverse() : up;
}

/**
 * Sort: the items of the list the cursor is in, or the selected paragraphs. Returns false when
 * there's nothing to sort (fewer than two items).
 */
export function sortBlocks(editor: Editor): boolean {
  const { state } = editor;
  const { $from, $to } = state.selection;

  for (let depth = $from.depth; depth > 0; depth--) {
    const list = $from.node(depth);
    if (list.type.name !== "bulletList" && list.type.name !== "orderedList") continue;
    if (list.childCount < 2) return false;
    const items: PMNode[] = [];
    list.forEach((item) => items.push(item));
    const pos = $from.before(depth);
    editor.view.dispatch(state.tr.replaceWith(pos + 1, pos + list.nodeSize - 1, sorted(items)));
    return true;
  }

  const first = $from.index(0);
  const last = $to.index(0);
  if (last <= first) return false;
  const blocks: PMNode[] = [];
  let start = 0;
  let end = 0;
  state.doc.forEach((node, offset, index) => {
    if (index === first) start = offset;
    if (index >= first && index <= last) {
      blocks.push(node);
      end = offset + node.nodeSize;
    }
  });
  editor.view.dispatch(state.tr.replaceWith(start, end, sorted(blocks)));
  return true;
}

/** Every place `query` appears in the document. */
export function findMatches(doc: PMNode, query: string, matchCase: boolean): Match[] {
  if (!query) return [];
  const needle = matchCase ? query : query.toLowerCase();
  const matches: Match[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // The block's text, with the document position of each character.
    let text = "";
    const at: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i++) at.push(pos + 1 + offset + i);
        text += child.text;
      } else {
        at.push(pos + 1 + offset);
        text += "￼"; // pictures and line breaks can't be part of a match
      }
    });
    const haystack = matchCase ? text : text.toLowerCase();
    for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) {
      matches.push({ from: at[i], to: at[i + needle.length - 1] + 1 });
    }
    return false;
  });
  return matches;
}
