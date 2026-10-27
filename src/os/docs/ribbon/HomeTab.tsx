"use client";

import type { Mark } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import {
  AArrowDown,
  AArrowUp,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDownAZ,
  ArrowUpDown,
  Baseline,
  Bold,
  CaseSensitive,
  ChevronDown,
  ChevronsDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  Grid2x2,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  ListTree,
  PaintBucket,
  Paintbrush,
  Pilcrow,
  RemoveFormatting,
  Replace,
  Scissors,
  Search,
  Sparkles,
  Strikethrough,
  Subscript,
  Superscript,
  TextSelect,
  Underline,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import type { Border, StyleName, UnderlineStyle } from "../extensions";
import { changeCase, sortBlocks, type CaseMode } from "../textOps";
import { Divider, Drop, Group, keepFocus, MenuButton, MenuItem, Row, Split, Stack, Tool, type Swatch } from "./parts";
import { ColourPicker } from "./ColourPicker";

interface Props {
  editor: Editor;
  onError: (text: string) => void;
  onFind: (mode: "find" | "replace") => void;
  showMarks: boolean;
  onShowMarks: () => void;
}

export function HomeTab({ editor, onError, onFind, showMarks, onShowMarks }: Props) {
  return (
    <>
      <ClipboardGroup editor={editor} onError={onError} />
      <Divider />
      <FontGroup editor={editor} onError={onError} />
      <Divider />
      <ParagraphGroup editor={editor} onError={onError} showMarks={showMarks} onShowMarks={onShowMarks} />
      <Divider />
      <StylesGroup editor={editor} />
      <Divider />
      <Group label="Editing">
        <MenuButton
          big
          icon={Search}
          label="Editing"
          align="right"
          menu={(close) => (
            <>
              <MenuItem icon={Search} label="Find" hint="Ctrl+F" onClick={() => (close(), onFind("find"))} />
              <MenuItem icon={Replace} label="Replace" hint="Ctrl+H" onClick={() => (close(), onFind("replace"))} />
              <MenuItem icon={TextSelect} label="Select all" hint="Ctrl+A" onClick={() => (close(), editor.chain().focus().selectAll().run())} />
            </>
          )}
        />
      </Group>
    </>
  );
}

// ---- Clipboard ----

function ClipboardGroup({ editor, onError }: { editor: Editor; onError: (text: string) => void }) {
  const [pasteMenu, setPasteMenu] = useState(false);
  /** Formatting picked up by Format Painter, waiting to be brushed onto the next selection. */
  const [painter, setPainter] = useState<readonly Mark[] | null>(null);

  async function paste(textOnly: boolean) {
    try {
      if (!textOnly && navigator.clipboard.read) {
        for (const item of await navigator.clipboard.read()) {
          if (item.types.includes("text/html")) {
            const html = await (await item.getType("text/html")).text();
            editor.chain().focus().insertContent(html).run();
            return;
          }
        }
      }
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const lines = text.split(/\r?\n/);
      editor
        .chain()
        .focus()
        .insertContent(
          lines.length === 1
            ? { type: "text", text }
            : lines.map((line) => ({ type: "paragraph", content: line ? [{ type: "text", text: line }] : [] })),
        )
        .run();
    } catch {
      onError("This browser won't let the Paste button read the clipboard. Press Ctrl+V instead.");
    }
  }

  function clip(action: "cut" | "copy") {
    editor.commands.focus();
    if (editor.state.selection.empty) return onError(`Select some text to ${action} first.`);
    if (!document.execCommand(action)) onError(`Press Ctrl+${action === "cut" ? "X" : "C"} to ${action}.`);
  }

  function pickUpFormat() {
    if (painter) return setPainter(null);
    const { state } = editor;
    const { from, empty } = state.selection;
    setPainter(empty ? (state.storedMarks ?? state.selection.$from.marks()) : (state.doc.nodeAt(from)?.marks ?? []));
  }

  // While Format Painter is on, the next selection made with the mouse gets the formatting.
  useEffect(() => {
    if (!painter) return;
    const dom = editor.view.dom;
    dom.classList.add("format-painter");
    const brush = () =>
      setTimeout(() => {
        if (editor.state.selection.empty) return;
        const chain = editor.chain().focus().unsetAllMarks();
        painter.forEach((mark) => chain.setMark(mark.type.name, mark.attrs));
        chain.run();
        setPainter(null);
      });
    const cancel = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setPainter(null);
    dom.addEventListener("mouseup", brush);
    document.addEventListener("keydown", cancel);
    return () => {
      dom.classList.remove("format-painter");
      dom.removeEventListener("mouseup", brush);
      document.removeEventListener("keydown", cancel);
    };
  }, [painter, editor]);

  return (
    <Group label="Clipboard">
      <span className="relative flex flex-col items-center">
        <button
          type="button"
          title="Paste (Ctrl+V)"
          onMouseDown={keepFocus}
          onClick={() => paste(false)}
          className="flex flex-col items-center rounded-t px-2 pt-1 hover:bg-slate-200/70"
        >
          <ClipboardPaste size={26} />
        </button>
        <button
          type="button"
          aria-expanded={pasteMenu}
          onMouseDown={keepFocus}
          onClick={() => setPasteMenu((o) => !o)}
          className={`flex items-center gap-0.5 rounded-b px-1.5 pb-0.5 text-xs ${pasteMenu ? "bg-blue-100 text-blue-800" : "hover:bg-slate-200/70"}`}
        >
          Paste <ChevronDown size={11} />
        </button>
        <Drop open={pasteMenu} onClose={() => setPasteMenu(false)}>
          <MenuItem label="Keep formatting" onClick={() => (setPasteMenu(false), paste(false))} />
          <MenuItem label="Keep text only" onClick={() => (setPasteMenu(false), paste(true))} />
        </Drop>
      </span>
      <Stack>
        <Tool icon={Scissors} label="Cut (Ctrl+X)" onClick={() => clip("cut")} />
        <Tool icon={Copy} label="Copy (Ctrl+C)" onClick={() => clip("copy")} />
        <Tool icon={Paintbrush} label="Format Painter: copy formatting to the next text you select" active={!!painter} onClick={pickUpFormat} />
      </Stack>
    </Group>
  );
}

// ---- Font ----

/** Fonts every computer has, so documents look the same everywhere. */
export const FONTS = [
  { name: "Arial", css: "Arial, Helvetica, sans-serif" },
  { name: "Georgia", css: "Georgia, serif" },
  { name: "Times New Roman", css: '"Times New Roman", Times, serif' },
  { name: "Verdana", css: "Verdana, Geneva, sans-serif" },
  { name: "Trebuchet MS", css: '"Trebuchet MS", sans-serif' },
  { name: "Comic Sans MS", css: '"Comic Sans MS", "Comic Sans", cursive' },
  { name: "Courier New", css: '"Courier New", Courier, monospace' },
  { name: "Impact", css: "Impact, sans-serif" },
];

export const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

/** Word's default font colour and shading, until another is picked. */
const FIRST_TEXT_COLOUR = "#ff0000";

const HIGHLIGHTS: Swatch[] = [
  { name: "Yellow", value: "#fde047" },
  { name: "Bright green", value: "#86efac" },
  { name: "Turquoise", value: "#67e8f9" },
  { name: "Pink", value: "#f9a8d4" },
  { name: "Blue", value: "#93c5fd" },
  { name: "Red", value: "#fca5a5" },
  { name: "Grey", value: "#d1d5db" },
];

const CASES: { mode: CaseMode; label: string }[] = [
  { mode: "sentence", label: "Sentence case." },
  { mode: "lower", label: "lowercase" },
  { mode: "upper", label: "UPPERCASE" },
  { mode: "title", label: "Capitalise Each Word" },
  { mode: "toggle", label: "tOGGLE cASE" },
];

const UNDERLINES: { style: UnderlineStyle; label: string }[] = [
  { style: "solid", label: "Single" },
  { style: "double", label: "Double" },
  { style: "dotted", label: "Dotted" },
  { style: "dashed", label: "Dashed" },
  { style: "wavy", label: "Wavy" },
];

/** First family in a CSS font list, without quotes: '"Times New Roman", serif' → "times new roman". */
const firstFamily = (css: string) => css.split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();

/** The size (in points) of the text at the cursor, for the size box. */
export function currentSize(editor: Editor): number {
  const stored = editor.getAttributes("textStyle").fontSize as string | undefined;
  if (stored) {
    const n = parseFloat(stored);
    return Math.round((stored.endsWith("px") ? n * 0.75 : n) * 2) / 2;
  }
  const level = ([1, 2, 3] as const).find((l) => editor.isActive("heading", { level: l }));
  if (level) return { 1: 24, 2: 18, 3: 14 }[level];
  if (editor.isActive("paragraph", { styleName: "title" })) return 31;
  if (editor.isActive("paragraph", { styleName: "subtitle" })) return 16;
  return 12;
}

function FontGroup({ editor, onError }: { editor: Editor; onError: (text: string) => void }) {
  const run = () => editor.chain().focus();
  const [textColour, setTextColour] = useState(FIRST_TEXT_COLOUR);
  const [highlight, setHighlight] = useState(HIGHLIGHTS[0].value);
  const size = currentSize(editor);
  const setSize = (pt: number) => run().setFontSize(`${Math.min(400, Math.max(1, pt))}pt`).run();
  const grow = () => setSize(SIZES.find((s) => s > size) ?? size + 10);
  const shrink = () => setSize([...SIZES].reverse().find((s) => s < size) ?? size - 1);

  return (
    <Group label="Font">
      <Stack>
        <Row>
          <FontPicker editor={editor} />
          <SizeBox size={size} onSize={setSize} />
          <Tool icon={AArrowUp} label="Grow font (Ctrl+])" onClick={grow} />
          <Tool icon={AArrowDown} label="Shrink font (Ctrl+[)" onClick={shrink} />
          <MenuButton
            icon={CaseSensitive}
            label="Change case"
            menu={(close) =>
              CASES.map((c) => (
                <MenuItem
                  key={c.mode}
                  label={c.label}
                  onClick={() => {
                    close();
                    if (!changeCase(editor, c.mode)) onError("Select some text first, then choose how to change its case.");
                  }}
                />
              ))
            }
          />
          <Tool
            icon={RemoveFormatting}
            label="Clear all formatting"
            onClick={() =>
              run()
                .unsetAllMarks()
                .clearNodes()
                .unsetTextAlign()
                .updateAttributes("paragraph", { indent: 0, lineHeight: null, shading: null, border: null, styleName: null })
                .run()
            }
          />
        </Row>
        <Row>
          <Tool icon={Bold} label="Bold (Ctrl+B)" active={editor.isActive("bold")} onClick={() => run().toggleBold().run()} />
          <Tool icon={Italic} label="Italic (Ctrl+I)" active={editor.isActive("italic")} onClick={() => run().toggleItalic().run()} />
          <Split
            icon={Underline}
            label="Underline (Ctrl+U)"
            active={editor.isActive("underline")}
            onClick={() => run().toggleUnderline().run()}
            menu={(close) =>
              UNDERLINES.map((u) => (
                <MenuItem
                  key={u.style}
                  label={<span style={{ textDecoration: "underline", textDecorationStyle: u.style }}>{u.label}</span>}
                  checked={editor.isActive("underline") && (editor.getAttributes("underline").lineStyle ?? "solid") === u.style}
                  onClick={() => {
                    close();
                    run().setMark("underline", { lineStyle: u.style === "solid" ? null : u.style }).run();
                  }}
                />
              ))
            }
          />
          <Tool icon={Strikethrough} label="Strikethrough" active={editor.isActive("strike")} onClick={() => run().toggleStrike().run()} />
          <Tool icon={Subscript} label="Subscript (Ctrl+,)" active={editor.isActive("subscript")} onClick={() => run().toggleSubscript().run()} />
          <Tool icon={Superscript} label="Superscript (Ctrl+.)" active={editor.isActive("superscript")} onClick={() => run().toggleSuperscript().run()} />
          <Tool icon={Sparkles} label="Text effects (coming soon)" disabled onClick={() => {}} />
          <Split
            icon={Highlighter}
            label="Highlight colour"
            colour={highlight}
            active={editor.isActive("highlight")}
            onClick={() => run().toggleHighlight({ color: highlight }).run()}
            menu={(close) => (
              <ColourPicker
                featured={{ title: "Highlighter", colours: HIGHLIGHTS }}
                current={editor.getAttributes("highlight").color}
                noneLabel="No colour"
                onPick={(value) => {
                  close();
                  if (value) {
                    setHighlight(value);
                    run().setHighlight({ color: value }).run();
                  } else run().unsetHighlight().run();
                }}
              />
            )}
          />
          <Split
            icon={Baseline}
            label="Font colour"
            colour={textColour}
            onClick={() => run().setColor(textColour).run()}
            menu={(close) => (
              <ColourPicker
                current={editor.getAttributes("textStyle").color}
                noneLabel="Automatic"
                onPick={(value) => {
                  close();
                  if (value) {
                    setTextColour(value);
                    run().setColor(value).run();
                  } else run().unsetColor().run();
                }}
              />
            )}
          />
        </Row>
      </Stack>
    </Group>
  );
}

function FontPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const stored = editor.getAttributes("textStyle").fontFamily as string | undefined;
  const font = stored ? FONTS.find((f) => firstFamily(f.css) === firstFamily(stored)) : undefined;
  const name = font?.name ?? (stored ? firstFamily(stored) : "Default");

  return (
    <span className="relative">
      <button
        type="button"
        title="Font"
        aria-label={`Font: ${name}`}
        aria-expanded={open}
        onMouseDown={keepFocus}
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-36 items-center justify-between gap-1 rounded border border-slate-300 bg-surface px-2 text-sm hover:border-slate-400"
      >
        <span className="truncate" style={{ fontFamily: font?.css }}>
          {name}
        </span>
        <ChevronDown size={12} className="shrink-0" />
      </button>
      <Drop open={open} onClose={() => setOpen(false)}>
        <div className="max-h-72 overflow-y-auto">
          <MenuItem
            label="Default"
            checked={!stored}
            onClick={() => {
              setOpen(false);
              editor.chain().focus().unsetFontFamily().run();
            }}
          />
          {FONTS.map((f) => (
            <MenuItem
              key={f.name}
              label={<span style={{ fontFamily: f.css, fontSize: 15 }}>{f.name}</span>}
              checked={font === f}
              onClick={() => {
                setOpen(false);
                editor.chain().focus().setFontFamily(f.css).run();
              }}
            />
          ))}
        </div>
      </Drop>
    </span>
  );
}

