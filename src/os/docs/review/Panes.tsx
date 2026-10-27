"use client";

// The panes the Review tab opens beside the page, as Word does: Editor (spelling and grammar),
// Thesaurus, Translator, Accessibility and the Reviewing Pane.

import type { JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Info, Loader2, MessageSquare, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { PageLayout } from "../layout";
import type { Comment } from "./comments";
import { addWord, checkAccessibility, IGNORED_WORDS, findIssues, LANGUAGES, loadSpeller, lookUp, translate, type Finding, type Issue, type Synonyms } from "./tools";
import { changesOf, settle } from "./track";
import { recheckAll } from "./proofing";
import type NSpell from "nspell";
import { HelpPane, type HelpSection } from "../help/HelpPane";

export type PaneKind = "editor" | "thesaurus" | "translator" | "accessibility" | "reviewing" | HelpSection;

const TITLES: Record<PaneKind, string> = {
  editor: "Editor",
  thesaurus: "Thesaurus",
  translator: "Translator",
  accessibility: "Accessibility",
  reviewing: "Revisions",
  help: "Help",
  shortcuts: "Help",
  training: "Help",
  whatsnew: "Help",
};

const HELP: PaneKind[] = ["help", "shortcuts", "training", "whatsnew"];

interface PaneProps {
  editor: Editor;
  layout: PageLayout;
  onClose: () => void;
  onGenerated: (content: JSONContent, layout: Partial<PageLayout>, title: string) => void;
  title: string;
}

/** The pane beside the page, with its name and a close button. */
export function TaskPane(p: PaneProps & { kind: PaneKind; onKind: (kind: PaneKind) => void }) {
  return (
    <aside aria-label={TITLES[p.kind]} className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-surface text-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h2 className="text-sm font-semibold">{TITLES[p.kind]}</h2>
        <button type="button" title="Close" aria-label="Close" onClick={p.onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100">
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
        {HELP.includes(p.kind) ? (
          <HelpPane key={p.kind} section={p.kind as HelpSection} onSection={p.onKind} />
        ) : p.kind === "editor" ? (
          <EditorPane {...p} />
        ) : p.kind === "thesaurus" ? (
          <ThesaurusPane {...p} />
        ) : p.kind === "translator" ? (
          <TranslatorPane {...p} />
        ) : p.kind === "accessibility" ? (
          <AccessibilityPane {...p} />
        ) : (
          <ReviewingPane {...p} />
        )}
      </div>
    </aside>
  );
}

/** Follows the document: a number that goes up with each change, for panes that check it again. */
function useChanges(editor: Editor) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setN((x) => x + 1), 300);
    };
    editor.on("update", bump);
    return () => {
      clearTimeout(timer);
      editor.off("update", bump);
    };
  }, [editor]);
  return n;
}

/** Selects a range in the document and shows it. */
const show = (editor: Editor, from: number, to: number) => editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();

// ---- Editor: spelling and grammar ----

