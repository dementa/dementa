"use client";

// Word's References tab: Table of Contents, Footnotes, Research, Citations & Bibliography,
// Captions and Index. The pieces it inserts are in refNodes.ts, kept up to date by refresh.ts.

import type { Editor } from "@tiptap/react";
import {
  BookMarked,
  BookOpen,
  FileSymlink,
  Globe,
  Images,
  Library,
  ListTree,
  NotebookPen,
  Pencil,
  Plus,
  Quote,
  RefreshCw,
  SquarePlus,
  Tag,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import type { PageLayout } from "../layout";
import { newNoteId } from "../notes";
import { CITATION_STYLES, emptySource, SOURCE_TYPES, sourceLabel, type CitationStyle, type References, type Source } from "../references";
import { refreshNow } from "../refresh";
import type { NoteKind, RefBlockKind } from "../refNodes";
import { CrossReferencePanel, WikipediaPanel } from "./insertPanels";
import { Choices, Form, Heading } from "./LayoutTab";
import { Big, Group, keepFocus, MenuButton, MenuItem, Stack } from "./parts";

interface Props {
  editor: Editor;
  layout: PageLayout;
  onLayout: (patch: Partial<PageLayout>) => void;
  /** Opens a note's panel to type it. */
  onNote: (id: string) => void;
}

/** A small button with its name beside the icon. */
function Small(p: { icon: LucideIcon; label: string; title?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={p.title ?? p.label}
      disabled={p.disabled}
      onMouseDown={keepFocus}
      onClick={p.onClick}
      className="flex h-7 items-center gap-1 rounded px-1 text-xs hover:bg-slate-200/70 disabled:opacity-35"
    >
      <p.icon size={16} /> {p.label}
    </button>
  );
}

/** The first block of a kind in the document, if there is one. */
function findBlock(editor: Editor, kind: RefBlockKind, label?: string) {
  let found: { pos: number; size: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === "refBlock" && node.attrs.kind === kind && (label === undefined || node.attrs.label === label)) found = { pos, size: node.nodeSize };
  });
  return found as { pos: number; size: number } | null;
}

/** Puts a table of contents (or figures, the bibliography, the index) where the cursor is, or in place of the one there. */
function insertBlock(editor: Editor, attrs: { kind: RefBlockKind; title: string; levels?: number; label?: string }) {
  const old = findBlock(editor, attrs.kind, attrs.kind === "figures" ? attrs.label : undefined);
  const content = { type: "refBlock", attrs: { levels: 3, label: "", ...attrs } };
  if (old) editor.chain().focus().insertContentAt({ from: old.pos, to: old.pos + old.size }, content).run();
  else editor.chain().focus().insertContent(content).run();
  refreshNow(editor.view);
}

