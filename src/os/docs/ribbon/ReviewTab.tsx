"use client";

// Word's Review tab: Proofing, Speech, Accessibility, Language, Comments, Tracking, Changes,
// Compare and Protect. The tools themselves are in ../review.

import type { JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import {
  Accessibility,
  BookA,
  Check,
  ChevronLeft,
  ChevronRight,
  FileDiff,
  Languages,
  Lock,
  MessageSquareOff,
  MessageSquarePlus,
  MessagesSquare,
  NotebookText,
  PanelRight,
  PenLine,
  SpellCheck2,
  Trash2,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import type { PageLayout, Protection } from "../layout";
import { commentsAt, unmarkComment } from "../review/comments";
import type { PaneKind } from "../review/Panes";
import { compareDocs, LANGUAGES } from "../review/tools";
import { changesAt, changesOf, goToChange, settle } from "../review/track";
import { readWordFile } from "../wordFile";
import { Form, Heading } from "./LayoutTab";
import { Big, Group, keepFocus, MenuButton, MenuItem, Stack } from "./parts";

export type Markup = "simple" | "all" | "none" | "original";

/** What the Docs window keeps for the Review tab: how changes and comments show, and the panes. */
export interface ReviewView {
  pane: PaneKind | null;
  onPane: (pane: PaneKind | null) => void;
  markup: Markup;
  onMarkup: (m: Markup) => void;
  showComments: boolean;
  onShowComments: (show: boolean) => void;
  showChanges: boolean;
  onShowChanges: (show: boolean) => void;
  readAloud: boolean;
  onReadAloud: (on: boolean) => void;
  /** Makes a comment on the selection and opens it for typing. */
  onNewComment: () => void;
  pages: number;
  author: string;
}

interface Props {
  editor: Editor;
  title: string;
  layout: PageLayout;
  onLayout: (patch: Partial<PageLayout>) => void;
  onGenerated: (content: JSONContent, layout: Partial<PageLayout>, title: string) => void;
  view: ReviewView;
}

function Small(p: { icon: LucideIcon; label: string; title?: string; disabled?: boolean; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={p.title ?? p.label}
      disabled={p.disabled}
      aria-pressed={p.active}
      onMouseDown={keepFocus}
      onClick={p.onClick}
      className={`flex h-7 items-center gap-1 rounded px-1 text-xs disabled:opacity-35 ${p.active ? "bg-blue-100 text-blue-800" : "hover:bg-slate-200/70"}`}
    >
      <p.icon size={16} /> {p.label}
    </button>
  );
}

const MARKUPS: [Markup, string][] = [
  ["simple", "Simple Markup"],
  ["all", "All Markup"],
  ["none", "No Markup"],
  ["original", "Original"],
];

export function ReviewTab(p: Props) {
  const { editor, layout, view } = p;
  const review = layout.review;
  const setReview = (patch: Partial<PageLayout["review"]>) => p.onLayout({ review: { ...review, ...patch } });
  const locked = review.protection !== "none";
  const readOnly = review.protection === "readonly" || review.protection === "comments";
  const togglePane = (kind: PaneKind) => view.onPane(view.pane === kind ? null : kind);
  const changes = changesOf(editor.state.doc);
  const here = commentsAt(editor);

  const settleAndMove = (accept: boolean) => {
    const at = changesAt(editor);
    if (at.length) settle(editor, at, accept);
    goToChange(editor, true);
  };

  return (
    <>
      <Group label="Proofing">
        <Big icon={SpellCheck2} label={"Spelling &\nGrammar"} title="Spelling & Grammar (F7)" active={view.pane === "editor"} onClick={() => togglePane("editor")} />
        <Stack>
          <Small icon={BookA} label="Thesaurus" title="Thesaurus (Shift+F7)" active={view.pane === "thesaurus"} onClick={() => togglePane("thesaurus")} />
          <MenuButton icon={NotebookText} label="Word Count" showLabel arrow={false} menu={() => <WordCount editor={editor} pages={view.pages} />} />
        </Stack>
      </Group>

      <Group label="Speech">
        <Big icon={Volume2} label={"Read\nAloud"} active={view.readAloud} onClick={() => view.onReadAloud(!view.readAloud)} />
      </Group>

      <Group label="Accessibility">
        <Big icon={Accessibility} label={"Check\nAccessibility"} active={view.pane === "accessibility"} onClick={() => togglePane("accessibility")} />
      </Group>

      <Group label="Language">
        <MenuButton
          big
          icon={Languages}
          label="Translate"
          menu={(close) => (
            <div className="w-56">
              <MenuItem label="Translate Selection" onClick={() => (close(), view.onPane("translator"))} />
              <MenuItem label="Translate Document" onClick={() => (close(), view.onPane("translator"))} />
            </div>
          )}
        />
        <MenuButton big icon={Languages} label="Language" menu={(close) => <LanguageForm language={review.language} onDone={close} onPick={(language) => setReview({ language })} />} />
      </Group>

      <Group label="Comments">
        <Big icon={MessageSquarePlus} label={"New\nComment"} title="New Comment (Ctrl+Alt+M)" disabled={review.protection === "readonly"} onClick={view.onNewComment} />
        <Stack>
          <MenuButton
            icon={Trash2}
            label="Delete"
            showLabel
            disabled={!review.comments.length || review.protection === "readonly"}
            menu={(close) => (
              <>
                <MenuItem
                  label="Delete"
                  onClick={() => {
                    close();
                    for (const id of here) unmarkComment(editor, id);
                    setReview({ comments: review.comments.filter((c) => !here.includes(c.id)) });
                  }}
                />
                <MenuItem
                  label="Delete All Comments in Document"
                  onClick={() => {
                    close();
                    for (const c of review.comments) unmarkComment(editor, c.id);
                    setReview({ comments: [] });
                  }}
                />
              </>
            )}
          />
          <div className="flex">
            <Small icon={ChevronLeft} label="Previous" onClick={() => goToComment(editor, false)} />
            <Small icon={ChevronRight} label="Next" onClick={() => goToComment(editor, true)} />
          </div>
          <Small icon={view.showComments ? MessagesSquare : MessageSquareOff} label="Show Comments" active={view.showComments} onClick={() => view.onShowComments(!view.showComments)} />
        </Stack>
      </Group>

      <Group label="Tracking">
        <Big
          icon={PenLine}
          label={"Track\nChanges"}
          title={review.protection === "tracked" ? "Track Changes (locked on by Restrict Editing)" : "Track Changes (Ctrl+Shift+E)"}
          active={review.tracking || review.protection === "tracked"}
          disabled={review.protection === "tracked" || readOnly}
          onClick={() => setReview({ tracking: !review.tracking })}
        />
        <Stack>
          <label className="flex h-7 items-center gap-1 px-1 text-xs" onMouseDown={(e) => e.stopPropagation()}>
            <select value={view.markup} onChange={(e) => view.onMarkup(e.target.value as Markup)} className="rounded border border-slate-300 bg-surface px-1 py-0.5 text-xs" title="Display for Review">
              {MARKUPS.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <MenuButton
            icon={Check}
            label="Show Markup"
            showLabel
            menu={() => (
              <>
                <MenuItem label="Comments" checked={view.showComments} onClick={() => view.onShowComments(!view.showComments)} />
                <MenuItem label="Insertions and Deletions" checked={view.showChanges} onClick={() => view.onShowChanges(!view.showChanges)} />
              </>
            )}
          />
          <Small icon={PanelRight} label="Reviewing Pane" active={view.pane === "reviewing"} onClick={() => togglePane("reviewing")} />
        </Stack>
      </Group>

      <Group label="Changes">
        <MenuButton
          big
          icon={Check}
          label="Accept"
          disabled={!changes.length || readOnly}
          menu={(close) => (
            <div className="w-64">
              <MenuItem label="Accept and Move to Next" onClick={() => (close(), settleAndMove(true))} />
              <MenuItem label="Accept This Change" onClick={() => (close(), settle(editor, changesAt(editor), true))} />
              <MenuItem label="Accept All Changes" onClick={() => (close(), settle(editor, changesOf(editor.state.doc), true))} />
              <MenuItem
                label="Accept All Changes and Stop Tracking"
                onClick={() => {
                  close();
                  settle(editor, changesOf(editor.state.doc), true);
                  if (review.protection !== "tracked") setReview({ tracking: false });
                }}
              />
            </div>
          )}
        />
        <MenuButton
          big
          icon={X}
          label="Reject"
          disabled={!changes.length || readOnly}
          menu={(close) => (
            <div className="w-64">
              <MenuItem label="Reject and Move to Next" onClick={() => (close(), settleAndMove(false))} />
              <MenuItem label="Reject Change" onClick={() => (close(), settle(editor, changesAt(editor), false))} />
              <MenuItem label="Reject All Changes" onClick={() => (close(), settle(editor, changesOf(editor.state.doc), false))} />
              <MenuItem
                label="Reject All Changes and Stop Tracking"
                onClick={() => {
                  close();
                  settle(editor, changesOf(editor.state.doc), false);
                  if (review.protection !== "tracked") setReview({ tracking: false });
                }}
              />
            </div>
          )}
        />
        <Stack>
          <Small icon={ChevronLeft} label="Previous" disabled={!changes.length} onClick={() => goToChange(editor, false)} />
          <Small icon={ChevronRight} label="Next" disabled={!changes.length} onClick={() => goToChange(editor, true)} />
        </Stack>
      </Group>

      <Group label="Compare">
        <MenuButton big arrow={false} icon={FileDiff} label="Compare" menu={(close) => <CompareForm {...p} onDone={close} />} />
      </Group>

      <Group label="Protect">
        <MenuButton
          big
          arrow={false}
          icon={Lock}
          label={"Restrict\nEditing"}
          align="right"
          menu={(close) => <RestrictForm protection={review.protection} password={review.password} onDone={close} onSet={(protection, password) => setReview({ protection, password })} />}
        />
        {locked && <span className="self-start px-1 pt-1 text-[11px] text-amber-700">Protected</span>}
      </Group>
    </>
  );
}

/** Moves to the next or previous comment's text. */
function goToComment(editor: Editor, forward: boolean) {
  const starts: number[] = [];
  let open = false;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const has = node.marks.some((m) => m.type.name === "comment");
    if (has && !open) starts.push(pos);
    open = has;
  });
  const here = editor.state.selection.from;
  const next = forward ? starts.find((s) => s > here) ?? starts[0] : [...starts].reverse().find((s) => s < here - 1) ?? starts.at(-1);
  if (next !== undefined) editor.chain().focus().setTextSelection(next + 1).scrollIntoView().run();
}

/** Word Count: pages, words, characters, paragraphs and lines, with or without the notes. */
function WordCount({ editor, pages }: { editor: Editor; pages: number }) {
  const [notes, setNotes] = useState(true);
  let text = "";
  let paragraphs = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "note" && notes) text += ` ${node.attrs.text}`;
    if (!node.isTextblock) return;
    const t = node.textContent;
    if (t.trim()) paragraphs++;
    text += `${t}\n`;
    node.descendants((child) => {
      if (child.type.name === "note" && notes) text += ` ${child.attrs.text}`;
    });
    return false;
  });
  const words = text.match(/[^\s]+/g)?.length ?? 0;
  // Lines as the page shows them.
  let lines = 0;
  for (const block of editor.view.dom.querySelectorAll<HTMLElement>("p, h1, h2, h3, h4, h5, h6, li > p")) {
    const range = document.createRange();
    range.selectNodeContents(block);
    const tops = new Set([...range.getClientRects()].filter((r) => r.height > 0).map((r) => Math.round(r.top / 4)));
    lines += tops.size;
  }
  const rows: [string, number][] = [
    ["Pages", pages],
    ["Words", words],
    ["Characters (no spaces)", text.replace(/\s/g, "").length],
    ["Characters (with spaces)", text.replace(/\n/g, "").length],
    ["Paragraphs", paragraphs],
    ["Lines", lines],
  ];
  return (
    <div className="w-64 p-2 text-sm">
      <h3 className="mb-2 font-semibold">Word Count</h3>
      <table className="w-full">
        <tbody>
          {rows.map(([name, n]) => (
            <tr key={name}>
              <td className="py-0.5 text-slate-600">{name}</td>
              <td className="py-0.5 text-right tabular-nums">{n.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <label className="mt-2 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} /> Include footnotes and endnotes
      </label>
    </div>
  );
}

function LanguageForm({ language, onPick, onDone }: { language: string; onPick: (l: string) => void; onDone: () => void }) {
  const [choice, setChoice] = useState(language || "en");
  const [skip, setSkip] = useState(language === "");
  return (
    <Form title="Language" ok cancel="Cancel" onCancel={onDone} onApply={() => (onDone(), onPick(skip ? "" : choice))}>
      <p className="text-xs text-slate-500">The language spelling and grammar are checked in.</p>
      <select size={8} value={choice} disabled={skip} onChange={(e) => setChoice(e.target.value)} className="rounded border border-slate-300 bg-surface text-sm">
        {LANGUAGES.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> Do not check spelling or grammar
      </label>
    </Form>
  );
}

/** The paragraphs of a document chosen to compare with: a Word file, a web page or plain text. */
async function paragraphsOf(file: File): Promise<string[]> {
  let html: string;
  if (/\.docx$/i.test(file.name)) {
    const read = await readWordFile(await file.arrayBuffer());
    html = "page" in read ? read.page : read.body;
  } else if (/\.html?$/i.test(file.name)) html = await file.text();
  else return (await file.text()).split(/\r?\n/);
  const page = new DOMParser().parseFromString(html, "text/html");
  return [...page.body.querySelectorAll("p, h1, h2, h3, h4, h5, h6")].filter((el) => !el.querySelector("p")).map((el) => el.textContent ?? "");
}

function CompareForm(p: Props & { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [thisIsOriginal, setThisIsOriginal] = useState(false);
  const [error, setError] = useState("");
  return (
    <Form
      title="Compare Documents"
      ok={file !== null}
      problem="Choose the other version of the document."
      cancel="Cancel"
      onCancel={p.onDone}
      onApply={async () => {
        try {
          const other = await paragraphsOf(file!);
          const mine: string[] = [];
          p.editor.state.doc.descendants((node) => {
            if (node.isTextblock) {
              mine.push(node.textContent);
              return false;
            }
          });
          const [original, revised] = thisIsOriginal ? [mine, other] : [other, mine];
          p.onDone();
          p.onGenerated(compareDocs(original, revised, p.view.author || "Compare"), { ...p.layout }, "Compare Result");
        } catch (e) {
          setError(e instanceof Error ? e.message : "That file couldn't be read.");
        }
      }}
    >
      <p className="text-xs text-slate-500">Shows what changed between two versions, as tracked changes in a new document.</p>
      <input ref={input} type="file" accept=".docx,.html,.htm,.txt" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button type="button" onClick={() => input.current?.click()} className="rounded border border-slate-300 px-2 py-1 text-left text-sm hover:bg-slate-50">
        {file ? file.name : "Choose the other version…"}
      </button>
      <Heading>Which is the original?</Heading>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" checked={!thisIsOriginal} onChange={() => setThisIsOriginal(false)} /> The chosen file (this document is the revision)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" checked={thisIsOriginal} onChange={() => setThisIsOriginal(true)} /> This document
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </Form>
  );
}

/** SHA-256, as hex: what's kept of a protection password. */
async function hash(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function RestrictForm(p: { protection: Protection; password: string; onSet: (protection: Protection, password: string) => void; onDone: () => void }) {
  const [mode, setMode] = useState<Protection>(p.protection === "none" ? "readonly" : p.protection);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  if (p.protection !== "none") {
    return (
      <Form
        title="Restrict Editing"
        ok
        cancel="Close"
        onCancel={p.onDone}
        onApply={async () => {
          if (p.password && (await hash(password)) !== p.password) return setError("That password isn't right.");
          p.onDone();
          p.onSet("none", "");
        }}
      >
        <p className="text-sm">
          This document is protected: {p.protection === "readonly" ? "it can only be read" : p.protection === "comments" ? "only comments can be added" : "every change is tracked"}.
        </p>
        {p.password && (
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
          </label>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <p className="text-xs text-slate-500">OK stops protection.</p>
      </Form>
    );
  }
  return (
    <Form
      title="Restrict Editing"
      ok={password === again}
      problem="The passwords don't match."
      cancel="Cancel"
      onCancel={p.onDone}
      onApply={async () => {
        p.onDone();
        p.onSet(mode, password ? await hash(password) : "");
      }}
    >
      <Heading>Allow only this type of editing</Heading>
      {(
        [
          ["readonly", "No changes (Read only)"],
          ["tracked", "Tracked changes"],
          ["comments", "Comments"],
        ] as [Protection, string][]
      ).map(([id, name]) => (
        <label key={id} className="flex items-center gap-2 text-sm">
          <input type="radio" checked={mode === id} onChange={() => setMode(id)} /> {name}
        </label>
      ))}
      <Heading>Start enforcement</Heading>
      <input type="password" placeholder="New password (optional)" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm" />
      <input type="password" placeholder="Reenter password" value={again} onChange={(e) => setAgain(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm" />
      <p className="text-xs text-slate-500">Like Word&apos;s, this stops accidental changes; it isn&apos;t encryption.</p>
    </Form>
  );
}
