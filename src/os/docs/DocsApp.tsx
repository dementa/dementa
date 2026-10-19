"use client";

import CharacterCount from "@tiptap/extension-character-count";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Loader2, Redo2, Save, Undo2, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cloud, CloudError, parentPath } from "../cloud";
import { Backstage } from "./Backstage";
import { FileDialog } from "./FileDialog";
import { FindPanel } from "./FindPanel";
import { FontSize, ParagraphFormat, SearchHighlight, StyledBulletList, StyledOrderedList, StyledUnderline } from "./extensions";
import { Bookmark, ChartImage, CoverPage, PageBreak } from "./insertNodes";
import { DEFAULT_LAYOUT, layoutText, MARGINS, PAGE_SIZES, pageBox, parseLayout, type PageLayout } from "./layout";
import { RIBBON_BLUE, Ribbon } from "./Ribbon";

/** Ask Docs to open a document. Change `nonce` to ask again. */
export interface DocsRequest {
  path: string;
  nonce: number;
}

const DRAFT_KEY = "dementa-os:docs-draft";
const UNTITLED = "Untitled document";
const ZOOMS = [75, 100, 125, 150, 200];

/** The document being worked on, kept on this computer so closing the window doesn't lose it. */
interface Draft {
  html: string;
  /** Where it's saved in the cloud; null until the first save. */
  path: string | null;
  title: string;
  dirty: boolean;
  layout: PageLayout;
}

function loadDraft(): Draft | null {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    return saved && typeof saved.html === "string" ? { ...saved, layout: parseLayout(saved.layout && layoutText(saved.layout)) } : null;
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage can be blocked or full; the cloud copy is still there.
  }
}

/** "Documents/My story.docx" → "My story". */
const titleOf = (path: string) => path.slice(path.lastIndexOf("/") + 1).replace(/\.(docx|html?|txt)$/i, "");

const isWordFile = (path: string) => /\.docx$/i.test(path);

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Plain text → one paragraph per line. */
const textToHtml = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

/**
 * A saved document → what's inside <body>, plus its page layout. The editor drops anything it
 * doesn't understand (scripts included).
 */
function parsePage(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return { body: doc.body.innerHTML, layout: parseLayout(doc.querySelector('meta[name="dementa-layout"]')?.getAttribute("content")) };
}