export function ReferencesTab(p: Props) {
  const { editor } = p;
  const refs = p.layout.references;
  const setRefs = (patch: Partial<References>) => p.onLayout({ references: { ...refs, ...patch } });
  const insertNote = (kind: NoteKind) => {
    const id = newNoteId();
    editor.chain().focus().insertContent({ type: "note", attrs: { id, kind } }).run();
    p.onNote(id);
  };
  return (
    <>
      <Group label="Table of Contents">
        <TocButton editor={editor} />
        <Stack>
          <AddTextButton editor={editor} />
          <Small icon={RefreshCw} label="Update Table" onClick={() => refreshNow(editor.view)} />
        </Stack>
      </Group>
      <Group label="Footnotes">
        <Big icon={NotebookPen} label={"Insert\nFootnote"} title="Insert Footnote (Alt+Ctrl+F)" onClick={() => insertNote("footnote")} />
        <Stack>
          <Small icon={SquarePlus} label="Insert Endnote" onClick={() => insertNote("endnote")} />
          <NextNoteButton editor={editor} />
          <Small icon={BookOpen} label="Show Notes" onClick={() => showNotes(editor, p.onNote)} />
        </Stack>
      </Group>
      <Group label="Research">
        <MenuButton big arrow={false} icon={Globe} label="Search" title="Search Wikipedia" menu={(close) => <WikipediaPanel editor={editor} onDone={close} />} />
      </Group>
      <Group label="Citations & Bibliography">
        <InsertCitationButton editor={editor} refs={refs} onRefs={setRefs} />
        <Stack>
          <MenuButton icon={Library} label="Manage Sources" showLabel arrow={false} menu={(close) => <ManageSources refs={refs} onRefs={setRefs} onDone={close} />} />
          <label className="flex h-7 items-center gap-1 px-1 text-xs" onMouseDown={(e) => e.stopPropagation()}>
            Style:
            <select
              value={refs.style}
              onChange={(e) => setRefs({ style: e.target.value as CitationStyle })}
              className="rounded border border-slate-300 bg-surface px-1 py-0.5 text-xs"
            >
              {CITATION_STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id === "harvard" ? "Harvard" : s.id.toUpperCase().replace("CHICAGO", "Chicago")}
                </option>
              ))}
            </select>
          </label>
          <MenuButton
            icon={BookMarked}
            label="Bibliography"
            showLabel
            menu={(close) => (
              <div className="w-56">
                <Heading>Built-In</Heading>
                {["Bibliography", "References", "Works Cited"].map((title) => (
                  <MenuItem key={title} label={title} onClick={() => (close(), insertBlock(editor, { kind: "bibliography", title }))} />
                ))}
                <div className="my-1 border-t border-slate-200" />
                <MenuItem label="Insert Bibliography (no title)" onClick={() => (close(), insertBlock(editor, { kind: "bibliography", title: "" }))} />
              </div>
            )}
          />
        </Stack>
      </Group>
      <Group label="Captions">
        <MenuButton big arrow={false} icon={Tag} label={"Insert\nCaption"} menu={(close) => <CaptionForm editor={editor} onDone={close} />} />
        <Stack>
          <MenuButton
            icon={Images}
            label="Insert Table of Figures"
            showLabel
            arrow={false}
            menu={(close) => (
              <div className="w-52">
                <Heading>Caption label</Heading>
                {CAPTION_LABELS.map((label) => (
                  <MenuItem key={label} label={label} onClick={() => (close(), insertBlock(editor, { kind: "figures", title: `Table of ${label}s`, label }))} />
                ))}
              </div>
            )}
          />
          <Small icon={RefreshCw} label="Update Table" onClick={() => refreshNow(editor.view)} />
          <MenuButton icon={FileSymlink} label="Cross-reference" showLabel arrow={false} align="right" menu={(close) => <CrossReferencePanel editor={editor} onDone={close} />} />
        </Stack>
      </Group>
      <Group label="Index">
        <MenuButton big arrow={false} icon={Pencil} label={"Mark\nEntry"} align="right" menu={(close) => <MarkEntryForm editor={editor} onDone={close} />} />
        <Stack>
          <Small icon={ListTree} label="Insert Index" onClick={() => insertBlock(editor, { kind: "index", title: "Index" })} />
          <Small icon={RefreshCw} label="Update Index" onClick={() => refreshNow(editor.view)} />
        </Stack>
      </Group>
    </>
  );
}

// ---- Table of contents ----

function TocButton({ editor }: { editor: Editor }) {
  const has = findBlock(editor, "toc") !== null;
  return (
    <MenuButton
      big
      icon={ListTree}
      label={"Table of\nContents"}
      menu={(close) => (
        <Choices
          more="Custom Table of Contents…"
          form={(back) => (
            <TocForm
              onCancel={back}
              onApply={(title, levels) => {
                close();
                insertBlock(editor, { kind: "toc", title, levels });
              }}
            />
          )}
        >
          <div className="w-60">
            <Heading>Built-In</Heading>
            <MenuItem label="Automatic Table 1" hint="Contents" onClick={() => (close(), insertBlock(editor, { kind: "toc", title: "Contents", levels: 3 }))} />
            <MenuItem label="Automatic Table 2" hint="Table of Contents" onClick={() => (close(), insertBlock(editor, { kind: "toc", title: "Table of Contents", levels: 3 }))} />
            {has && (
              <MenuItem
                icon={Trash2}
                label="Remove Table of Contents"
                onClick={() => {
                  close();
                  const old = findBlock(editor, "toc");
                  if (old) editor.chain().focus().deleteRange({ from: old.pos, to: old.pos + old.size }).run();
                }}
              />
            )}
          </div>
        </Choices>
      )}
    />
  );
}

