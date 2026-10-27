"use client";

// Comments beside the page, level with the text they're about (as Word's markup area shows them):
// each with its author, its replies, and Reply, Resolve and Delete.

import type { Editor } from "@tiptap/react";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { commentAnchors, commentsAt, unmarkComment, type Comment } from "./comments";

const WIDTH = 270;
const GAP = 8;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("") || "?";

const when = (date: string) => {
  if (!date) return "";
  const d = new Date(date);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

export function CommentsColumn(p: {
  editor: Editor;
  comments: Comment[];
  author: string;
  /** The comment just made, which opens for typing. */
  fresh: string | null;
  readOnly?: boolean;
  onComments: (comments: Comment[]) => void;
  onFreshDone: () => void;
}) {
  const { editor, comments } = p;
  const column = useRef<HTMLDivElement>(null);
  const [tops, setTops] = useState<Record<string, number>>({});
  const anchors = commentAnchors(editor);
  const shown = comments.filter((c) => anchors.has(c.id)).sort((a, b) => anchors.get(a.id)! - anchors.get(b.id)!);
  const active = new Set(commentsAt(editor));

  // Each balloon level with its text, pushed down when it would overlap the one above. After every
  // render (the text moves as it's typed), but it only sets new places when they've changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = column.current;
    const sheet = el?.parentElement;
    if (!el || !sheet) return;
    const origin = sheet.getBoundingClientRect();
    const scale = origin.width / sheet.offsetWidth || 1;
    const next: Record<string, number> = {};
    let bottom = 0;
    for (const c of shown) {
      const mark = editor.view.dom.querySelector<HTMLElement>(`[data-comment="${CSS.escape(c.id)}"]`);
      const balloon = el.querySelector<HTMLElement>(`[data-balloon="${CSS.escape(c.id)}"]`);
      if (!mark || !balloon) continue;
      const y = Math.max((mark.getBoundingClientRect().top - origin.top) / scale - 6, bottom);
      next[c.id] = Math.round(y);
      bottom = y + balloon.offsetHeight + GAP;
    }
    if (JSON.stringify(next) !== JSON.stringify(tops)) setTops(next);
  });

  const update = (id: string, patch: Partial<Comment>) => p.onComments(comments.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const remove = (id: string) => {
    unmarkComment(editor, id);
    p.onComments(comments.filter((c) => c.id !== id));
  };

  return (
    <div ref={column} aria-label="Comments" className="absolute top-0" style={{ left: "calc(100% + 16px)", width: WIDTH }}>
      {/* The commented text the cursor is in stands out */}
      <style>{[...active].map((id) => `.docs-sheet [data-comment="${CSS.escape(id)}"]{background:rgb(250 204 21 / 0.55)}`).join("")}</style>
      {shown.map((c) => (
        <Balloon
          key={c.id}
          comment={c}
          top={tops[c.id] ?? anchors.get(c.id) ?? 0}
          active={active.has(c.id)}
          author={p.author}
          startEditing={p.fresh === c.id}
          readOnly={p.readOnly}
          onSave={(text) => {
            update(c.id, { text });
            p.onFreshDone();
          }}
          onCancelNew={() => {
            if (!c.text) remove(c.id);
            p.onFreshDone();
          }}
          onReply={(text) => update(c.id, { replies: [...c.replies, { author: p.author, date: new Date().toISOString(), text }] })}
          onDone={() => update(c.id, { done: !c.done })}
          onDelete={() => remove(c.id)}
          onFocus={() => {
            const pos = anchors.get(c.id);
            if (pos !== undefined) editor.chain().setTextSelection(pos + 1).scrollIntoView().run();
          }}
        />
      ))}
    </div>
  );
}

function Balloon(p: {
  comment: Comment;
  top: number;
  active: boolean;
  author: string;
  startEditing: boolean;
  readOnly?: boolean;
  onSave: (text: string) => void;
  onCancelNew: () => void;
  onReply: (text: string) => void;
  onDone: () => void;
  onDelete: () => void;
  onFocus: () => void;
}) {
  const c = p.comment;
  const [editing, setEditing] = useState(p.startEditing);
  const [draft, setDraft] = useState(c.text);
  const [reply, setReply] = useState("");
  return (
    <div
      data-balloon={c.id}
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest("textarea, button")) p.onFocus();
      }}
      className={`absolute w-full rounded-lg bg-surface p-2.5 text-[13px] leading-snug text-slate-800 shadow-sm ring-1 transition-[top] ${
        p.active ? "ring-2 ring-blue-500" : "ring-slate-200"
      } ${c.done ? "opacity-60" : ""}`}
      style={{ top: p.top }}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[10px] font-semibold text-white">{initials(c.author)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{c.author}</span>
          <span className="block text-[11px] text-slate-500">{when(c.date)}</span>
        </span>
        {!p.readOnly && (
          <>
            <button type="button" title={c.done ? "Reopen" : "Resolve"} onClick={p.onDone} className="rounded p-1 text-slate-500 hover:bg-slate-100">
              {c.done ? <RotateCcw size={13} /> : <Check size={13} />}
            </button>
            <button type="button" title="Delete comment" onClick={p.onDelete} className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600">
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-1.5">
          <textarea
            autoFocus
            rows={2}
            value={draft}
            placeholder="Start a conversation"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                p.onSave(draft.trim());
                setEditing(false);
              }
              if (e.key === "Escape") {
                setEditing(false);
                setDraft(c.text);
                p.onCancelNew();
              }
            }}
            className="rounded border border-slate-300 px-2 py-1"
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(c.text);
                p.onCancelNew();
              }}
              className="rounded px-2 py-0.5 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draft.trim()}
              onClick={() => {
                p.onSave(draft.trim());
                setEditing(false);
              }}
              className="rounded bg-blue-600 px-2 py-0.5 font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Post
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap" onDoubleClick={() => !p.readOnly && c.author === p.author && setEditing(true)}>
          {c.text}
        </p>
      )}
      {c.replies.map((r, i) => (
        <div key={i} className="mt-2 border-t border-slate-100 pt-1.5">
          <span className="text-[11px] text-slate-500">
            <b className="text-slate-700">{r.author}</b> · {when(r.date)}
          </span>
          <p className="whitespace-pre-wrap">{r.text}</p>
        </div>
      ))}
      {p.active && !editing && !p.readOnly && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (reply.trim()) p.onReply(reply.trim());
            setReply("");
          }}
          className="mt-2 flex gap-1"
        >
          <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply" className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-0.5" />
        </form>
      )}
    </div>
  );
}