function SizeBox({ size, onSize }: { size: number; onSize: (pt: number) => void }) {
  const [text, setText] = useState(String(size));
  const [open, setOpen] = useState(false);
  useEffect(() => setText(String(size)), [size]);

  const apply = () => {
    const n = parseFloat(text);
    if (n > 0) onSize(n);
    else setText(String(size));
  };

  return (
    <span className="relative flex h-7 items-center rounded border border-slate-300 bg-surface hover:border-slate-400">
      <input
        aria-label="Font size"
        title="Font size"
        value={text}
        inputMode="decimal"
        onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
        }}
        onBlur={apply}
        className="w-9 bg-transparent pl-1.5 text-sm outline-none select-text"
      />
      <button
        type="button"
        aria-label="Font sizes"
        aria-expanded={open}
        onMouseDown={keepFocus}
        onClick={() => setOpen((o) => !o)}
        className="flex h-full items-center px-0.5 hover:bg-slate-100"
      >
        <ChevronDown size={12} />
      </button>
      <Drop open={open} onClose={() => setOpen(false)}>
        <div className="max-h-72 overflow-y-auto">
          {SIZES.map((s) => (
            <MenuItem
              key={s}
              label={String(s)}
              checked={s === size}
              onClick={() => {
                setOpen(false);
                onSize(s);
              }}
            />
          ))}
        </div>
      </Drop>
    </span>
  );
}