function EditorPane({ editor, layout }: PaneProps) {
  const changes = useChanges(editor);
  const [spell, setSpell] = useState<NSpell | null>(null);
  const [failed, setFailed] = useState(false);
  const [ignored, setIgnored] = useState(() => new Set<string>(IGNORED_WORDS));
  const [at, setAt] = useState(0);
  const english = layout.review.language.startsWith("en");
  const checking = layout.review.language !== "";

  useEffect(() => {
    if (!english) return;
    loadSpeller().then(setSpell, () => setFailed(true));
  }, [english]);

  const issues = useMemo(
    () => (checking ? findIssues(editor.state.doc, english ? spell : null, ignored) : []),
    // `changes` stands for the document changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, spell, ignored, changes, checking, english],
  );
  const issue = issues[Math.min(at, issues.length - 1)] as Issue | undefined;
  const suggestions = useMemo(() => (issue?.kind === "spelling" && spell ? spell.suggest(issue.text).slice(0, 6) : (issue?.suggestions ?? [])), [issue, spell]);

  // The issue being looked at is selected in the text.
  useEffect(() => {
    if (issue) show(editor, issue.from, issue.to);
  }, [editor, issue]);

  if (!checking) return <p className="text-slate-500">This document is set not to be checked (Review › Language).</p>;
  if (english && !spell && !failed)
    return (
      <p className="flex items-center gap-2 text-slate-500">
        <Loader2 size={14} className="animate-spin" /> Loading the dictionary…
      </p>
    );

  const spelling = issues.filter((i) => i.kind === "spelling").length;
  const grammar = issues.length - spelling;
  const ignore = (key: string) => {
    // A word (not one issue at a place) is ignored in the right-click menu too.
    if (!key.includes(":")) IGNORED_WORDS.add(key);
    setIgnored(new Set([...ignored, key]));
    // The underlines in the document follow.
    recheckAll(editor);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Count label="Spelling" n={spelling} colour="text-red-600" />
        <Count label="Grammar" n={grammar} colour="text-blue-600" />
      </div>
      {!english && <p className="text-xs text-slate-500">Spelling is checked in English only; grammar rules are for English too.</p>}
      {failed && <p className="text-xs text-red-600">The dictionary couldn&apos;t be loaded, so only grammar is checked.</p>}
      {!issue ? (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-emerald-800">
          <Check size={16} /> No spelling or grammar issues found.
        </p>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className={issue.kind === "spelling" ? "font-semibold text-red-600" : "font-semibold text-blue-600"}>{issue.message}</span>
            <span className="flex items-center gap-1">
              <button type="button" title="Previous" onClick={() => setAt(Math.max(0, at - 1))} className="rounded p-0.5 hover:bg-slate-100">
                <ChevronLeft size={14} />
              </button>
              {Math.min(at, issues.length - 1) + 1} of {issues.length}
              <button type="button" title="Next" onClick={() => setAt(Math.min(issues.length - 1, at + 1))} className="rounded p-0.5 hover:bg-slate-100">
                <ChevronRight size={14} />
              </button>
            </span>
          </div>
          <p className="text-base">
            <span className={issue.kind === "spelling" ? "decoration-red-500 underline decoration-wavy" : "decoration-blue-500 underline decoration-double"}>{issue.text.trim() || "␣"}</span>
          </p>
          <div className="flex flex-col gap-1">
            {suggestions.length ? (
              suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => editor.chain().focus().insertContentAt({ from: issue.from, to: issue.to }, s).run()}
                  className="rounded-md bg-slate-100 px-2 py-1 text-left font-medium hover:bg-blue-100"
                >
                  {s.trim() ? s : "Remove the extra space"}
                </button>
              ))
            ) : (
              <p className="text-xs text-slate-500">No suggestions.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-1 text-xs">
            <Action onClick={() => ignore(`${issue.from}:${issue.text}`)}>Ignore Once</Action>
            {issue.kind === "spelling" && (
              <>
                <Action onClick={() => ignore(issue.text.toLowerCase())}>Ignore All</Action>
                <Action onClick={() => addWord(issue.text).then(() => ignore(issue.text.toLowerCase()))}>Add to Dictionary</Action>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const Count = ({ label, n, colour }: { label: string; n: number; colour: string }) => (
  <div className="rounded-lg border border-slate-200 p-2 text-center">
    <div className={`text-xl font-semibold ${n ? colour : "text-slate-400"}`}>{n}</div>
    <div className="text-xs text-slate-500">{label}</div>
  </div>
);

const Action = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick} className="rounded px-2 py-1 text-blue-700 hover:bg-blue-50">
    {children}
  </button>
);

// ---- Thesaurus ----

/** The selection, or the word the cursor is in. */
function wordAtCursor(editor: Editor): { from: number; to: number; text: string } {
  const { from, to, $from } = editor.state.selection;
  if (from !== to) return { from, to, text: editor.state.doc.textBetween(from, to, " ").trim() };
  const text = $from.parent.textContent;
  let a = $from.parentOffset;
  let b = a;
  while (a > 0 && /[\w'-]/.test(text[a - 1])) a--;
  while (b < text.length && /[\w'-]/.test(text[b])) b++;
  return { from: $from.start() + a, to: $from.start() + b, text: text.slice(a, b) };
}

function ThesaurusPane({ editor }: PaneProps) {
  const [target] = useState(() => wordAtCursor(editor));
  const [word, setWord] = useState(target.text);
  const [result, setResult] = useState<Synonyms | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const search = (w: string) => {
    if (!w.trim()) return;
    setWord(w);
    setBusy(true);
    setError("");
    lookUp(w.trim())
      .then(setResult, () => setError("The thesaurus couldn't be reached. Check the internet connection."))
      .finally(() => setBusy(false));
  };
  useEffect(() => {
    if (target.text) search(target.text);
    // Only when the pane opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const use = (w: string) => target.text && editor.chain().focus().insertContentAt({ from: target.from, to: target.to }, w).run();
  const list = (title: string, words: string[]) =>
    words.length > 0 && (
      <div>
        <h3 className="mb-1 text-xs font-semibold text-slate-500">{title}</h3>
        <ul className="flex flex-col">
          {words.map((w) => (
            <li key={w} className="group flex items-center justify-between rounded px-2 py-1 hover:bg-slate-100">
              <button type="button" onClick={() => search(w)} className="text-left">
                {w}
              </button>
              {target.text && (
                <button type="button" onClick={() => use(w)} className="hidden rounded px-1.5 text-xs text-blue-700 group-hover:block hover:bg-blue-50">
                  Insert
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search(word);
        }}
        className="flex gap-1"
      >
        <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Type a word" className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1" />
        <button type="submit" className="rounded bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-700">
          Search
        </button>
      </form>
      {busy && <Loader2 size={16} className="animate-spin text-slate-400" />}
      {error && <p className="text-red-600">{error}</p>}
      {result && !busy && (
        <>
          {result.meaning && <p className="text-slate-600 italic">{result.meaning}</p>}
          {list("Synonyms", result.synonyms)}
          {list("Antonyms", result.antonyms)}
          {!result.synonyms.length && !result.antonyms.length && <p className="text-slate-500">No results for “{word}”.</p>}
          <p className="text-xs text-slate-400">From Datamuse. Click a word to look it up; Insert puts it in place of “{target.text}”.</p>
        </>
      )}
    </div>
  );
}

// ---- Translator ----

function TranslatorPane({ editor, layout, onGenerated, title, onClose }: PaneProps) {
  const { from, to } = editor.state.selection;
  const [text, setText] = useState(() => editor.state.doc.textBetween(from, to, "\n").trim());
  const [source, setSource] = useState(layout.review.language || "en");
  const [target, setTarget] = useState("fr");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const run = async (job: () => Promise<void>, label: string) => {
    setBusy(label);
    setError("");
    try {
      await job();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };
  // Translate Document: every paragraph in turn, into a new document.
  const whole = () =>
    run(async () => {
      const paragraphs: string[] = [];
      editor.state.doc.descendants((node) => {
        if (node.isTextblock) {
          paragraphs.push(node.textContent);
          return false;
        }
      });
      const out: JSONContent[] = [];
      for (const [i, p] of paragraphs.slice(0, 200).entries()) {
        setBusy(`Translating paragraph ${i + 1} of ${Math.min(paragraphs.length, 200)}…`);
        out.push({ type: "paragraph", content: p.trim() ? [{ type: "text", text: await translate(p, source, target) }] : [] });
      }
      onClose();
      onGenerated({ type: "doc", content: out }, { ...layout }, `${title} (${LANGUAGES.find(([c]) => c === target)?.[1] ?? target})`);
    }, "Translating…");
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Language label="From" value={source} onChange={setSource} />
        <Language label="To" value={target} onChange={setTarget} />
      </div>
      <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Select text in the document, or type here" className="rounded border border-slate-300 px-2 py-1.5" />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!text.trim() || Boolean(busy)}
          onClick={() => run(async () => setResult(await translate(text, source, target)), "Translating…")}
          className="rounded bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          Translate
        </button>
        <button type="button" disabled={Boolean(busy)} onClick={whole} className="rounded px-3 py-1 text-blue-700 hover:bg-blue-50 disabled:opacity-40">
          Translate Document
        </button>
      </div>
      {busy && (
        <p className="flex items-center gap-2 text-slate-500">
          <Loader2 size={14} className="animate-spin" /> {busy}
        </p>
      )}
      {error && <p className="text-red-600">{error}</p>}
      {result && (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2">
          <p className="whitespace-pre-wrap">{result}</p>
          {from !== to && (
            <button type="button" onClick={() => editor.chain().focus().insertContentAt({ from, to }, result).run()} className="self-start rounded px-2 py-1 text-blue-700 hover:bg-blue-50">
              Insert
            </button>
          )}
        </div>
      )}
      <p className="text-xs text-slate-400">Translation by MyMemory: the text is sent to their service. Translate Document makes a new document.</p>
    </div>
  );
}

const Language = (p: { label: string; value: string; onChange: (v: string) => void }) => (
  <label className="flex flex-col gap-0.5">
    {p.label}
    <select value={p.value} onChange={(e) => p.onChange(e.target.value)} className="rounded border border-slate-300 bg-surface px-1.5 py-1 text-sm">
      {LANGUAGES.map(([code, name]) => (
        <option key={code} value={code}>
          {name}
        </option>
      ))}
    </select>
  </label>
);

// ---- Accessibility ----

function AccessibilityPane({ editor, layout }: PaneProps) {
  const changes = useChanges(editor);
  const findings = useMemo(
    () => checkAccessibility(editor.state.doc, layout.design.pageColor ?? "#ffffff"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, changes, layout.design.pageColor],
  );
  const [alt, setAlt] = useState<{ pos: number; text: string } | null>(null);
  const go = (f: Finding) => {
    const node = editor.state.doc.nodeAt(f.pos);
    if (node && !node.isText && !node.isTextblock) editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, f.pos)).scrollIntoView());
    else show(editor, f.pos, f.pos + (node?.nodeSize ?? 1));
  };
  const icon = (level: Finding["level"]) =>
    level === "error" ? <AlertCircle size={15} className="text-red-600" /> : level === "warning" ? <TriangleAlert size={15} className="text-amber-600" /> : <Info size={15} className="text-blue-600" />;
  if (!findings.length)
    return (
      <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-emerald-800">
        <Check size={16} /> No accessibility issues found. People with disabilities should not have difficulty reading this document.
      </p>
    );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-500">
        {findings.filter((f) => f.level === "error").length} errors, {findings.filter((f) => f.level === "warning").length} warnings
      </p>
      {findings.map((f, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-2">
          <button type="button" onClick={() => go(f)} className="flex w-full items-start gap-2 text-left">
            {icon(f.level)}
            <span>
              <span className="block font-medium">{f.title}</span>
              <span className="block text-xs text-slate-500">{f.why}</span>
            </span>
          </button>
          {f.fix === "alt" &&
            (alt?.pos === f.pos ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const node = editor.state.doc.nodeAt(f.pos);
                  if (node) editor.view.dispatch(editor.state.tr.setNodeMarkup(f.pos, undefined, { ...node.attrs, alt: alt.text.trim() }));
                  setAlt(null);
                }}
                className="mt-2 flex gap-1"
              >
                <input autoFocus value={alt.text} onChange={(e) => setAlt({ ...alt, text: e.target.value })} placeholder="Describe the picture" className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs" />
                <button type="submit" className="rounded bg-blue-600 px-2 text-xs text-white">
                  Save
                </button>
              </form>
            ) : (
              <button type="button" onClick={() => setAlt({ pos: f.pos, text: "" })} className="mt-1 rounded px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-50">
                Add a description
              </button>
            ))}
          {f.fix === "headerRow" && (
            <button
              type="button"
              onClick={() => editor.chain().focus().setTextSelection(f.pos + 3).toggleHeaderRow().run()}
              className="mt-1 rounded px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-50"
            >
              Use the first row as the header
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- Reviewing Pane ----

function ReviewingPane({ editor, layout }: PaneProps) {
  useChanges(editor);
  const changes = changesOf(editor.state.doc);
  const comments: Comment[] = layout.review.comments;
  const date = (d: string) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">
        {changes.filter((c) => c.kind === "insertion").length} insertions, {changes.filter((c) => c.kind === "deletion").length} deletions, {comments.length} comments
      </p>
      {changes.map((c, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-2">
          <button type="button" onClick={() => show(editor, c.from, c.to)} className="w-full text-left">
            <span className="block text-xs text-slate-500">
              <b>{c.author || "Author"}</b> {c.kind === "insertion" ? "inserted" : "deleted"} · {date(c.date)}
            </span>
            <span className={c.kind === "insertion" ? "text-blue-700 underline" : "text-red-600 line-through"}>{c.text}</span>
          </button>
          <div className="mt-1 flex gap-1 text-xs">
            <Action onClick={() => settle(editor, [c], true)}>Accept</Action>
            <Action onClick={() => settle(editor, [c], false)}>Reject</Action>
          </div>
        </div>
      ))}
      {comments.map((c) => (
        <div key={c.id} className={`rounded-lg border border-slate-200 p-2 ${c.done ? "opacity-60" : ""}`}>
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <MessageSquare size={12} /> <b>{c.author}</b> · {date(c.date)}
          </span>
          <p className="whitespace-pre-wrap">{c.text || <i className="text-slate-400">(empty)</i>}</p>
          {c.replies.map((r, i) => (
            <p key={i} className="mt-1 border-l-2 border-slate-200 pl-2 text-xs">
              <b>{r.author}</b>: {r.text}
            </p>
          ))}
        </div>
      ))}
      {!changes.length && !comments.length && <p className="text-slate-500">There are no changes or comments.</p>}
    </div>
  );
}
