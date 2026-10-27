"use client";

// Word's right-click on text: the mini toolbar (font, size, bold…, colours, lists) above
// a menu with the fixes for an underlined mistake (spelling or grammar), the clipboard, Synonyms,
// Translate, Link and New Comment.

import type { EditorState } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import {
  AArrowDown,
  AArrowUp,
  Baseline,
  Bold,
  BookA,
  Check,
  ClipboardPaste,
  Copy,
  Highlighter,
  Italic,
  Languages,
  Link2,
  List,
  ListOrdered,
  MessageSquarePlus,
  PencilLine,
  Scissors,
  SpellCheck,
  Underline,
  Unlink,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { MenuEntry } from "../ContextMenu";
import { goToBookmark } from "./insertNodes";
import { ignoreOnce, proofingSpeller, recheckAll } from "./review/proofing";
import { addWord, IGNORED_WORDS, type Issue } from "./review/tools";
import { currentSize, FONTS, SIZES } from "./ribbon/HomeTab";

/** The word at a position in the document, if there is one there. */
export function wordAt(state: EditorState, pos: number): { from: number; to: number; text: string } | null {
  const $pos = state.doc.resolve(pos);
  if (!$pos.parent.isTextblock) return null;
  const start = $pos.start();
  // One character for each position, so offsets in the text are offsets in the document.
  const text = state.doc.textBetween(start, $pos.end(), undefined, "￼");
  const isLetter = (c: string | undefined) => !!c && /[\p{L}'’-]/u.test(c);
  let a = pos - start;
  let b = a;
  while (a > 0 && isLetter(text[a - 1])) a--;
  while (b < text.length && isLetter(text[b])) b++;
  const word = text.slice(a, b).replace(/^['’-]+|['’-]+$/g, "");
  if (!word) return null;
  const lead = text.slice(a, b).indexOf(word);
  return { from: start + a + lead, to: start + a + lead + word.length, text: word };
}

interface TextMenuOptions {
  /** The underlined mistake under the mouse (review/proofing.ts). */
  issue: Issue | null;
  /** Items for what else is there (a tracked change, a comment, a footnote…), after the mistake's fixes. */
  extra?: MenuEntry[];
  word: { from: number; to: number; text: string } | null;
  onComment: () => void;
  onPane: (pane: "thesaurus" | "translator") => void;
  onLink: () => void;
  onError: (text: string) => void;
}

export function clipboardItems(editor: Editor, onError: (text: string) => void): MenuEntry[] {
  const clipboard = (what: "cut" | "copy") => {
    editor.view.focus();
    if (!document.execCommand(what)) onError(`Use ${what === "cut" ? "Ctrl+X" : "Ctrl+C"} to ${what}.`);
  };
  const paste = async () => {
    editor.view.focus();
    try {
      const items = await navigator.clipboard.read();
      const html = items.find((i) => i.types.includes("text/html"));
      if (html) editor.view.pasteHTML(await (await html.getType("text/html")).text());
      else editor.view.pasteText(await navigator.clipboard.readText());
    } catch {
      onError("The browser didn't allow pasting from here: use Ctrl+V.");
    }
  };
  const empty = editor.state.selection.empty;
  return [
    { label: "Cut", icon: Scissors, hint: "Ctrl+X", disabled: empty || !editor.isEditable, onSelect: () => clipboard("cut") },
    { label: "Copy", icon: Copy, hint: "Ctrl+C", disabled: empty, onSelect: () => clipboard("copy") },
    { label: "Paste", icon: ClipboardPaste, hint: "Ctrl+V", disabled: !editor.isEditable, onSelect: () => void paste() },
  ];
}

/** How a grammar fix reads in the menu ("Delete Repeated Word", or the word to use). */
function grammarFix(message: string, suggestion: string) {
  if (message === "Repeated word") return "Delete Repeated Word";
  if (message === "Extra spaces") return "Delete Extra Space";
  if (message === "Space before punctuation") return "Delete Space";
  if (message === "Missing space after punctuation") return "Add a Space";
  return suggestion;
}

export function textMenu(editor: Editor, p: TextMenuOptions): MenuEntry[] {
  const select = (r: { from: number; to: number }) => editor.chain().focus().setTextSelection(r).run();
  const items: MenuEntry[] = [];
  const issue = p.issue;
  const fix = (text: string) => issue && editor.chain().focus().insertContentAt({ from: issue.from, to: issue.to }, text).run();
  if (issue?.kind === "spelling") {
    const suggestions = proofingSpeller()?.suggest(issue.text).slice(0, 5) ?? [];
    if (suggestions.length) for (const word of suggestions) items.push({ label: word, icon: SpellCheck, onSelect: () => fix(word) });
    else items.push({ label: "(No spelling suggestions)", disabled: true, onSelect: () => {} });
    items.push(
      { label: "Ignore All", onSelect: () => (IGNORED_WORDS.add(issue.text.toLowerCase()), recheckAll(editor)) },
      { label: "Add to Dictionary", onSelect: () => void addWord(issue.text).then(() => recheckAll(editor)) },
      "divider",
    );
  } else if (issue) {
    // What's wrong, then the fix, as Word's grammar suggestions show them.
    items.push({ label: issue.message, icon: PencilLine, disabled: true, onSelect: () => {} });
    for (const s of issue.suggestions) items.push({ label: grammarFix(issue.message, s), icon: Check, onSelect: () => fix(s) });
    items.push({ label: "Ignore Once", onSelect: () => ignoreOnce(editor, issue) }, "divider");
  }
  items.push(...(p.extra ?? []), ...clipboardItems(editor, p.onError), "divider");
  const link = editor.getAttributes("link").href as string | undefined;
  items.push(
    {
      label: "Synonyms",
      icon: BookA,
      disabled: !p.word && editor.state.selection.empty,
      onSelect: () => {
        if (p.word && editor.state.selection.empty) select(p.word);
        p.onPane("thesaurus");
      },
    },
    {
      label: "Translate",
      icon: Languages,
      disabled: !p.word && editor.state.selection.empty,
      onSelect: () => {
        if (p.word && editor.state.selection.empty) select(p.word);
        p.onPane("translator");
      },
    },
    { label: link ? "Edit Link" : "Link", icon: Link2, hint: "Ctrl+K", disabled: !editor.isEditable, onSelect: p.onLink },
  );
  if (link)
    items.push(
      // A cross-reference goes to its place in the document; a web address opens in a new tab.
      { label: "Open Link", onSelect: () => (link.startsWith("#") ? goToBookmark(editor, link.slice(1)) : window.open(link, "_blank", "noopener,noreferrer")) },
      { label: "Remove Link", icon: Unlink, onSelect: () => editor.chain().focus().extendMarkRange("link").unsetLink().run() },
    );
  items.push("divider", { label: "New Comment", icon: MessageSquarePlus, hint: "Ctrl+Alt+M", onSelect: p.onComment });
  return items;
}

// ---- The mini toolbar ----

const HIGHLIGHT = "#ffff00";
const FONT_COLOUR = "#ff0000";

/**
 * Word's floating formatting bar, just above the right-click menu (below it, when the menu opened
 * upwards). `menu` is the open menu, followed as it moves. Closes when you click elsewhere or type.
 */
export function MiniToolbar({ editor, x, y, menu, onClose }: { editor: Editor; x: number; y: number; menu: unknown; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [, redraw] = useState(0);

  // Lined up with the menu once it has found its place: above it if there's room, else below it.
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      // With the menu gone (the bar was clicked), the bar stays where it is.
      const box = document.querySelector('[role="menu"]')?.getBoundingClientRect();
      if (!box) return;
      const { width, height } = el.getBoundingClientRect();
      const top = box.top - height - 6 >= 4 ? box.top - height - 6 : Math.min(box.bottom + 6, window.innerHeight - height - 4);
      setPos({ left: Math.max(4, Math.min(box.left, window.innerWidth - width - 4)), top });
    });
    return () => cancelAnimationFrame(frame);
  }, [x, y, menu]);

  useEffect(() => {
    const away = (e: Event) => {
      const target = e.target;
      if (target instanceof Element && (ref.current?.contains(target) || target.closest('[role="menu"]'))) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof Node && ref.current?.contains(e.target) && e.key !== "Escape") return;
      onClose();
    };
    const update = () => redraw((n) => n + 1);
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("resize", onClose);
    editor.on("transaction", update);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", onClose);
      editor.off("transaction", update);
    };
  }, [editor, onClose]);

  const run = () => editor.chain().focus();
  const stored = editor.getAttributes("textStyle").fontFamily as string | undefined;
  const first = (css: string) => css.split(",")[0].replace(/"/g, "").trim();
  const font = stored ? FONTS.find((f) => first(f.css) === first(stored)) : undefined;
  const size = currentSize(editor);
  const setSize = (pt: number) => run().setFontSize(`${Math.min(400, Math.max(1, pt))}pt`).run();

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Formatting"
      className="menu-pop fixed z-[9501] flex flex-col gap-1 rounded-lg border border-black/10 bg-surface p-1 text-[13px] text-slate-800 shadow-xl"
      style={pos}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-0.5">
        <select
          aria-label="Font"
          value={font?.name ?? ""}
          onChange={(e) => {
            const f = FONTS.find((x) => x.name === e.target.value);
            if (f) run().setFontFamily(f.css).run();
            else run().unsetFontFamily().run();
          }}
          className="h-7 w-32 rounded border border-slate-300 bg-surface px-1"
        >
          <option value="">Default</option>
          {FONTS.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>
        <select aria-label="Font size" value={SIZES.includes(size) ? size : ""} onChange={(e) => setSize(Number(e.target.value))} className="h-7 w-14 rounded border border-slate-300 bg-surface px-1">
          {!SIZES.includes(size) && <option value="">{size}</option>}
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Tool title="Grow Font (Ctrl+])" onClick={() => setSize(SIZES.find((s) => s > size) ?? size + 10)}>
          <AArrowUp size={16} />
        </Tool>
        <Tool title="Shrink Font (Ctrl+[)" onClick={() => setSize([...SIZES].reverse().find((s) => s < size) ?? size - 1)}>
          <AArrowDown size={16} />
        </Tool>
      </div>
      <div className="flex items-center gap-0.5">
        <Tool title="Bold (Ctrl+B)" active={editor.isActive("bold")} onClick={() => run().toggleBold().run()}>
          <Bold size={16} />
        </Tool>
        <Tool title="Italic (Ctrl+I)" active={editor.isActive("italic")} onClick={() => run().toggleItalic().run()}>
          <Italic size={16} />
        </Tool>
        <Tool title="Underline (Ctrl+U)" active={editor.isActive("underline")} onClick={() => run().toggleUnderline().run()}>
          <Underline size={16} />
        </Tool>
        <Tool title="Text Highlight Color" onClick={() => run().toggleHighlight({ color: HIGHLIGHT }).run()}>
          <Highlighter size={16} />
          <span className="absolute inset-x-1.5 bottom-0.5 h-1" style={{ background: HIGHLIGHT }} />
        </Tool>
        <Tool title="Font Color" onClick={() => run().setColor(FONT_COLOUR).run()}>
          <Baseline size={16} />
          <span className="absolute inset-x-1.5 bottom-0.5 h-1" style={{ background: FONT_COLOUR }} />
        </Tool>
        <span className="mx-0.5 h-5 w-px bg-slate-200" />
        <Tool title="Bullets" active={editor.isActive("bulletList")} onClick={() => run().toggleBulletList().run()}>
          <List size={16} />
        </Tool>
        <Tool title="Numbering" active={editor.isActive("orderedList")} onClick={() => run().toggleOrderedList().run()}>
          <ListOrdered size={16} />
        </Tool>
      </div>
    </div>
  );
}