// ---- Paragraph ----

const BULLETS = [
  { style: "disc", label: "● Filled circle" },
  { style: "circle", label: "○ Hollow circle" },
  { style: "square", label: "■ Square" },
];

const NUMBERS = [
  { style: "decimal", label: "1. 2. 3." },
  { style: "lower-alpha", label: "a. b. c." },
  { style: "upper-alpha", label: "A. B. C." },
  { style: "lower-roman", label: "i. ii. iii." },
  { style: "upper-roman", label: "I. II. III." },
];

const SPACINGS = ["1.0", "1.15", "1.5", "2.0", "2.5", "3.0"];

const FIRST_SHADE = "#dbe5f5";

const BORDERS: { border: Border | null; label: string }[] = [
  { border: "bottom", label: "Bottom border" },
  { border: "top", label: "Top border" },
  { border: "box", label: "Outside borders" },
  { border: null, label: "No border" },
];

/** Attributes of the paragraph or heading at the cursor. */
const blockAttrs = (editor: Editor) =>
  editor.isActive("heading") ? editor.getAttributes("heading") : editor.getAttributes("paragraph");

function ParagraphGroup(p: { editor: Editor; onError: (text: string) => void; showMarks: boolean; onShowMarks: () => void }) {
  const { editor } = p;
  const run = () => editor.chain().focus();
  const [shade, setShade] = useState(FIRST_SHADE);
  const [border, setBorder] = useState<Border>("bottom");
  const attrs = blockAttrs(editor);

  const listWith = (type: "bulletList" | "orderedList", listStyle: string) => {
    const chain = run();
    if (!editor.isActive(type)) chain.toggleList(type, "listItem");
    chain.updateAttributes(type, { listStyle }).run();
  };

  return (
    <Group label="Paragraph">
      <Stack>
        <Row>
          <Split
            icon={List}
            label="Bullets"
            active={editor.isActive("bulletList")}
            onClick={() => run().toggleBulletList().run()}
            menu={(close) =>
              BULLETS.map((b) => (
                <MenuItem
                  key={b.style}
                  label={b.label}
                  checked={editor.isActive("bulletList") && (editor.getAttributes("bulletList").listStyle ?? "disc") === b.style}
                  onClick={() => (close(), listWith("bulletList", b.style))}
                />
              ))
            }
          />
          <Split
            icon={ListOrdered}
            label="Numbering"
            active={editor.isActive("orderedList")}
            onClick={() => run().toggleOrderedList().run()}
            menu={(close) =>
              NUMBERS.map((n) => (
                <MenuItem
                  key={n.style}
                  label={n.label}
                  checked={editor.isActive("orderedList") && (editor.getAttributes("orderedList").listStyle ?? "decimal") === n.style}
                  onClick={() => (close(), listWith("orderedList", n.style))}
                />
              ))
            }
          />
          <Tool icon={ListTree} label="Multilevel list (coming soon)" disabled onClick={() => {}} />
          <Tool icon={IndentDecrease} label="Decrease indent" onClick={() => run().outdent().run()} />
          <Tool icon={IndentIncrease} label="Increase indent" onClick={() => run().indent().run()} />
          <Tool
            icon={ArrowDownAZ}
            label="Sort A to Z (again for Z to A)"
            onClick={() => {
              if (!sortBlocks(editor)) p.onError("To sort, select two or more paragraphs, or put the cursor in a list.");
            }}
          />
          <Tool icon={Pilcrow} label="Show paragraph marks" active={p.showMarks} onClick={p.onShowMarks} />
        </Row>
        <Row>
          <Tool icon={AlignLeft} label="Align left (Ctrl+L)" active={editor.isActive({ textAlign: "left" })} onClick={() => run().setTextAlign("left").run()} />
          <Tool icon={AlignCenter} label="Centre (Ctrl+E)" active={editor.isActive({ textAlign: "center" })} onClick={() => run().setTextAlign("center").run()} />
          <Tool icon={AlignRight} label="Align right (Ctrl+R)" active={editor.isActive({ textAlign: "right" })} onClick={() => run().setTextAlign("right").run()} />
          <Tool icon={AlignJustify} label="Justify (Ctrl+J)" active={editor.isActive({ textAlign: "justify" })} onClick={() => run().setTextAlign("justify").run()} />
          <MenuButton
            icon={ArrowUpDown}
            label="Line spacing"
            menu={(close) =>
              SPACINGS.map((s) => (
                <MenuItem
                  key={s}
                  label={s}
                  checked={attrs.lineHeight === s}
                  onClick={() => (close(), run().setLineHeight(s).run())}
                />
              ))
            }
          />
          <Split
            icon={PaintBucket}
            label="Shading"
            colour={shade}
            onClick={() => run().setShading(shade).run()}
            menu={(close) => (
              <ColourPicker
                current={attrs.shading}
                noneLabel="No colour"
                onPick={(value) => {
                  close();
                  if (value) setShade(value);
                  run().setShading(value).run();
                }}
              />
            )}
          />
          <Split
            icon={Grid2x2}
            label="Borders"
            onClick={() => run().setBorder(border).run()}
            menu={(close) =>
              BORDERS.map((b) => (
                <MenuItem
                  key={b.label}
                  label={b.label}
                  checked={(attrs.border ?? null) === b.border}
                  onClick={() => {
                    close();
                    if (b.border) setBorder(b.border);
                    run().setBorder(b.border).run();
                  }}
                />
              ))
            }
          />
        </Row>
      </Stack>
    </Group>
  );
}

