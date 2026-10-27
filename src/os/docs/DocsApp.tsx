"use client";

import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import { Loader2, Redo2, Save, Undo2, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cloud, CloudError, parentPath } from "../cloud";
import { ContextMenu, menuAt, type MenuEntry, type OpenMenu } from "../ContextMenu";
import { Backstage } from "./Backstage";
import { FileDialog } from "./FileDialog";
import { FindPanel } from "./FindPanel";
import { defaultDesign, designCss, effectFilter, paletteOf, setThemeSwatches, type DocDesign } from "./design";
import { editorExtensions } from "./editorSetup";
import { HeaderFooterEditor, hfKey, PageHeaders, type HfTarget, type Part } from "./headerFooter";
import { DEFAULT_LAYOUT, layoutText, pageBox, parseLayout, textWidth, type PageLayout } from "./layout";
import { LineNumbers } from "./LineNumbers";
import { Endnotes, newNoteId, NotePanel, notesOf, NotesMeasure, PageFootnotes } from "./notes";
import { PAGE_GAP, Pagination, remeasure, setPageSetup, type NotePlaces } from "./pagination";
import { REFRESH, ReferenceRefresh, setReferences } from "./refresh";
import { MergePreview, setMergeData, setPreview } from "./mergeNodes";
import { currentAccount } from "../account";
import { CommentsColumn } from "./review/CommentsColumn";
import { markComment } from "./review/comments";
import { TaskPane, type PaneKind } from "./review/Panes";
import { ReadAloud } from "./review/ReadAloud";
import { RestrictEditing, setLock, setTracking, TrackChanges, UNTRACKED } from "./review/track";
import type { Markup } from "./ribbon/ReviewTab";
import type { ViewControls, ViewMode } from "./ribbon/ViewTab";
import { demote, move, Outline, promote, setOutline } from "./view/outline";
import { Ruler } from "./view/Ruler";
import { TableHandles } from "./table/TableHandles";
import { tableMenu } from "./table/tableMenu";
import { inSelection } from "./table/tableTools";
import { AltTextForm, FloatingPanel, MiniToolbar, textMenu, wordAt } from "./textMenu";
import { changeItems, commentItems, fieldItems, headerFooterMenu, pictureMenu, type ItemPanel } from "./itemMenus";
import { selectedPictures } from "./multiSelect";
import { commentsAt, unmarkComment } from "./review/comments";
import { ChartForm, selectedChart } from "./ribbon/ChartForm";
import { CaptionForm } from "./ribbon/ReferencesTab";
import { issueAt, setProofing } from "./review/proofing";
import { LinkForm } from "./ribbon/insertPanels";
import { COLUMN_WIDTHS, LineFocus, NavigationPane, ReadModeBar, type ColumnWidth, type PageTint } from "./view/ViewParts";
import { RIBBON_BLUE, Ribbon } from "./Ribbon";

/** Ask Docs to open a document. Change `nonce` to ask again. */
export interface DocsRequest {
  path: string;
  nonce: number;
}

const DRAFT_KEY = "dementa-os:docs-draft";
const UNTITLED = "Untitled document";
const ZOOMS = [50, 75, 100, 125, 150, 200, 300];

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
    return saved && typeof saved.html === "string" ? { ...saved, layout: parseLayout(saved.layout) } : null;
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

/** The text's columns and hyphenation, as CSS (on the page in Docs, and in saved pages). */
export function textFlow(layout: PageLayout): Record<string, string> {
  return {
    ...(layout.columns > 1 && {
      columnCount: String(layout.columns),
      columnGap: `${layout.columnGap}px`,
      columnRule: layout.columnLine ? "1px solid #94a3b8" : "none",
    }),
    ...(layout.hyphenate && { hyphens: "auto" }),
  };
}

const cssText = (style: Record<string, string>) =>
  Object.entries(style)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${v}`)
    .join(";");

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

/** A complete page, so the saved file also opens (and prints) nicely in a web browser or Word. */
const toPage = (title: string, body: string, layout: PageLayout) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="generator" content="Dementa Docs">
<meta name="dementa-layout" content="${layoutText(layout).replace(/"/g, "&quot;")}">
<title>${escapeHtml(title)}</title>
<style>
@page{size:${px(pageBox(layout).w)} ${px(pageBox(layout).h)};margin:${[layout.margins.top, layout.margins.right, layout.margins.bottom, layout.margins.left].map(px).join(" ")}}
body{max-width:${px(textWidth(layout))};margin:40px auto;padding:0 24px;font-family:system-ui,sans-serif;font-size:16px;line-height:1.6;${cssText(textFlow(layout))}}
@media print{body{max-width:none;margin:0;padding:0}}
blockquote{border-left:4px solid #cbd5e1;margin-left:0;padding-left:1em;color:#475569}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5e1;padding:4px 8px;vertical-align:top}th{background:#f1f5f9;text-align:left}
img{max-width:100%;height:auto}mark{background:#fde047}
${designCss(layout.design, "body")}${layout.design.pageColor ? `\nhtml{background:${layout.design.pageColor}}` : ""}
</style>
</head>
<body>
${body}
</body>
</html>
`;

const errorText = (err: unknown) => (err instanceof CloudError ? err.message : err instanceof Error ? err.message : String(err));

const VIEW_KEY = "dementa-os:docs-view";

