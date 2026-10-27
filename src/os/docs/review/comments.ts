// Comments (Review › Comments): a mark on the text a comment is about, and the comment threads
// themselves, saved with the document's settings. Comments can overlap, so the mark doesn't
// exclude itself.

import { Mark, type Editor } from "@tiptap/core";
import { COMMENTING, UNTRACKED } from "./track";

export interface Reply {
  author: string;
  date: string;
  text: string;
}

export interface Comment extends Reply {
  id: string;
  replies: Reply[];
  /** Resolved: shown faded, as in Word. */
  done: boolean;
}

export const CommentMark = Mark.create({
  name: "comment",
  excludes: "",
  inclusive: false,
  addAttributes() {
    return { id: { default: "", parseHTML: (el) => el.getAttribute("data-comment") ?? "", renderHTML: (a) => ({ "data-comment": a.id }) } };
  },
  parseHTML: () => [{ tag: "span[data-comment]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", { ...HTMLAttributes, class: "docs-comment" }, 0],
});

export const newCommentId = () => `c${Math.random().toString(36).slice(2, 9)}`;

/** Where each comment's text starts in the document, in order (comments whose text is gone are left out). */
export function commentAnchors(editor: Editor) {
  const found = new Map<string, number>();
  editor.state.doc.descendants((node, pos) => {
    for (const m of node.marks) if (m.type.name === "comment" && !found.has(m.attrs.id)) found.set(m.attrs.id, pos);
  });
  return found;
}

/** The comments on the text at the cursor. */
export function commentsAt(editor: Editor): string[] {
  const { $from } = editor.state.selection;
  const marks = [...($from.nodeAfter?.marks ?? []), ...($from.nodeBefore?.marks ?? [])];
  return [...new Set(marks.filter((m) => m.type.name === "comment").map((m) => m.attrs.id as string))];
}

/**
 * New Comment: on the selection, or on the word the cursor is in. Returns its id, or null when
 * there's nothing to comment on.
 */
export function markComment(editor: Editor): string | null {
  const { state } = editor;
  let { from, to } = state.selection;
  if (from === to) {
    // The word around the cursor, as Word picks it.
    const $pos = state.selection.$from;
    const text = $pos.parent.textContent;
    const at = $pos.parentOffset;
    let a = at;
    let b = at;
    while (a > 0 && /\w/.test(text[a - 1])) a--;
    while (b < text.length && /\w/.test(text[b])) b++;
    if (a === b) return null;
    from = $pos.start() + a;
    to = $pos.start() + b;
  }
  const id = newCommentId();
  editor.view.dispatch(state.tr.addMark(from, to, state.schema.marks.comment.create({ id })).setMeta(UNTRACKED, true).setMeta(COMMENTING, true));
  return id;
}

/** Takes a comment's mark off the text. */
export function unmarkComment(editor: Editor, id: string) {
  const { state } = editor;
  const tr = state.tr;
  state.doc.descendants((node, pos) => {
    const mark = node.marks.find((m) => m.type.name === "comment" && m.attrs.id === id);
    if (mark) tr.removeMark(pos, pos + node.nodeSize, mark);
  });
  editor.view.dispatch(tr.setMeta(UNTRACKED, true).setMeta(COMMENTING, true));
}

export function parseComments(value: unknown): Comment[] {
  if (!Array.isArray(value)) return [];
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const reply = (r: Record<string, unknown>): Reply => ({ author: text(r.author), date: text(r.date), text: text(r.text) });
  return value
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object" && typeof c.id === "string")
    .map((c) => ({
      ...reply(c),
      id: String(c.id),
      replies: Array.isArray(c.replies) ? c.replies.filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object").map(reply) : [],
      done: c.done === true,
    }));
}