// ---- Styles ----

interface StyleTile {
  id: string;
  label: string;
  /** How the sample text looks in the gallery. */
  sample: CSSProperties;
  isActive: (editor: Editor) => boolean;
  apply: (editor: Editor) => void;
}

/** Back to a plain paragraph first, so styles don't pile up. */
function asParagraph(editor: Editor, styleName: StyleName | null) {
  const chain = editor.chain().focus();
  if (editor.isActive("blockquote")) chain.lift("blockquote");
  chain.setParagraph().setStyleName(styleName).run();
}

const heading = (level: 1 | 2 | 3): StyleTile => ({
  id: `h${level}`,
  label: `Heading ${level}`,
  sample: { fontSize: [0, 15, 13, 12][level], fontWeight: 700, color: "#1e3a8a" },
  isActive: (e) => e.isActive("heading", { level }),
  apply: (e) => e.chain().focus().setHeading({ level }).run(),
});

const STYLE_TILES: StyleTile[] = [
  {
    id: "normal",
    label: "Normal",
    sample: { fontSize: 11 },
    isActive: (e) => e.isActive("paragraph", { styleName: null }) && !e.isActive("blockquote"),
    apply: (e) => asParagraph(e, null),
  },
  heading(1),
  heading(2),
  heading(3),
  {
    id: "title",
    label: "Title",
    sample: { fontSize: 17, fontWeight: 300 },
    isActive: (e) => e.isActive("paragraph", { styleName: "title" }),
    apply: (e) => asParagraph(e, "title"),
  },
  {
    id: "subtitle",
    label: "Subtitle",
    sample: { fontSize: 12, color: "#64748b" },
    isActive: (e) => e.isActive("paragraph", { styleName: "subtitle" }),
    apply: (e) => asParagraph(e, "subtitle"),
  },
  {
    id: "quote",
    label: "Quote",
    sample: { fontSize: 11, fontStyle: "italic", color: "#475569" },
    isActive: (e) => e.isActive("blockquote"),
    apply: (e) => {
      if (!e.isActive("blockquote")) e.chain().focus().setParagraph().setStyleName(null).toggleBlockquote().run();
    },
  },
];