/** The View tab's Show choices and dark page, as last left. */
function readShown(): { ruler: boolean; gridlines: boolean; nav: boolean; dark: boolean } {
  const fallback = { ruler: false, gridlines: false, nav: false, dark: false };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(VIEW_KEY) ?? "{}") };
  } catch {
    return fallback;
  }
}

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
  const [zoom, setZoomNow] = useState(100);
  /** The point (in the scrolling box) that stays put while zooming: the middle, or the mouse. */
  const zoomAnchor = useRef<{ x: number; y: number; from: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  /** How many pages the document fills, and which one the cursor is on. */
  const [pages, setPages] = useState(1);
  const [atPage, setAtPage] = useState(1);
  /** Where footnotes and endnotes go (pagination.ts), and the note being typed. */
  const [notePlaces, setNotePlaces] = useState<NotePlaces | null>(null);
  const [noteEdit, setNoteEdit] = useState<string | null>(null);
  /** The right-click menu (text's or a table's), Word's formatting bar above it, and the Link box. */
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [miniBar, setMiniBar] = useState<{ x: number; y: number } | null>(null);
  const [panel, setPanel] = useState<{ kind: ItemPanel; x: number; y: number } | null>(null);
  /** Review: the pane beside the page, how changes and comments show, and Read Aloud. */
  const [pane, setPane] = useState<PaneKind | null>(null);
  const [markup, setMarkup] = useState<Markup>("simple");
  const [showComments, setShowComments] = useState(true);
  const [showChanges, setShowChanges] = useState(true);
  const [readAloud, setReadAloud] = useState(false);
  const [freshComment, setFreshComment] = useState<string | null>(null);
  const [author, setAuthor] = useState("Author");
  /** View tab: the view, Focus, Immersive Reader, and what's shown (remembered for next time). */
  const [viewMode, setViewMode] = useState<ViewMode>("print");
  const [focusMode, setFocusMode] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [shown, setShown] = useState(readShown);
  const [column, setColumn] = useState<ColumnWidth>("moderate");
  const [tint, setTint] = useState<PageTint>("none");
  const [lineFocus, setLineFocus] = useState(0);
  const [spacing, setSpacing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  /** Zooms (10% to 500%), keeping the same part of the page under `at` (the middle of the view). */
  const setZoom = useCallback((z: number, at?: { x: number; y: number }) => {
    const box = scrollRef.current;
    setZoomNow((from) => {
      const to = Math.max(10, Math.min(500, Math.round(z)));
      // Several zooms before the page is drawn again keep the first one's starting point.
      if (box && to !== from && !zoomAnchor.current) zoomAnchor.current = { ...(at ?? { x: box.clientWidth / 2, y: box.clientHeight / 2 }), from };
      return to;
    });
  }, []);

  // After zooming, scroll so the anchor point shows the same place on the page as before.
  useLayoutEffect(() => {
    const box = scrollRef.current;
    const anchor = zoomAnchor.current;
    zoomAnchor.current = null;
    if (!box || !anchor) return;
    const k = zoom / anchor.from;
    box.scrollLeft = (box.scrollLeft + anchor.x) * k - anchor.x;
    box.scrollTop = (box.scrollTop + anchor.y) * k - anchor.y;
  }, [zoom]);

  // Ctrl (or Cmd) and the mouse wheel zoom, as in Word; so does pinching a trackpad.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    let step = 0;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // A trackpad sends many small steps: zoom once they add up to a notch.
      step += e.deltaY;
      if (Math.abs(step) < 40) return;
      const by = step < 0 ? 10 : -10;
      step = 0;
      const r = box.getBoundingClientRect();
      // Counted from the last notch's zoom, even when it hasn't been drawn yet.
      const to = Math.max(10, Math.min(500, Math.round((zoomRef.current + by) / 10) * 10));
      zoomRef.current = to;
      setZoom(to, { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    box.addEventListener("wheel", wheel, { passive: false });
    return () => box.removeEventListener("wheel", wheel);
  }, [setZoom]);
  const notesRef = useRef<HTMLDivElement>(null);
  /** The header or footer being edited, and its editor, which the ribbon then works on. */
  const [hfEdit, setHfEdit] = useState<HfTarget | null>(null);
  const [hfEditor, setHfEditor] = useState<Editor | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  /** The File screen (New, Open, Save…). */
  const [backstage, setBackstage] = useState(false);
  const [find, setFind] = useState<{ mode: "find" | "replace"; nonce: number } | null>(null);
  // A new nonce each time, so asking again moves the cursor back to the search box.
  const openFind = (mode: "find" | "replace") => setFind({ mode, nonce: Date.now() });
  const closeFind = useCallback(() => setFind(null), []);
  /** Runs once the current save finishes (e.g. "New" after "Save changes first"). */
  const afterSave = useRef<(() => void) | null>(null);

  const editor = useEditor({
    extensions: [...editorExtensions("Start typing your document…"), Pagination, ReferenceRefresh, MergePreview, TrackChanges, RestrictEditing, Outline],
    content: initial?.html ?? "",
    immediatelyRender: false,
    editorProps: { attributes: { class: "select-text", spellcheck: "true" } },
    // Numbers and tables brought up to date (refresh.ts) aren't edits.
    onUpdate: ({ transaction }) => !transaction.getMeta(REFRESH) && setDirty(true),
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

  // Where the text sits across the page, for the headers and footers to line up with it.
  const [textBox, setTextBox] = useState({ left: layout.margins.left, width: textWidth(layout) });
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const observer = new ResizeObserver(() => setTextBox({ left: dom.offsetLeft, width: dom.offsetWidth }));
    observer.observe(dom);
    return () => observer.disconnect();
  }, [editor]);

  // The ribbon follows what's typed in a header or footer too.
  const [, redraw] = useState(0);
  useEffect(() => {
    if (!hfEditor) return;
    const update = () => redraw((n) => n + 1);
    hfEditor.on("transaction", update);
    return () => {
      hfEditor.off("transaction", update);
    };
  }, [hfEditor]);

  const editHf = useCallback((part: Part, pageIndex: number) => setHfEdit({ part, page: pageIndex, first: false }), []);
  // Whether it's the first page's own header follows Different First Page, which can change while editing.
  const hfTarget = hfEdit && { ...hfEdit, first: layout.headers.differentFirst && hfEdit.page === 0 };

  // Comments and tracked changes are signed with the account's name.
  useEffect(() => {
    currentAccount().then((a) => a?.name && setAuthor(a.name), () => undefined);
  }, []);

  // Track Changes, Restrict Editing, the proofing language and how changes show.
  const review = layout.review;
  const readOnly = review.protection === "readonly" || review.protection === "comments";
  useEffect(() => {
    if (!editor) return;
    setTracking(editor, { on: review.tracking || review.protection === "tracked", locked: review.protection === "tracked", author });
    setLock(editor, review.protection);
  }, [editor, review.tracking, review.protection, author]);
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    dom.setAttribute("lang", review.language || "en");
    dom.setAttribute("spellcheck", review.language ? "true" : "false");
    for (const m of ["simple", "all", "none", "original"]) dom.classList.toggle(`markup-${m}`, (showChanges ? markup : "none") === m);
  }, [editor, review.language, markup, showChanges]);

  const newComment = () => {
    if (!editor || review.protection === "readonly") return;
    const id = markComment(editor);
    if (!id) return setStatus({ text: "Select some text (or put the cursor in a word) to comment on it.", error: true });
    setLayout((l) => ({ ...l, review: { ...l.review, comments: [...l.review.comments, { id, author, date: new Date().toISOString(), text: "", replies: [], done: false }] } }));
    setShowComments(true);
    setFreshComment(id);
    setDirty(true);
  };

  // Outline view's outline, and Read Mode reading only.
  useEffect(() => {
    if (editor) setOutline(editor, { on: viewMode === "outline" });
  }, [editor, viewMode]);
  useEffect(() => {
    if (editor) editor.setEditable(!readOnly && viewMode !== "read");
  }, [editor, readOnly, viewMode]);
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(shown));
    } catch {
      // Storage can be blocked; the choices last until Docs closes.
    }
  }, [shown]);

  // Esc leaves Focus and Read Mode, wherever the keyboard is (Read Mode's page can't take it).
  useEffect(() => {
    if (!focusMode && viewMode !== "read") return;
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setFocusMode(false);
      setViewMode((m) => (m === "read" ? "print" : m));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [focusMode, viewMode]);

  /** Zooms so a whole page shows, or the page (or its text) fills the window's width. */
  const fit = (how: "page" | "width" | "text") => {
    const box = scrollRef.current;
    if (!box) return;
    const width = how === "text" ? textWidth(layout) : pageBox(layout).w;
    // Not counting the room kept for comments on the right.
    const css = getComputedStyle(box);
    const room = box.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    const z = how === "page" ? Math.min((box.clientHeight - 48) / pageBox(layout).h, (room - 32) / pageBox(layout).w) * 100 : ((room - 48) / width) * 100;
    setZoom(Math.floor(z));
  };

  const closeMenu = useCallback(() => setMenu(null), []);
  const closeMiniBar = useCallback(() => setMiniBar(null), []);
  const closePanel = useCallback(() => setPanel(null), []);

  // Spelling and grammar are checked as you type in English documents (Review › Language).
  const proofLanguage = layout.review.language;
  useEffect(() => {
    if (editor && !editor.isDestroyed) setProofing(editor, proofLanguage.startsWith("en"));
  }, [editor, proofLanguage]);

  const viewControls: ViewControls = {
    mode: viewMode,
    onMode: (m) => {
      setViewMode(m);
      if (m !== "print") setImmersive(false);
    },
    focus: focusMode,
    onFocus: setFocusMode,
    immersive,
    onImmersive: setImmersive,
    ruler: shown.ruler,
    onRuler: (ruler) => setShown((v) => ({ ...v, ruler })),
    gridlines: shown.gridlines,
    onGridlines: (gridlines) => setShown((v) => ({ ...v, gridlines })),
    nav: shown.nav,
    onNav: (nav) => setShown((v) => ({ ...v, nav })),
    dark: shown.dark,
    onDark: (dark) => setShown((v) => ({ ...v, dark })),
    zoom,
    onZoom: setZoom,
    onFit: fit,
    column,
    onColumn: setColumn,
    tint,
    onTint: setTint,
    lineFocus,
    onLineFocus: setLineFocus,
    spacing,
    onSpacing: setSpacing,
    readAloud,
    onReadAloud: setReadAloud,
  };

  /** Scrolls to the top of a page (Navigation Pane › Pages). */
  const goToPage = (index: number) => {
    const box = scrollRef.current;
    const sheet = sheetRef.current;
    if (box && sheet) box.scrollTo({ top: sheet.offsetTop + index * (pageBox(layout).h + PAGE_GAP) * (zoom / 100) - 16, behavior: "smooth" });
  };

  // Merge fields preview from the document's recipient list.
  useEffect(() => {
    if (editor) setMergeData(editor.view, layout.mailMerge);
  }, [editor, layout.mailMerge]);


  // Citations and the bibliography follow the document's sources and style.
  useEffect(() => {
    if (editor) setReferences(editor.view, layout.references);
  }, [editor, layout.references]);

  // Clicking a note's mark opens it; clicking a line of a table of contents goes to that heading.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const click = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const mark = target.closest<HTMLElement>("sup[data-note]");
      if (mark) return setNoteEdit(mark.getAttribute("data-id"));
      const entry = target.closest<HTMLElement>(".docs-toc-entry");
      const pos = Number(entry?.getAttribute("data-target"));
      if (entry && Number.isFinite(pos) && pos < editor.state.doc.content.size) editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run();
    };
    dom.addEventListener("click", click);
    return () => dom.removeEventListener("click", click);
  }, [editor]);

  // A note's text growing or shrinking moves the page breaks.
  useEffect(() => {
    const el = notesRef.current;
    if (!editor || !el) return;
    const observer = new ResizeObserver(() => remeasure(editor.view));
    observer.observe(el);
    return () => observer.disconnect();
  }, [editor]);

  // The colour menus' theme colours are the document's, as in Word.
  setThemeSwatches(paletteOf(layout.design));

  // Real pages in Print Layout, except while the text is in columns (they're balanced on one long
  // page instead). Web Layout, Read Mode, Outline and Immersive Reader flow across the window; Draft
  // is one long sheet.
  const reading = viewMode === "read";
  const flowing = viewMode === "web" || viewMode === "outline" || reading || immersive;
  const paged = layout.columns === 1 && viewMode === "print" && !immersive;
  const tinted = (reading || immersive) && tint !== "none";
  const columnWidth = reading || immersive ? COLUMN_WIDTHS[column] : null;
  const pageHeight = pageBox(layout).h;
  useEffect(() => {
    if (editor) setPageSetup(editor.view, { height: pageHeight, marginBottom: layout.margins.bottom, enabled: paged, onPages: setPages, onNotes: setNotePlaces });
    // The top margin is read from the page, but changing it must measure again too.
  }, [editor, pageHeight, layout.margins.top, layout.margins.bottom, paged]);

  // "Page 2 of 5" follows the cursor.
  useEffect(() => {
    if (!editor) return;
    const follow = () => {
      const sheet = editor.view.dom.closest<HTMLElement>(".docs-sheet");
      if (!sheet || !paged) return setAtPage(1);
      const origin = sheet.getBoundingClientRect();
      const y = (editor.view.coordsAtPos(editor.state.selection.head).top - origin.top) / (origin.width / sheet.offsetWidth || 1);
      setAtPage(Math.min(pages, Math.max(1, Math.floor(y / (pageHeight + PAGE_GAP)) + 1)));
    };
    follow();
    editor.on("selectionUpdate", follow);
    editor.on("update", follow);
    return () => {
      editor.off("selectionUpdate", follow);
      editor.off("update", follow);
    };
  }, [editor, paged, pages, pageHeight]);

  useEffect(() => {
    if (!status || status.error) return;
    const id = setTimeout(() => setStatus(null), 2500);
    return () => clearTimeout(id);
  }, [status]);

  /** Runs `action` now, or after asking about unsaved changes. */
  const guard = useCallback((action: () => void) => (dirty ? setAsk({ then: action }) : action()), [dirty]);

  const startNew = useCallback(() => {
    editor?.chain().setMeta(UNTRACKED, true).setContent("", false).run();
    editor?.commands.focus();
    setPath(null);
    setTitle(UNTITLED);
    setDirty(false);
    // New documents start with the look set as the default (Design › Set as Default).
    setLayout({ ...DEFAULT_LAYOUT, design: defaultDesign() });
    setHfEdit(null);
  }, [editor]);

  /** A new document made by the Mailings tab (merged letters, envelopes, labels), after asking to save this one. */
  const openGenerated = useCallback(
    (content: JSONContent, patch: Partial<PageLayout>, name: string) =>
      guard(() => {
        editor?.chain().setMeta(UNTRACKED, true).setContent(content, false).run();
        setPath(null);
        setTitle(name);
        setDirty(true);
        setLayout((l) => ({ ...DEFAULT_LAYOUT, design: l.design, ...patch }));
        setHfEdit(null);
        if (editor) setPreview(editor.view, { on: false, at: 0 });
      }),
    [editor, guard],
  );

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
          page = "page" in word ? parsePage(word.page) : word;
        } else {
          const text = await data.text();
          page = isText ? { body: textToHtml(text), layout: DEFAULT_LAYOUT } : parsePage(text);
        }
        // Opening a document isn't an edit, even with Track Changes on.
        editor.chain().setMeta(UNTRACKED, true).setContent(page.body, false).run();
        setLayout(page.layout);
        setHfEdit(null);
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
    // Outline view: Alt+Shift+arrows promote, demote and move, as in Word.
    if (viewMode === "outline" && editor && e.altKey && e.shiftKey && e.key.startsWith("Arrow")) {
      e.preventDefault();
      if (e.key === "ArrowLeft") promote(editor);
      else if (e.key === "ArrowRight") demote(editor);
      else move(editor, e.key === "ArrowUp");
      return;
    }
    // Word's keys: F1 help, F7 spelling, Shift+F7 thesaurus, Ctrl+Alt+M comment, Ctrl+Shift+E track changes.
    if (e.key === "F1") {
      e.preventDefault();
      setPane("help");
      return;
    }
    if (e.key === "F7") {
      e.preventDefault();
      setPane(e.shiftKey ? "thesaurus" : "editor");
      return;
    }
    // By the key itself: on a Mac, Option changes the letter a key types.
    // Ctrl+K: Insert Link, as in Word.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === "KeyK" && editor?.isEditable) {
      e.preventDefault();
      const at = editor.view.coordsAtPos(editor.state.selection.from);
      setPanel({ kind: "link", x: at.left, y: at.bottom + 6 });
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === "KeyM") {
      e.preventDefault();
      newComment();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === "KeyF" && editor && !readOnly) {
      e.preventDefault();
      const id = newNoteId();
      editor.chain().focus().insertContent({ type: "note", attrs: { id, kind: "footnote" } }).run();
      setNoteEdit(id);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "e" && review.protection === "none") {
      e.preventDefault();
      setLayout((l) => ({ ...l, review: { ...l.review, tracking: !l.review.tracking } }));
      return;
    }
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
  const { margins } = layout;
  const words = editor?.storage.characterCount.words() ?? 0;
  const notes = editor ? notesOf(editor.state.doc) : [];
  const commentsShown = showComments && review.comments.length > 0;
  const footnotes = notes.filter((n) => n.kind === "footnote");
  const endnotes = notes.filter((n) => n.kind === "endnote");
  const characters = editor?.storage.characterCount.characters() ?? 0;

  /** Which header or footer area (a page's top or bottom margin) a point on the screen is in, if either. */
  const marginAt = (clientY: number): { part: Part; page: number } | null => {
    const sheet = sheetRef.current;
    if (!sheet || flowing) return null;
    const origin = sheet.getBoundingClientRect();
    const y = (clientY - origin.top) / (origin.width / sheet.offsetWidth || 1);
    const stride = page.h + PAGE_GAP;
    const index = paged ? Math.max(0, Math.min(pages - 1, Math.floor(y / stride))) : 0;
    const inPage = y - index * stride;
    const height = paged ? page.h : sheet.offsetHeight;
    if (inPage >= 0 && inPage < margins.top) return { part: "header", page: index };
    if (inPage > height - margins.bottom && inPage <= height) return { part: "footer", page: index };
    return null;
  };

  /**
   * Right-click on the page: Word's menu for whatever is under the mouse (a picture, a table, a
   * footnote or other field, a header or footer, or text), with the formatting bar above text.
   */
  const openContextMenu = (e: React.MouseEvent) => {
    if (!editor) return;
    const target = e.target as HTMLElement;
    const onError = (text: string) => setStatus({ text, error: true });
    const onPanel = (kind: ItemPanel) => setPanel({ kind, x: e.clientX, y: e.clientY });
    // Choosing from the menu also puts the formatting bar away, as in Word.
    const closingBar = (items: MenuEntry[]): MenuEntry[] =>
      items.map((item) =>
        item === "divider" ? item : "submenu" in item ? { ...item, submenu: closingBar(item.submenu) } : { ...item, onSelect: () => (setMiniBar(null), item.onSelect()) },
      );
    const open = (items: MenuEntry[], bar: boolean) => {
      setMenu(menuAt(e, closingBar(items)));
      setMiniBar(bar && editor.isEditable ? { x: e.clientX, y: e.clientY } : null);
    };
    const textOptions = (ed: Editor, hit: { pos: number } | null, extra: MenuEntry[]) => ({
      issue: hit && ed.isEditable ? issueAt(ed.state, hit.pos) : null,
      word: hit && ed.state.selection.empty ? wordAt(ed.state, hit.pos) : null,
      extra,
      onComment: newComment,
      onError,
      onLink: () => onPanel("link"),
      // Opened afresh, so it starts from the word just picked.
      onPane: (kind: "thesaurus" | "translator") => {
        setPane(null);
        setTimeout(() => setPane(kind));
      },
    });
    const place = (ed: Editor) => {
      // Outside what's selected, the cursor goes where the click was first.
      const hit = ed.view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (hit && !inSelection(ed.state, hit.pos)) ed.commands.setTextSelection(hit.pos);
      return hit;
    };

    // A header or footer being edited: the text menu for its own editor.
    const hfBox = target.closest<HTMLElement>(".docs-hf-edit");
    if (hfBox) {
      const hfEditor = hfBox.querySelector<HTMLElement & { editor?: Editor }>(".ProseMirror")?.editor;
      if (!hfEditor) return;
      const hit = place(hfEditor);
      return open([...textMenu(hfEditor, { ...textOptions(hfEditor, hit, []), onComment: () => {} }).filter((i) => i === "divider" || i.label !== "New Comment"), { label: "Close Header and Footer", onSelect: () => setHfEdit(null) }], true);
    }
    // A header or footer (or the margin where one goes), not being edited: Edit Header / Edit Footer.
    // Elsewhere on the paper (below the text, say): the text menu, for the nearest place in the text.
    if (!editor.view.dom.contains(target)) {
      const paper = target === sheetRef.current || !!target.closest(".docs-hf, .docs-page-sheet");
      if (!paper) return;
      const at = marginAt(e.clientY);
      if (at) {
        if (editor.isEditable) open(headerFooterMenu(at.part, () => editHf(at.part, at.page)), false);
        return;
      }
      return open(textMenu(editor, textOptions(editor, place(editor), [])), true);
    }

    // A picture, shape, chart or SmartArt: selected, with its own menu.
    const pictureBox = target.closest<HTMLElement>(".docs-picture");
    if (pictureBox && editor.isEditable) {
      const hit = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
      const pos = [hit?.inside, hit?.pos, hit && hit.pos - 1].find((at) => at != null && at >= 0 && editor.state.doc.nodeAt(at)?.type.name === "image" && !!editor.view.nodeDOM(at)?.contains(pictureBox));
      if (pos == null) return;
      // Several selected (Shift+click) stay selected, so Group works on them.
      if (!selectedPictures(editor.state).includes(pos)) editor.commands.setNodeSelection(pos);
      return open(pictureMenu(editor, editor.state.doc.nodeAt(pos)!, pos, { onComment: newComment, onError, onPanel }), false);
    }

    const hit = place(editor);
    // A footnote mark, citation, caption number or table of contents under the mouse.
    let field: MenuEntry[] = [];
    const fieldBox = target.closest<HTMLElement>("sup[data-note], span[data-citation], span[data-caption], div[data-ref-block]");
    if (fieldBox && editor.isEditable) {
      const at = editor.view.posAtDOM(fieldBox, 0);
      for (const pos of [hit?.inside ?? -1, at - 1, at]) {
        const node = pos >= 0 ? editor.state.doc.nodeAt(pos) : null;
        const items = node && fieldItems(editor, node, pos, { onNote: setNoteEdit });
        if (items) {
          field = items;
          break;
        }
      }
    }
    // Tracked changes and comments where the click was.
    const extra = [
      ...field,
      ...(hit ? changeItems(editor, hit.pos) : []),
      ...commentItems(commentsAt(editor), {
        onShow: () => setShowComments(true),
        onResolve: (ids) => {
          setLayout((l) => ({ ...l, review: { ...l.review, comments: l.review.comments.map((c) => (ids.includes(c.id) ? { ...c, done: true } : c)) } }));
          setDirty(true);
        },
        onDelete: (ids) => {
          for (const id of ids) unmarkComment(editor, id);
          setLayout((l) => ({ ...l, review: { ...l.review, comments: l.review.comments.filter((c) => !ids.includes(c.id)) } }));
          setDirty(true);
        },
      }),
    ];
    const options = textOptions(editor, hit, extra);
    // In a table, its own menu (unless it's on an underlined mistake, whose fixes come first, as in Word).
    if (target.closest("td, th") && editor.isEditable && !options.issue) return open([...extra, ...tableMenu(editor, { onComment: newComment, onError })], true);
    open(textMenu(editor, options), true);
  };

  return (
    <div className="relative flex h-full flex-col bg-slate-100 text-slate-800" onKeyDown={onKeyDown}>
      {/* Quick access and the document's name, on Word's blue bar (hidden in Focus and Read Mode) */}
      {reading && (
        <ReadModeBar
          title={title}
          column={column}
          onColumn={setColumn}
          tint={tint}
          onTint={setTint}
          nav={shown.nav}
          onNav={() => setShown((v) => ({ ...v, nav: !v.nav }))}
          onFind={() => openFind("find")}
          onExit={() => setViewMode("print")}
        />
      )}
      <div className={`flex items-center gap-0.5 px-1.5 py-1 text-white ${focusMode || reading ? "hidden" : ""}`} style={{ background: RIBBON_BLUE }}>
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

      {editor && !focusMode && !reading && (
        <Ribbon
          editor={hfEditor ?? editor}
          title={title}
          headerFooter={{
            editing: hfTarget,
            edit: (part) => editHf(part, hfEdit?.page ?? atPage - 1),
            close: () => setHfEdit(null),
          }}
          layout={layout}
          onLayout={(patch) => {
            setLayout((l) => ({ ...l, ...patch }));
            setDirty(true);
          }}
          onError={(text) => setStatus({ text, error: true })}
          onFile={() => setBackstage(true)}
          onFind={openFind}
          onNote={setNoteEdit}
          onGenerated={openGenerated}
          view={viewControls}
          review={{
            pane,
            onPane: setPane,
            markup,
            onMarkup: setMarkup,
            showComments,
            onShowComments: setShowComments,
            showChanges,
            onShowChanges: setShowChanges,
            readAloud,
            onReadAloud: setReadAloud,
            onNewComment: newComment,
            pages,
            author,
          }}
        />
      )}

      {/* The page, with the Navigation Pane before it and the Review pane after it */}
      <div className="relative flex min-h-0 flex-1">
        {editor && shown.nav && !focusMode && (
          <NavigationPane editor={editor} pages={pages} atPage={atPage} onPage={goToPage} onClose={() => setShown((v) => ({ ...v, nav: false }))} />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
        {editor && shown.ruler && !focusMode && !reading && !flowing && (
          <Ruler editor={editor} layout={layout} zoom={zoom} onMargins={(m) => (setLayout((l) => ({ ...l, margins: m })), setDirty(true))} />
        )}
        <div
          ref={scrollRef}
          className={`docs-page h-full min-h-0 min-w-0 flex-1 overflow-auto ${flowing && !tinted ? "bg-surface" : ""}`}
          // Room on the right for the comments; Read Mode's and Immersive Reader's page colour.
          style={{
            ...(commentsShown && { paddingRight: 300 }),
            ...(tinted && { background: tint === "sepia" ? "#f4ecd8" : "#1e1e1e" }),
          }}
          onMouseDown={(e) => e.target === e.currentTarget && editor?.commands.focus("end")}
        >
          <div
            ref={sheetRef}
            data-paged={paged || undefined}
            data-hf-editing={hfEdit ? "" : undefined}
            className={`docs-sheet relative isolate mx-auto my-6 ${flowing ? "max-w-[calc(100%-2rem)]" : ""} cursor-text text-slate-900 ${shown.gridlines && !flowing ? "docs-gridlines" : ""} ${
              shown.dark && !flowing ? "docs-dark" : ""
            } ${spacing && immersive ? "docs-spaced" : ""}`}
            // Pages keep their real size, as on paper: zoom only makes them look bigger or smaller,
            // so lines and pages break in the same places at any zoom (and a page wider than the
            // window scrolls sideways). Flowing views fill the window (or Read Mode's column) instead.
            style={
              flowing
                ? {
                    zoom: (zoom / 100) * (reading ? 1.15 : 1),
                    width: columnWidth ?? "100%",
                    padding: "24px 32px",
                    ...(tinted && { color: tint === "sepia" ? "#5b4636" : "#e6e6e6" }),
                  }
                : {
                    zoom: zoom / 100,
                    width: page.w,
                    // At least as tall as its pages: never cut short, even before they've been worked out.
                    minHeight: paged ? pages * page.h + (pages - 1) * PAGE_GAP : page.h,
                    padding: `${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px`,
                  }
            }
            onMouseDown={(e) => e.target === e.currentTarget && !hfEdit && editor?.commands.focus("end")}
            // Right-clicking the text opens Word's menu and formatting bar (a table's menu in a table).
            onContextMenu={openContextMenu}
            // Clicking the body goes back to it from a header or footer.
            onMouseDownCapture={(e) => hfEdit && !(e.target as HTMLElement).closest(".docs-hf-edit") && setHfEdit(null)}
            // Double-clicking the top or bottom margin of a page edits its header or footer, as in Word.
            onDoubleClick={(e) => {
              if (e.target !== e.currentTarget) return;
              const at = marginAt(e.clientY);
              if (at) editHf(at.part, at.page);
            }}
          >
            {/* One sheet of paper per page; while the text is in columns, one long one; none in flowing views */}
            {flowing ? null : paged ? (
              Array.from({ length: pages }, (_, i) => (
                <Sheet key={i} design={layout.design} width={page.w} top={i * (page.h + PAGE_GAP)} height={page.h}>
                  {editor && (
                    <PageHeaders
                      headers={layout.headers}
                      schema={editor.schema}
                      page={i}
                      pages={pages}
                      height={page.h}
                      text={textBox}
                      hidden={hfEdit?.page === i ? hfEdit.part : null}
                    />
                  )}
                </Sheet>
              ))
            ) : (
              <Sheet design={layout.design} width={page.w} top={0}>
                {editor && (
                  <PageHeaders headers={layout.headers} schema={editor.schema} page={0} pages={1} height={page.h} text={textBox} hidden={hfEdit?.part} />
                )}
              </Sheet>
            )}
            <style>{designCss(layout.design, ".docs-sheet .ProseMirror")}</style>
            {/* The theme effect's filter, which shapes are drawn through (Design › Effects) */}
            <svg aria-hidden width="0" height="0" className="absolute">
              <defs dangerouslySetInnerHTML={{ __html: effectFilter(layout.design.effects, paletteOf(layout.design), "docs-effect") }} />
            </svg>
            <EditorContent editor={editor} lang="en" style={flowing ? undefined : textFlow(layout)} />
            {editor && immersive && lineFocus > 0 && <LineFocus editor={editor} lines={lineFocus} />}
            {editor && !reading && <TableHandles editor={editor} />}
            {editor && layout.lineNumbers && !flowing && <LineNumbers editor={editor} numbering={layout.lineNumbers} layout={layout} zoom={zoom} />}
            {/* Footnotes at the bottom of their pages, endnotes after the text (or all after it, in columns) */}
            <div ref={notesRef}>
              <NotesMeasure notes={notes} text={textBox} />
            </div>
            {paged ? (
              <>
                {Array.from({ length: pages }, (_, i) => (
                  <PageFootnotes
                    key={i}
                    notes={footnotes.filter((n) => (notePlaces?.footnotes[n.id] ?? 0) === i)}
                    bottom={i * (page.h + PAGE_GAP) + page.h - margins.bottom}
                    text={textBox}
                    onOpen={setNoteEdit}
                  />
                ))}
                {notePlaces?.endnotes && <Endnotes notes={endnotes} top={notePlaces.endnotes.top} text={textBox} onOpen={setNoteEdit} />}
              </>
            ) : (
              <>
                <Endnotes notes={footnotes} text={textBox} onOpen={setNoteEdit} />
                <Endnotes notes={endnotes} text={textBox} onOpen={setNoteEdit} />
              </>
            )}
            {hfTarget && (
              <HeaderFooterEditor
                key={`${hfTarget.part}-${hfTarget.first}-${hfTarget.page}`}
                target={hfTarget}
                html={layout.headers[hfKey(hfTarget.part, hfTarget.first)]}
                top={paged ? hfTarget.page * (page.h + PAGE_GAP) : 0}
                height={paged ? page.h : (sheetRef.current?.offsetHeight ?? page.h)}
                text={textBox}
                onEditor={setHfEditor}
                onClose={() => setHfEdit(null)}
                onChange={(html) => {
                  setLayout((l) => ({ ...l, headers: { ...l.headers, [hfKey(hfTarget.part, hfTarget.first)]: html } }));
                  setDirty(true);
                }}
              />
            )}
            {editor && commentsShown && (
              <CommentsColumn
                editor={editor}
                comments={review.comments}
                author={author}
                fresh={freshComment}
                readOnly={review.protection === "readonly"}
                onFreshDone={() => setFreshComment(null)}
                onComments={(comments) => {
                  setLayout((l) => ({ ...l, review: { ...l.review, comments } }));
                  setDirty(true);
                }}
              />
            )}
          </div>
        </div>
        </div>
        {editor && pane && !focusMode && (
          <TaskPane kind={pane} editor={editor} layout={layout} title={title} onKind={setPane} onClose={() => setPane(null)} onGenerated={openGenerated} />
        )}
        {editor && readAloud && <ReadAloud editor={editor} onClose={() => setReadAloud(false)} />}
        {focusMode && (
          <button type="button" onClick={() => setFocusMode(false)} title="Leave Focus (Esc)" className="absolute top-2 right-4 z-20 rounded-full bg-surface/90 px-3 py-1 text-xs text-slate-600 shadow ring-1 ring-black/10 hover:bg-surface">
            Exit Focus
          </button>
        )}
        {editor && noteEdit && <NotePanel editor={editor} id={noteEdit} onClose={() => setNoteEdit(null)} />}
        {editor && find && (
          <FindPanel editor={editor} mode={find.mode} focusKey={find.nonce} onMode={(mode) => setFind({ ...find, mode })} onClose={closeFind} />
        )}
      </div>

      {/* Status bar */}
      <div className={`flex items-center gap-4 border-t border-slate-200 bg-surface px-3 py-1 text-xs text-slate-600 ${focusMode || reading ? "hidden" : ""}`}>
        <span>
          Page {atPage} of {pages}
        </span>
        <span>
          {words} {words === 1 ? "word" : "words"}
        </span>
        <span>
          {characters} {characters === 1 ? "character" : "characters"}
        </span>
        <label className="ml-auto flex items-center gap-1.5">
          Zoom
          <button type="button" title="Zoom Out" aria-label="Zoom Out" disabled={zoom <= 10} onClick={() => setZoom(Math.ceil(zoom / 10) * 10 - 10)} className="rounded px-1.5 hover:bg-slate-100 disabled:opacity-40">
            −
          </button>
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="rounded border border-slate-300 bg-surface px-1 py-0.5">
            {[...new Set([...ZOOMS, zoom])]
              .sort((a, b) => a - b)
              .map((z) => (
                <option key={z} value={z}>
                  {z}%
                </option>
              ))}
          </select>
          <button type="button" title="Zoom In" aria-label="Zoom In" disabled={zoom >= 500} onClick={() => setZoom(Math.floor(zoom / 10) * 10 + 10)} className="rounded px-1.5 hover:bg-slate-100 disabled:opacity-40">
            +
          </button>
        </label>
      </div>

      {editor && miniBar && <MiniToolbar editor={editor} x={miniBar.x} y={miniBar.y} menu={menu} onClose={closeMiniBar} />}
      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
      {editor && panel && (
        <FloatingPanel x={panel.x} y={panel.y} onClose={closePanel}>
          {panel.kind === "link" ? (
            <LinkForm editor={editor} onDone={closePanel} />
          ) : panel.kind === "alt" ? (
            <AltTextForm editor={editor} onDone={closePanel} />
          ) : panel.kind === "caption" ? (
            <CaptionForm editor={editor} onDone={closePanel} />
          ) : (
            <ChartForm editor={editor} editing={selectedChart(editor) ?? undefined} onDone={closePanel} />
          )}
        </FloatingPanel>
      )}
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

/** A sheet of paper: its colour, border and watermark (Design › Page Background). */
function Sheet({ design, width, top, height, children }: { design: DocDesign; width: number; top: number; height?: number; children?: ReactNode }) {
  const mark = design.watermark;
  const border = design.pageBorder;
  // Like Word's "Auto" size: the text stretches across the page (corner to corner when diagonal).
  const span = mark && (mark.diagonal ? Math.hypot(width, height ?? width * 1.41) * 0.7 : width * 0.75);
  return (
    <div aria-hidden className="docs-page-sheet" style={{ top, ...(height ? { height } : { bottom: 0 }), ...(design.pageColor && { backgroundColor: design.pageColor }) }}>
      {border && (
        // 24pt in from the edge of the page, as in Word.
        <div className="absolute inset-8" style={{ border: `${Math.max(1, border.width * (96 / 72))}px ${border.style} ${border.color}` }} />
      )}
      {mark && span && (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          <span
            className="whitespace-nowrap select-none"
            style={{
              fontFamily: `"${mark.font}", sans-serif`,
              fontSize: Math.min(220, span / (mark.text.length * 0.62)),
              color: mark.color,
              opacity: mark.faint ? 0.5 : 1,
              transform: mark.diagonal ? "rotate(-45deg)" : undefined,
            }}
          >
            {mark.text}
          </span>
        </div>
      )}
      {children}
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