function TocForm({ onApply, onCancel }: { onApply: (title: string, levels: number) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("Contents");
  const [levels, setLevels] = useState(3);
  return (
    <Form title="Table of Contents" ok onCancel={onCancel} onApply={() => onApply(title.trim(), levels)}>
      <label className="flex flex-col gap-1 text-sm">
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
      </label>
      <label className="flex items-center justify-between gap-2 text-sm">
        Show levels
        <select value={levels} onChange={(e) => setLevels(Number(e.target.value))} className="rounded border border-slate-300 bg-surface px-1.5 py-0.5">
          {[1, 2, 3].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
    </Form>
  );
}

/** Add Text: makes the paragraph a heading of a level (so it's in the table), or a plain paragraph. */
function AddTextButton({ editor }: { editor: Editor }) {
  const level = editor.isActive("heading") ? (editor.getAttributes("heading").level as number) : 0;
  return (
    <MenuButton
      icon={Plus}
      label="Add Text"
      showLabel
      menu={(close) => (
        <>
          <MenuItem label="Do Not Show in Table of Contents" checked={level === 0} onClick={() => (close(), editor.chain().focus().setParagraph().run())} />
          {([1, 2, 3] as const).map((n) => (
            <MenuItem key={n} label={`Level ${n}`} checked={level === n} onClick={() => (close(), editor.chain().focus().setHeading({ level: n }).run())} />
          ))}
        </>
      )}
    />
  );
}

// ---- Footnotes ----

/** Moves to the next or previous footnote or endnote mark. */
function goToNote(editor: Editor, kind: NoteKind, forward: boolean) {
  const here = editor.state.selection.from;
  const marks: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "note" && node.attrs.kind === kind) marks.push(pos);
  });
  const next = forward ? marks.find((pos) => pos > here) : [...marks].reverse().find((pos) => pos < here - 1);
  if (next !== undefined) editor.chain().focus().setTextSelection(next + 1).scrollIntoView().run();
}

function NextNoteButton({ editor }: { editor: Editor }) {
  return (
    <MenuButton
      icon={FileSymlink}
      label="Next Footnote"
      showLabel
      menu={(close) => (
        <>
          <MenuItem label="Next Footnote" onClick={() => (close(), goToNote(editor, "footnote", true))} />
          <MenuItem label="Previous Footnote" onClick={() => (close(), goToNote(editor, "footnote", false))} />
          <MenuItem label="Next Endnote" onClick={() => (close(), goToNote(editor, "endnote", true))} />
          <MenuItem label="Previous Endnote" onClick={() => (close(), goToNote(editor, "endnote", false))} />
        </>
      )}
    />
  );
}

/** Show Notes: the note nearest after the cursor (or the first), open to read and change. */
function showNotes(editor: Editor, open: (id: string) => void) {
  const here = editor.state.selection.from;
  let first: string | null = null;
  let after: string | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "note") return;
    first ??= node.attrs.id;
    if (!after && pos >= here) after = node.attrs.id;
  });
  const id = after ?? first;
  if (id) open(id);
}

// ---- Citations ----

