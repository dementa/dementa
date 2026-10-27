// Track Changes, as in Word: while it's on, typed text is marked as inserted and deleted text
// stays, marked as deleted, so changes can be reviewed and accepted or rejected (Review tab).
// Deleting your own tracked insertion just removes it. Changes to paragraphs' structure (Enter,
// joining paragraphs), to a table's rows, columns and cells (Merge Cells, Delete Rows…) and to
// formatting aren't tracked.

import { Extension, Mark, type Editor } from "@tiptap/core";
import type { Mark as PMMark, Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Mapping, ReplaceAroundStep, ReplaceStep, StepMap } from "@tiptap/pm/transform";

/** On the transactions that make and settle changes, so they aren't tracked themselves. */
export const UNTRACKED = "docsUntracked";

/** On comment changes, which Restrict Editing › Comments still lets through. */
export const COMMENTING = "docsCommenting";

const changeAttrs = () => ({
  author: { default: "", parseHTML: (el: HTMLElement) => el.getAttribute("data-author") ?? "", renderHTML: (a: Record<string, unknown>) => ({ "data-author": a.author }) },
  date: { default: "", parseHTML: (el: HTMLElement) => el.getAttribute("data-date") ?? "", renderHTML: (a: Record<string, unknown>) => ({ "data-date": a.date }) },
});

export const Insertion = Mark.create({
  name: "insertion",
  excludes: "deletion",
  addAttributes: changeAttrs,
  parseHTML: () => [{ tag: "ins" }],
  renderHTML: ({ HTMLAttributes }) => ["ins", { ...HTMLAttributes, class: "docs-ins" }, 0],
});

export const Deletion = Mark.create({
  name: "deletion",
  excludes: "insertion",
  addAttributes: changeAttrs,
  parseHTML: () => [{ tag: "del" }],
  renderHTML: ({ HTMLAttributes }) => ["del", { ...HTMLAttributes, class: "docs-del" }, 0],
});

interface TrackState {
  on: boolean;
  /** Tracked whatever (Restrict Editing › Tracked changes): it can't be turned off. */
  locked: boolean;
  author: string;
}

const trackKey = new PluginKey<TrackState>("docs-track");

export const trackingOf = (state: EditorState): TrackState => trackKey.getState(state) ?? { on: false, locked: false, author: "" };

export function setTracking(editor: Editor, patch: Partial<TrackState>) {
  editor.view.dispatch(editor.state.tr.setMeta(trackKey, patch).setMeta("addToHistory", false));
}

/** What the transaction's metadata says, carried over to the tracked one. */
const META_KEYS = ["addToHistory", "uiEvent", "paste", "inputType", "composition", "pointer"];

/** The text between two positions, with where each piece is. */
function textPieces(doc: PMNode, from: number, to: number) {
  const pieces: { from: number; to: number; marks: readonly PMMark[] }[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText && !(node.isInline && node.isLeaf)) return;
    pieces.push({ from: Math.max(from, pos), to: Math.min(to, pos + node.nodeSize), marks: node.marks });
  });
  return pieces;
}

/**
 * The same change, tracked: what would be deleted is marked deleted instead (or removed, if it
 * was the author's own tracked insertion), and what's inserted is marked inserted.
 */