/** How many styles show at once; the arrows page through the rest. */
const PER_PAGE = 3;

function StylesGroup({ editor }: { editor: Editor }) {
  const [page, setPage] = useState(0);
  const [all, setAll] = useState(false);
  const pages = Math.ceil(STYLE_TILES.length / PER_PAGE);
  const shown = STYLE_TILES.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  const tile = (s: StyleTile, close?: () => void) => {
    const active = s.isActive(editor);
    return (
      <button
        key={s.id}
        type="button"
        title={s.label}
        aria-pressed={active}
        onMouseDown={keepFocus}
        onClick={() => {
          close?.();
          s.apply(editor);
        }}
        className={`flex h-[52px] w-[78px] flex-col justify-between overflow-hidden rounded border px-1.5 py-1 text-left ${
          active ? "border-blue-500 bg-blue-50" : "border-transparent bg-surface hover:border-slate-300"
        }`}
      >
        <span className="truncate leading-tight text-slate-900" style={s.sample}>
          AaBbCc
        </span>
        <span className="truncate text-[11px] text-slate-600">¶ {s.label}</span>
      </button>
    );
  };

  return (
    <Group label="Styles">
      <div className="relative flex rounded border border-slate-200 bg-slate-100">
        <div className="flex gap-0.5 p-0.5">{shown.map((s) => tile(s))}</div>
        <div className="flex flex-col border-l border-slate-200">
          <ArrowButton icon={ChevronUp} label="Previous styles" disabled={page === 0} onClick={() => setPage((n) => n - 1)} />
          <ArrowButton icon={ChevronDown} label="More styles" disabled={page >= pages - 1} onClick={() => setPage((n) => n + 1)} />
          <ArrowButton icon={ChevronsDown} label="All styles" onClick={() => setAll((o) => !o)} />
        </div>
        <Drop open={all} onClose={() => setAll(false)} align="right">
          <div className="grid grid-cols-4 gap-1">{STYLE_TILES.map((s) => tile(s, () => setAll(false)))}</div>
        </Drop>
      </div>
    </Group>
  );
}

function ArrowButton(p: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={p.label}
      aria-label={p.label}
      disabled={p.disabled}
      onMouseDown={keepFocus}
      onClick={p.onClick}
      className="flex h-[18px] w-4 flex-1 items-center justify-center hover:bg-slate-200 disabled:opacity-30"
    >
      <p.icon size={11} />
    </button>
  );
}