function Tool(p: { title: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={p.title}
      aria-label={p.title}
      aria-pressed={p.active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={p.onClick}
      className={`relative flex h-7 w-7 items-center justify-center rounded ${p.active ? "bg-blue-100 text-blue-800" : "hover:bg-slate-100"}`}
    >
      {p.children}
    </button>
  );
}

/** A small floating box (like the Link box from the right-click menu). Closes on Escape or a click elsewhere. */
export function FloatingPanel({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({ left: Math.max(4, Math.min(x, window.innerWidth - width - 4)), top: Math.max(4, Math.min(y, window.innerHeight - height - 4)) });
  }, [x, y]);
  useEffect(() => {
    const away = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="menu-pop fixed z-[9502] rounded-lg border border-black/10 bg-surface p-3 text-slate-800 shadow-xl" style={pos}>
      {children}
    </div>
  );
}

/** Edit Alt Text: what a picture shows, read out by screen readers and kept in Word files. */
export function AltTextForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [text, setText] = useState(() => (editor.getAttributes("image").alt as string | undefined) ?? "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        editor.chain().focus().updateAttributes("image", { alt: text.trim() || null }).run();
        onDone();
      }}
      className="flex w-72 flex-col gap-2 text-sm"
    >
      <label htmlFor="docs-alt" className="font-semibold">
        Alt Text
      </label>
      <p className="text-xs text-slate-500">How would you describe this to someone who can&apos;t see it?</p>
      <textarea id="docs-alt" autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} className="rounded border border-slate-300 p-1.5 outline-none focus:border-blue-500" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded px-3 py-1 hover:bg-slate-100">
          Cancel
        </button>
        <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-white">
          OK
        </button>
      </div>
    </form>
  );
}