function track(state: EditorState, tr: Transaction, author: string): Transaction {
  const out = state.tr;
  // To the minute, as Word records them: typing in the same minute is one change.
  const date = `${new Date().toISOString().slice(0, 16)}:00Z`;
  const schema = state.schema;
  const inserted = schema.marks.insertion.create({ author, date });
  const deleted = schema.marks.deletion.create({ author, date });
  // Where deleted text was kept that the original change removed: later steps shift past it.
  const kept = new Mapping();
  let caret: number | null = null;
  const backwards = state.selection.empty && tr.selection.from < state.selection.from;

  for (const step of tr.steps) {
    if (!(step instanceof ReplaceStep)) {
      const mapped = step.map(kept);
      if (mapped) out.step(mapped);
      continue;
    }
    const { from: rawFrom, to: rawTo, slice } = step;
    const from = kept.map(rawFrom, 1);
    const to = kept.map(rawTo, -1);
    const pieces = from < to ? textPieces(out.doc, from, to) : [];
    const hasText = pieces.length > 0;

    // Only structure goes (paragraphs joining): not tracked.
    if (from < to && !hasText) {
      out.step(new ReplaceStep(from, to, slice));
      continue;
    }

    let end = to;
    if (hasText) {
      // Own insertions are just taken out again; the rest is marked deleted.
      const own = pieces.filter((p) => p.marks.some((m) => m.type.name === "insertion" && m.attrs.author === author));
      const others = pieces.filter((p) => !own.includes(p));
      for (const p of [...own].sort((a, b) => b.from - a.from)) out.delete(p.from, p.to);
      const after = new Mapping(out.mapping.maps.slice(out.mapping.maps.length - own.length));
      for (const p of others) {
        const a = after.map(p.from, 1);
        const b = after.map(p.to, -1);
        if (a >= b) continue;
        out.removeMark(a, b, schema.marks.insertion);
        out.addMark(a, b, deleted);
      }
      end = after.map(to, -1);
      const start = after.map(from, 1);
      // The kept text stays in the document: steps after this one see it as inserted.
      const keptSize = end - start;
      if (keptSize > 0) kept.appendMap(new StepMap([rawFrom, 0, keptSize]));
      // Backspace leaves the cursor before what it marked; Delete goes past it, so it can carry on.
      if (!slice.size) caret = backwards ? start : end;
    }

    if (slice.size) {
      out.replace(end, end, slice);
      const insertedTo = end + slice.size;
      textPieces(out.doc, end, insertedTo).forEach((p) => out.addMark(p.from, p.to, inserted));
      caret = insertedTo - (slice.openEnd ? slice.openEnd : 0);
    }
  }

  if (caret !== null && tr.selectionSet) out.setSelection(TextSelection.near(out.doc.resolve(Math.min(caret, out.doc.content.size))));
  else if (tr.selectionSet) {
    try {
      out.setSelection(tr.selection.map(out.doc, kept));
    } catch {
      // Leave the selection where the change put it.
    }
  }
  if (tr.storedMarksSet) out.setStoredMarks(tr.storedMarks);
  if (tr.scrolledIntoView) out.scrollIntoView();
  for (const key of META_KEYS) if (tr.getMeta(key) !== undefined) out.setMeta(key, tr.getMeta(key));
  return out.setMeta(UNTRACKED, true);
}

const TABLE_PARTS = new Set(["table", "tableRow", "tableCell", "tableHeader"]);

/**
 * Whether a change adds or takes away table rows, columns or cells. Those aren't tracked: kept as
 * "deleted", whole cells would stay in the table and break its shape.
 */
function changesTable(tr: Transaction) {
  return tr.steps.some((step, i) => {
    if (!(step instanceof ReplaceStep || step instanceof ReplaceAroundStep)) return false;
    let found = false;
    step.slice.content.descendants((node) => {
      if (TABLE_PARTS.has(node.type.name)) found = true;
      return !found;
    });
    tr.docs[i].nodesBetween(step.from, step.to, (node, pos) => {
      if (TABLE_PARTS.has(node.type.name) && pos >= step.from && pos + node.nodeSize <= step.to) found = true;
      return !found;
    });
    return found;
  });
}

export const TrackChanges = Extension.create({
  name: "trackChanges",
  addProseMirrorPlugins() {
    return [
      new Plugin<TrackState>({
        key: trackKey,
        state: {
          init: () => ({ on: false, locked: false, author: "" }),
          apply: (tr, value) => {
            const patch = tr.getMeta(trackKey) as Partial<TrackState> | undefined;
            return patch ? { ...value, ...patch, on: patch.locked || value.locked ? true : (patch.on ?? value.on) } : value;
          },
        },
      }),
    ];
  },
  // Every change the editor makes goes through here first, to be tracked while tracking is on.
  onCreate() {
    const view = this.editor.view;
    const base = view.props.dispatchTransaction;
    if (!base) return;
    view.setProps({
      dispatchTransaction: (tr: Transaction) => {
        const tracking = trackingOf(view.state);
        const skip = !tracking.on || !tr.docChanged || tr.getMeta(UNTRACKED) || tr.getMeta("addToHistory") === false || tr.getMeta(trackKey) || changesTable(tr);
        base.call(view, skip ? tr : track(view.state, tr, tracking.author || "Author"));
      },
    });
  },
});