/** A complete page, so the saved file also opens (and prints) nicely in a web browser or Word. */
const toPage = (title: string, body: string, layout: PageLayout) => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="generator" content="Dementa Docs">
<meta name="dementa-layout" content="${layoutText(layout)}">
<title>${escapeHtml(title)}</title>
<style>
@page{size:${PAGE_SIZES[layout.size].css} ${layout.orientation};margin:${MARGINS[layout.margins].css}}
body{max-width:${pageBox(layout).w - 2 * MARGINS[layout.margins].px}px;margin:40px auto;padding:0 24px;font-family:system-ui,sans-serif;font-size:16px;line-height:1.6}
@media print{body{max-width:none;margin:0;padding:0}}
blockquote{border-left:4px solid #cbd5e1;margin-left:0;padding-left:1em;color:#475569}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5e1;padding:4px 8px;vertical-align:top}th{background:#f1f5f9;text-align:left}
img{max-width:100%;height:auto}mark{background:#fde047}
</style>
</head>
<body>
${body}
</body>
</html>
`;

const errorText = (err: unknown) => (err instanceof CloudError ? err.message : err instanceof Error ? err.message : String(err));

export function DocsApp({ request }: { request?: DocsRequest | null }) {
  const [initial] = useState(loadDraft);
  const [path, setPath] = useState<string | null>(initial?.path ?? null);
  const [title, setTitle] = useState(initial?.title ?? UNTITLED);
  const [dirty, setDirty] = useState(initial?.dirty ?? false);
  const [layout, setLayout] = useState<PageLayout>(initial?.layout ?? DEFAULT_LAYOUT);
  const [dialog, setDialog] = useState<"open" | "save" | null>(null);
  /** Something waiting on "Save changes first?". */
  const [ask, setAsk] = useState<{ then: () => void } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [zoom, setZoom] = useState(100);
  /** The File screen (New, Open, Save…). */
  const [backstage, setBackstage] = useState(false);
  const [find, setFind] = useState<{ mode: "find" | "replace"; nonce: number } | null>(null);
  // A new nonce each time, so asking again moves the cursor back to the search box.
  const openFind = (mode: "find" | "replace") => setFind({ mode, nonce: Date.now() });
  const closeFind = useCallback(() => setFind(null), []);
  /** Runs once the current save finishes (e.g. "New" after "Save changes first"). */
  const afterSave = useRef<(() => void) | null>(null);

  const editor = useEditor({
    extensions: [
      // Lists come from extensions.ts instead, so they can have bullet and number styles.
      StarterKit.configure({ bulletList: false, orderedList: false }),
      StyledBulletList,
      StyledOrderedList,
      StyledUnderline,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Start typing your document…" }),
      CharacterCount,
      TextStyle,
      Color,
      // Links don't open while editing, so a click just puts the cursor there.
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } }),
      // Pictures, including charts that remember their data.
      ChartImage.configure({ allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      FontFamily,
      FontSize,
      Subscript,
      Superscript,
      ParagraphFormat,
      SearchHighlight,
      PageBreak,
      CoverPage,
      Bookmark,
    ],
    content: initial?.html ?? "",
    immediatelyRender: false,
    editorProps: { attributes: { class: "select-text", spellcheck: "true" } },
    onUpdate: () => setDirty(true),
  });

  // Keep the draft up to date (after a short pause, not on every key press).
  useEffect(() => {
    if (!editor) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const write = () => {
      try {
        saveDraft({ html: editor.getHTML(), path, title, dirty, layout });
      } catch {
        // The editor is already gone (window closed); the last write stands.
      }
    };
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(write, 400);
    };
    later();
    editor.on("update", later);
    return () => {
      editor.off("update", later);
      // Closing the window shouldn't lose the last few key presses.
      if (timer) {
        clearTimeout(timer);
        write();
      }
    };
  }, [editor, path, title, dirty, layout]);

  useEffect(() => {
    if (!status || status.error) return;
    const id = setTimeout(() => setStatus(null), 2500);
    return () => clearTimeout(id);
  }, [status]);

  /** Runs `action` now, or after asking about unsaved changes. */
  const guard = useCallback((action: () => void) => (dirty ? setAsk({ then: action }) : action()), [dirty]);

  const startNew = useCallback(() => {
    editor?.commands.setContent("", false);
    editor?.commands.focus();
    setPath(null);
    setTitle(UNTITLED);
    setDirty(false);
    setLayout(DEFAULT_LAYOUT);
  }, [editor]);

  /** Opens a document from Dementa Cloud (a path) or from this computer (a file). */
  const load = useCallback(
    async (source: string | File) => {
      if (!editor) return;
      const fromComputer = typeof source !== "string";
      const name = fromComputer ? source.name : source;
      setBusy("Opening…");
      try {
        let data: Blob = source as File;
        if (!fromComputer) {
          const response = await fetch(cloud.fileUrl(source));
          if (!response.ok) throw new Error("Couldn't open this document. It may have been moved or deleted.");
          data = await response.blob();
        }
        const isText = /\.txt$/i.test(name);
        let page: { body: string; layout: PageLayout };
        let fromWord = false;
        if (isWordFile(name)) {
          const { readWordFile } = await import("./wordFile");
          const word = await readWordFile(await data.arrayBuffer());
          fromWord = "body" in word;
          page = "page" in word ? parsePage(word.page) : { body: word.body, layout: DEFAULT_LAYOUT };
        } else {
          const text = await data.text();
          page = isText ? { body: textToHtml(text), layout: DEFAULT_LAYOUT } : parsePage(text);
        }
        editor.commands.setContent(page.body, false);
        setLayout(page.layout);
        // Files from this computer, and text files, are saved as new Word documents in Dementa Cloud.
        setPath(fromComputer || isText ? null : source);
        setTitle(titleOf(name));
        setDirty(false);
        setStatus(fromWord ? { text: "Opened a Word document made elsewhere: some formatting may look different." } : null);
      } catch (err) {
        setStatus({ text: errorText(err), error: true });
      } finally {
        setBusy(null);
      }
    },
    [editor],
  );

  async function writeTo(target: string) {
    if (!editor) return;
    const name = titleOf(target);
    setBusy("Saving…");
    try {
      const fileName = target.slice(target.lastIndexOf("/") + 1);
      const body = editor.getHTML();
      const page = toPage(name, body, layout);
      let file: File;
      if (isWordFile(target)) {
        const { toWordFile, WORD_TYPE } = await import("./wordFile");
        file = new File([await toWordFile(name, body, page, layout)], fileName, { type: WORD_TYPE });
      } else file = new File([page], fileName, { type: "text/html" });
      await cloud.upload(file, parentPath(target));
      setPath(target);
      setTitle(name);
      setDirty(false);
      setStatus({ text: "Saved to Dementa Cloud" });
      const next = afterSave.current;
      afterSave.current = null;
      next?.();
    } catch (err) {
      afterSave.current = null;
      setStatus({ text: errorText(err), error: true });
    } finally {
      setBusy(null);
    }
  }

  const save = () => (path ? writeTo(path) : setDialog("save"));

  // Documents opened from the Files app.
  const handled = useRef<number | null>(null);
  useEffect(() => {
    if (!request || !editor || handled.current === request.nonce) return;
    handled.current = request.nonce;
    guard(() => load(request.path));
  }, [request, editor, guard, load]);

  function onKeyDown(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === "s") {
      e.preventDefault();
      if (e.shiftKey) setDialog("save");
      else save();
    } else if (key === "o") {
      e.preventDefault();
      guard(() => setDialog("open"));
    } else if (key === "f" || key === "h") {
      e.preventDefault();
      openFind(key === "f" ? "find" : "replace");
    }
  }

  const page = pageBox(layout);
  const margin = MARGINS[layout.margins].px;
  const words = editor?.storage.characterCount.words() ?? 0;
  const characters = editor?.storage.characterCount.characters() ?? 0;

  return (
    <div className="relative flex h-full flex-col bg-slate-100 text-slate-800" onKeyDown={onKeyDown}>
      {/* Quick access and the document's name, on Word's blue bar */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 text-white" style={{ background: RIBBON_BLUE }}>
        <QuickButton icon={Save} label="Save (Ctrl+S)" onClick={save} disabled={!!busy} />
        <QuickButton icon={Undo2} label="Undo (Ctrl+Z)" onClick={() => editor?.chain().focus().undo().run()} disabled={!editor?.can().undo()} />
        <QuickButton icon={Redo2} label="Redo (Ctrl+Y)" onClick={() => editor?.chain().focus().redo().run()} disabled={!editor?.can().redo()} />
        <span className="min-w-0 flex-1 truncate px-3 text-center text-[13px]">
          {title}
          <span className="text-white/70">{dirty ? " • not saved" : path ? " • saved" : ""}</span>
        </span>
        {busy ? (
          <span className="flex shrink-0 items-center gap-1.5 pr-1 text-[13px] text-white/90">
            <Loader2 size={14} className="animate-spin" /> {busy}
          </span>
        ) : (
          status && (
            <span className={`max-w-[45%] shrink-0 truncate rounded px-2 text-[13px] ${status.error ? "bg-red-100 text-red-700" : "text-white"}`} title={status.text}>
              {status.text}
            </span>
          )
        )}
      </div>

      {editor && (
        <Ribbon
          editor={editor}
          layout={layout}
          onLayout={(patch) => {
            setLayout((l) => ({ ...l, ...patch }));
            setDirty(true);
          }}
          onError={(text) => setStatus({ text, error: true })}
          onFile={() => setBackstage(true)}
          onFind={openFind}
        />
      )}

      {/* The page */}
      <div className="relative min-h-0 flex-1">
        <div className="docs-page h-full overflow-auto" onMouseDown={(e) => e.target === e.currentTarget && editor?.commands.focus("end")}>
          <div
            className="mx-auto my-6 max-w-[calc(100%-2rem)] cursor-text bg-surface text-slate-900 shadow-md ring-1 ring-black/5"
            // Margins shrink on narrow windows so there's always room to write.
            style={{ zoom: zoom / 100, width: page.w, minHeight: page.h, padding: `min(${margin}px, 8%)` }}
            onMouseDown={(e) => e.target === e.currentTarget && editor?.commands.focus("end")}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
        {editor && find && (
          <FindPanel editor={editor} mode={find.mode} focusKey={find.nonce} onMode={(mode) => setFind({ ...find, mode })} onClose={closeFind} />
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 border-t border-slate-200 bg-surface px-3 py-1 text-xs text-slate-600">
        <span>
          {words} {words === 1 ? "word" : "words"}
        </span>
        <span>
          {characters} {characters === 1 ? "character" : "characters"}
        </span>
        <label className="ml-auto flex items-center gap-1.5">
          Zoom
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="rounded border border-slate-300 bg-surface px-1 py-0.5">
            {ZOOMS.map((z) => (
              <option key={z} value={z}>
                {z}%
              </option>
            ))}
          </select>
        </label>
      </div>

      {backstage && (
        <Backstage
          title={title}
          path={path}
          dirty={dirty}
          words={words}
          characters={characters}
          layout={layout}
          onClose={() => setBackstage(false)}
          onNew={() => (setBackstage(false), guard(startNew))}
          onOpen={() => (setBackstage(false), guard(() => setDialog("open")))}
          onSave={() => (setBackstage(false), save())}
          onSaveAs={() => (setBackstage(false), setDialog("save"))}
        />
      )}

      {dialog && (
        <FileDialog
          mode={dialog}
          folder={path ? parentPath(path) : "Documents"}
          name={title === UNTITLED ? "" : title}
          onCancel={() => {
            afterSave.current = null;
            setDialog(null);
          }}
          onPick={(target) => {
            setDialog(null);
            if (dialog === "open") load(target);
            else writeTo(target);
          }}
          onComputerFile={(file) => {
            setDialog(null);
            load(file);
          }}
        />
      )}

      {ask && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
          <div role="alertdialog" aria-label="Save changes?" className="menu-pop w-[min(420px,100%)] rounded-xl bg-surface p-5 shadow-2xl ring-1 ring-black/10">
            <h2 className="text-lg font-semibold">Save changes to “{title}”?</h2>
            <p className="mt-1 text-sm text-slate-600">If you don&apos;t save, your changes will be lost.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setAsk(null)} className="rounded-lg px-4 py-1.5 text-sm hover:bg-slate-100">
                Cancel
              </button>
              <button
                onClick={() => {
                  setAsk(null);
                  ask.then();
                }}
                className="rounded-lg px-4 py-1.5 text-sm hover:bg-slate-100"
              >
                Don&apos;t save
              </button>
              <button
                autoFocus
                onClick={() => {
                  afterSave.current = ask.then;
                  setAsk(null);
                  save();
                }}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Save, Undo and Redo on the blue bar. */
function QuickButton(p: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={p.label}
      aria-label={p.label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={p.onClick}
      disabled={p.disabled}
      className="rounded p-1 hover:bg-white/15 disabled:opacity-40"
    >
      <p.icon size={16} />
    </button>
  );
}
