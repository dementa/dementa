"use client";

// Footnotes and endnotes, as Word shows them: footnotes at the bottom of the page their mark is
// on (pagination.ts makes room for them), endnotes after the last line of text. A note's text is
// typed in the note panel, which opens on inserting a note or clicking one.

import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { Trash2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { NoteKind } from "./refNodes";

export interface NoteInfo {
  id: string;
  kind: NoteKind;
  label: string;
  text: string;
  pos: number;
}

/** Every note in the document, in order. */
export function notesOf(doc: PMNode): NoteInfo[] {
  const notes: NoteInfo[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "note") notes.push({ id: node.attrs.id, kind: node.attrs.kind, label: node.attrs.label, text: node.attrs.text, pos });
  });
  return notes;
}

export const newNoteId = () => `n${Math.random().toString(36).slice(2, 9)}`;

/** One note as the page shows it: its number, then its text. */
function NoteLine({ note, onOpen }: { note: NoteInfo; onOpen?: (id: string) => void }) {
  return (
    <p className="docs-note" data-note-id={note.id} onMouseDown={onOpen && ((e) => (e.preventDefault(), onOpen(note.id)))}>
      <sup>{note.label}</sup> {note.text || <span className="text-slate-400">Type the note…</span>}
    </p>
  );
}

/** Copies of the notes, out of sight, for pagination.ts to measure. */
export function NotesMeasure({ notes, text }: { notes: NoteInfo[]; text: { left: number; width: number } }) {
  const endnotes = notes.filter((n) => n.kind === "endnote");
  return (
    <div aria-hidden className="docs-notes docs-notes-measure pointer-events-none invisible absolute top-0" style={{ left: text.left, width: text.width }}>
      {notes
        .filter((n) => n.kind === "footnote")
        .map((n) => (
          <NoteLine key={n.id} note={n} />
        ))}
      {endnotes.length > 0 && (
        <div data-endnotes>
          <div className="docs-note-sep" />
          {endnotes.map((n) => (
            <NoteLine key={n.id} note={n} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A page's footnotes, above its bottom margin, under a short line. */
export function PageFootnotes(p: { notes: NoteInfo[]; bottom: number; text: { left: number; width: number }; onOpen: (id: string) => void }) {
  if (!p.notes.length) return null;
  return (
    <div className="docs-notes absolute z-[1]" style={{ top: p.bottom, left: p.text.left, width: p.text.width, transform: "translateY(-100%)" }}>
      <div className="docs-note-sep" />
      {p.notes.map((n) => (
        <NoteLine key={n.id} note={n} onOpen={p.onOpen} />
      ))}
    </div>
  );
}

/** The endnotes, after the last line of text. */
export function Endnotes(p: { notes: NoteInfo[]; top?: number; text: { left: number; width: number }; onOpen: (id: string) => void }) {
  if (!p.notes.length) return null;
  return (
    <div className={`docs-notes z-[1] ${p.top === undefined ? "relative mt-4" : "absolute"}`} style={p.top === undefined ? undefined : { top: p.top, left: p.text.left, width: p.text.width }}>
      <div className="docs-note-sep" />
      {p.notes.map((n) => (
        <NoteLine key={n.id} note={n} onOpen={p.onOpen} />
      ))}
    </div>
  );
}

/** Finds a note by its id, now: positions change as the document does. */
const findNote = (editor: Editor, id: string) => notesOf(editor.state.doc).find((n) => n.id === id) ?? null;

/** Typing a note's text, in a panel at the bottom of the window. */
export function NotePanel({ editor, id, onClose }: { editor: Editor; id: string; onClose: () => void }) {
  const note = findNote(editor, id);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => box.current?.focus(), [id]);
  if (!note) return null;
  const name = note.kind === "footnote" ? "Footnote" : "Endnote";
  const close = () => {
    onClose();
    // Back to the text, just after the mark.
    const now = findNote(editor, id);
    if (now) editor.chain().focus().setTextSelection(now.pos + 1).run();
  };
  return (
    <div role="dialog" aria-label={`${name} ${note.label}`} className="menu-pop absolute right-4 bottom-4 z-20 flex w-[min(460px,calc(100%-2rem))] flex-col gap-2 rounded-xl bg-surface p-3 shadow-2xl ring-1 ring-black/10">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">
          {name} <sup>{note.label}</sup>
        </h2>
        <button
          type="button"
          title={`Delete ${name.toLowerCase()}`}
          onClick={() => {
            onClose();
            const now = findNote(editor, id);
            if (now) editor.chain().focus().deleteRange({ from: now.pos, to: now.pos + 1 }).run();
          }}
          className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={15} />
        </button>
        <button type="button" title="Done (Esc)" onClick={close} className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
          <X size={15} />
        </button>
      </div>
      <textarea
        ref={box}
        value={note.text}
        rows={3}
        placeholder={`Type the ${name.toLowerCase()}…`}
        onChange={(e) => {
          const now = findNote(editor, id);
          if (!now) return;
          const node = editor.state.doc.nodeAt(now.pos)!;
          editor.view.dispatch(editor.state.tr.setNodeMarkup(now.pos, undefined, { ...node.attrs, text: e.target.value }));
        }}
        onKeyDown={(e) => e.key === "Escape" && close()}
        className="resize-y rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
    </div>
  );
}