function InsertCitationButton({ editor, refs, onRefs }: { editor: Editor; refs: References; onRefs: (patch: Partial<References>) => void }) {
  const cite = (ids: string[]) => editor.chain().focus().insertContent({ type: "citation", attrs: { sources: ids.join(",") } }).run();
  return (
    <MenuButton
      big
      icon={Quote}
      label={"Insert\nCitation"}
      menu={(close) => (
        <Choices
          more="Add New Source…"
          form={(back) => (
            <SourceForm
              source={emptySource()}
              onCancel={back}
              onApply={(source) => {
                close();
                onRefs({ sources: [...refs.sources, source] });
                cite([source.id]);
              }}
            />
          )}
        >
          <div className="max-h-80 w-72 overflow-y-auto">
            {refs.sources.length ? <Heading>Sources</Heading> : <p className="px-2 py-1.5 text-sm text-slate-500">No sources yet. Add one to cite it.</p>}
            {refs.sources.map((s) => (
              <MenuItem key={s.id} label={sourceLabel(s)} onClick={() => (close(), cite([s.id]))} />
            ))}
          </div>
        </Choices>
      )}
    />
  );
}

/** Adding or changing a source: what Word's Create Source dialog asks for. */
function SourceForm({ source, onApply, onCancel }: { source: Source; onApply: (s: Source) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(source);
  const [authors, setAuthors] = useState(source.authors.join("\n"));
  const set = (patch: Partial<Source>) => setDraft((d) => ({ ...d, ...patch }));
  const field = (key: keyof Source, label: string, placeholder = "") => (
    <label className="flex flex-col gap-0.5 text-xs">
      {label}
      <input
        value={draft[key] as string}
        placeholder={placeholder}
        onChange={(e) => set({ [key]: e.target.value })}
        className="rounded border border-slate-300 px-2 py-1 text-sm"
      />
    </label>
  );
  return (
    <Form
      title={source.title ? "Edit Source" : "Create Source"}
      ok={draft.title.trim().length > 0}
      problem="A source needs a title."
      cancel="Cancel"
      onCancel={onCancel}
      onApply={() =>
        onApply({
          ...draft,
          authors: authors
            .split("\n")
            .map((a) => a.trim())
            .filter(Boolean),
        })
      }
    >
      <label className="flex items-center justify-between gap-2 text-sm">
        Type of source
        <select value={draft.type} onChange={(e) => set({ type: e.target.value as Source["type"] })} className="rounded border border-slate-300 bg-surface px-1.5 py-0.5">
          {SOURCE_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-0.5 text-xs">
        Authors (one per line: Last, First)
        <textarea value={authors} rows={2} onChange={(e) => setAuthors(e.target.value)} placeholder="Smith, Jane" className="rounded border border-slate-300 px-2 py-1 text-sm" />
      </label>
      {field("title", "Title")}
      {field("year", "Year")}
      {draft.type === "article" && (
        <>
          {field("journal", "Journal name")}
          <div className="grid grid-cols-3 gap-1.5">
            {field("volume", "Volume")}
            {field("issue", "Issue")}
            {field("pages", "Pages", "12-30")}
          </div>
        </>
      )}
      {(draft.type === "book" || draft.type === "report") && (
        <>
          {field("city", "City")}
          {field("publisher", "Publisher")}
        </>
      )}
      {draft.type === "website" && (
        <>
          {field("site", "Name of web site")}
          {field("url", "URL", "https://")}
          {field("accessed", "Date accessed")}
        </>
      )}
    </Form>
  );
}

function ManageSources({ refs, onRefs, onDone }: { refs: References; onRefs: (patch: Partial<References>) => void; onDone: () => void }) {
  const [editing, setEditing] = useState<Source | null>(null);
  if (editing) {
    return (
      <SourceForm
        source={editing}
        onCancel={() => setEditing(null)}
        onApply={(s) => {
          onRefs({ sources: refs.sources.some((x) => x.id === s.id) ? refs.sources.map((x) => (x.id === s.id ? s : x)) : [...refs.sources, s] });
          setEditing(null);
        }}
      />
    );
  }
  return (
    <div className="flex w-80 flex-col gap-1 p-1">
      <h3 className="px-1 text-sm font-semibold">Source Manager</h3>
      <div className="max-h-72 overflow-y-auto">
        {refs.sources.length === 0 && <p className="px-1 py-2 text-sm text-slate-500">This document has no sources yet.</p>}
        {refs.sources.map((s) => (
          <div key={s.id} className="flex items-center gap-1 rounded px-1 py-1 text-sm hover:bg-slate-50">
            <span className="min-w-0 flex-1 truncate" title={sourceLabel(s)}>
              {sourceLabel(s)}
            </span>
            <button type="button" title="Edit" onClick={() => setEditing(s)} className="rounded p-1 text-slate-500 hover:bg-slate-200">
              <Pencil size={13} />
            </button>
            <button
              type="button"
              title="Delete"
              onClick={() => onRefs({ sources: refs.sources.filter((x) => x.id !== s.id) })}
              className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between gap-2">
        <button type="button" onClick={() => setEditing(emptySource())} className="flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-slate-100">
          <Plus size={14} /> New…
        </button>
        <button type="button" onClick={onDone} className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700">
          Close
        </button>
      </div>
    </div>
  );
}

// ---- Captions ----

const CAPTION_LABELS = ["Figure", "Table", "Equation"] as const;

/** Insert Caption: "Figure 1: …" on a line of its own, under the picture or table (or above it). */
export function CaptionForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const picture = editor.isActive("image");
  const table = editor.isActive("table");
  const [label, setLabel] = useState<string>(table ? "Table" : "Figure");
  const [text, setText] = useState("");
  const [below, setBelow] = useState(true);
  return (
    <Form
      title="Caption"
      ok
      onCancel={onDone}
      onApply={() => {
        onDone();
        const { state } = editor;
        const $from = state.selection.$from;
        // Next to the picture or table that's selected, or the paragraph the cursor is in.
        let at = picture ? state.selection.from : $from.before(1);
        let size = picture ? state.selection.$from.nodeAfter?.nodeSize ?? 1 : $from.node(1).nodeSize;
        if (table) {
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === "table") {
              at = $from.before(d);
              size = $from.node(d).nodeSize;
              break;
            }
          }
        }
        const content = {
          type: "paragraph",
          attrs: { styleName: "caption" },
          content: [{ type: "text", text: `${label} ` }, { type: "captionNumber", attrs: { label } }, ...(text.trim() ? [{ type: "text", text: `: ${text.trim()}` }] : [])],
        };
        editor.chain().focus().insertContentAt(below ? at + size : at, content).run();
      }}
    >
      <label className="flex items-center justify-between gap-2 text-sm">
        Label
        <select value={label} onChange={(e) => setLabel(e.target.value)} className="rounded border border-slate-300 bg-surface px-1.5 py-0.5">
          {CAPTION_LABELS.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Caption
        <span className="flex items-center gap-1">
          <span className="shrink-0 text-slate-500">{label} 1:</span>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1" />
        </span>
      </label>
      <label className="flex items-center justify-between gap-2 text-sm">
        Position
        <select value={below ? "below" : "above"} onChange={(e) => setBelow(e.target.value === "below")} className="rounded border border-slate-300 bg-surface px-1.5 py-0.5">
          <option value="below">Below selected item</option>
          <option value="above">Above selected item</option>
        </select>
      </label>
    </Form>
  );
}

// ---- Index ----

function MarkEntryForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const { from, to } = editor.state.selection;
  const [main, setMain] = useState(editor.state.doc.textBetween(from, to, " ").trim().slice(0, 80));
  const [sub, setSub] = useState("");
  return (
    <Form
      title="Mark Index Entry"
      ok={main.trim().length > 0}
      problem="Type the entry's word or phrase."
      onCancel={onDone}
      onApply={() => {
        onDone();
        // After the selected word, as Word puts its XE field.
        editor.chain().focus().insertContentAt(editor.state.selection.to, { type: "indexMark", attrs: { main: main.trim(), sub: sub.trim() } }).run();
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Main entry
        <input autoFocus value={main} onChange={(e) => setMain(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Subentry
        <input value={sub} onChange={(e) => setSub(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
      </label>
      <p className="text-xs text-slate-500">Marks are hidden; turn on ¶ on the Home tab to see them.</p>
    </Form>
  );
}