// ---- Reviewing ----

export interface Change {
  kind: "insertion" | "deletion";
  from: number;
  to: number;
  author: string;
  date: string;
  text: string;
}

/** Every tracked change, in order: neighbouring pieces of the same kind and author are one change. */
export function changesOf(doc: PMNode): Change[] {
  const changes: Change[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const mark = node.marks.find((m) => m.type.name === "insertion" || m.type.name === "deletion");
    if (!mark) return;
    const last = changes.at(-1);
    const kind = mark.type.name as Change["kind"];
    if (last && last.kind === kind && last.to === pos && last.author === mark.attrs.author) {
      last.to = pos + node.nodeSize;
      last.text += node.text;
    } else changes.push({ kind, from: pos, to: pos + node.nodeSize, author: mark.attrs.author, date: mark.attrs.date, text: node.text ?? "" });
  });
  return changes;
}

/** Accepts or rejects changes: insertions kept (or removed), deletions removed (or kept). */
export function settle(editor: Editor, changes: Change[], accept: boolean) {
  const { schema } = editor.state;
  const tr = editor.state.tr;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    const goes = (c.kind === "deletion") === accept;
    if (goes) tr.delete(c.from, c.to);
    else tr.removeMark(c.from, c.to, schema.marks[c.kind]);
  }
  editor.view.dispatch(tr.setMeta(UNTRACKED, true));
}

/** The changes the selection touches (or the one the cursor is in). */
export function changesAt(editor: Editor) {
  const { from, to } = editor.state.selection;
  return changesOf(editor.state.doc).filter((c) => c.from <= Math.max(to, from + 1) - (to > from ? 1 : 0) && c.to >= from);
}

/** Moves to the next or previous change, selecting it. */
export function goToChange(editor: Editor, forward: boolean) {
  const changes = changesOf(editor.state.doc);
  const here = forward ? editor.state.selection.to : editor.state.selection.from;
  const next = forward ? changes.find((c) => c.from >= here) ?? changes[0] : [...changes].reverse().find((c) => c.to <= here) ?? changes.at(-1);
  if (next) editor.chain().focus().setTextSelection({ from: next.from, to: next.to }).scrollIntoView().run();
  return next ?? null;
}

// ---- Restrict Editing ----

export type Lock = "none" | "readonly" | "tracked" | "comments";

const lockKey = new PluginKey<Lock>("docs-lock");

export const lockOf = (state: EditorState): Lock => lockKey.getState(state) ?? "none";

export function setLock(editor: Editor, lock: Lock) {
  editor.view.dispatch(editor.state.tr.setMeta(lockKey, lock).setMeta("addToHistory", false));
}

/** Read only (or comments only): changes to the text are turned away, whichever button makes them. */
export const RestrictEditing = Extension.create({
  name: "restrictEditing",
  addProseMirrorPlugins() {
    return [
      new Plugin<Lock>({
        key: lockKey,
        state: {
          init: () => "none",
          apply: (tr, value) => (tr.getMeta(lockKey) as Lock | undefined) ?? value,
        },
        filterTransaction(tr, state) {
          const lock = lockKey.getState(state);
          if (!tr.docChanged || (lock !== "readonly" && lock !== "comments")) return true;
          // Docs' own bookkeeping (page numbers, tables of contents) still goes through.
          if (tr.getMeta("addToHistory") === false) return true;
          return lock === "comments" && Boolean(tr.getMeta(COMMENTING));
        },
      }),
    ];
  },
});
