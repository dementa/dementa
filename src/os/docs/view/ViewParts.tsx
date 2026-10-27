"use client";

// Parts of the View tab around the page: the Navigation Pane (headings, pages and search
// results), Line Focus (Immersive Reader), and Read Mode's bar.

import type { Editor } from "@tiptap/react";
import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Drop, keepFocus } from "../ribbon/parts";

// ---- Navigation Pane ----

interface HeadingLine {
  text: string;
  level: number;
  pos: number;
}

function headingsOf(editor: Editor): HeadingLine[] {
  const list: HeadingLine[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      if (node.textContent.trim()) list.push({ text: node.textContent.trim(), level: node.attrs.level, pos });
      return false;
    }
    if (node.isTextblock) return false;
  });
  return list;
}

export function NavigationPane(p: { editor: Editor; pages: number; atPage: number; onPage: (index: number) => void; onClose: () => void }) {
  const { editor } = p;
  const [tab, setTab] = useState<"headings" | "pages" | "results">("headings");
  const [query, setQuery] = useState("");
  const [, redraw] = useState(0);
  useEffect(() => {
    const update = () => redraw((n) => n + 1);
    editor.on("transaction", update);
    return () => {
      editor.off("transaction", update);
    };
  }, [editor]);

  const headings = headingsOf(editor);
  const here = editor.state.selection.from;
  const current = [...headings].reverse().find((h) => h.pos <= here);
  const go = (from: number, to = from + 1) => editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const found: { from: number; to: number; before: string; match: string; after: string }[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (!node.isTextblock) return;
      const text = node.textContent;
      const lower = text.toLowerCase();
      for (let i = lower.indexOf(q); i >= 0 && found.length < 200; i = lower.indexOf(q, i + q.length)) {
        found.push({ from: pos + 1 + i, to: pos + 1 + i + q.length, before: text.slice(Math.max(0, i - 30), i), match: text.slice(i, i + q.length), after: text.slice(i + q.length, i + q.length + 40) });
      }
      return false;
    });
    return found;
    // The document changing is the editor's state changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, editor, editor.state.doc]);

  const pageText = (index: number) => {
    // The first words on each page, found on the screen.
    const sheet = editor.view.dom.closest<HTMLElement>(".docs-sheet");
    const page = sheet?.querySelectorAll<HTMLElement>(".docs-page-sheet")[index];
    if (!sheet || !page) return "";
    const top = page.getBoundingClientRect().top;
    const bottom = page.getBoundingClientRect().bottom;
    const block = [...editor.view.dom.querySelectorAll<HTMLElement>("p, h1, h2, h3, h4, h5, h6")].find((b) => {
      const r = b.getBoundingClientRect();
      return r.top >= top && r.top < bottom && b.textContent?.trim();
    });
    return block?.textContent?.trim().slice(0, 60) ?? "";
  };

  return (
    <aside aria-label="Navigation" className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-surface text-sm text-slate-800">
      <div className="flex items-center justify-between px-3 pt-2">
        <h2 className="font-semibold">Navigation</h2>
        <button type="button" title="Close" aria-label="Close" onClick={p.onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100">
          <X size={15} />
        </button>
      </div>
      <label className="mx-3 mt-2 flex items-center gap-1.5 rounded border border-slate-300 px-2">
        <Search size={13} className="text-slate-400" />
        <input
          value={query}
          placeholder="Search document"
          onChange={(e) => {
            setQuery(e.target.value);
            setTab("results");
          }}
          className="min-w-0 flex-1 bg-transparent py-1 outline-none"
        />
      </label>
      <div role="tablist" className="mx-3 mt-2 flex gap-3 border-b border-slate-200 text-xs">
        {(["headings", "pages", "results"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px border-b-2 pb-1 capitalize ${tab === t ? "border-blue-600 font-semibold text-blue-700" : "border-transparent text-slate-500"}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === "headings" &&
          (headings.length ? (
            headings.map((h) => (
              <button
                key={h.pos}
                type="button"
                onClick={() => go(h.pos + 1)}
                className={`block w-full truncate rounded px-2 py-1 text-left hover:bg-slate-100 ${current?.pos === h.pos ? "bg-blue-50 font-medium text-blue-800" : ""}`}
                style={{ paddingLeft: 8 + (h.level - 1) * 14 }}
              >
                {h.text}
              </button>
            ))
          ) : (
            <p className="p-2 text-slate-500">Create an interactive outline of your document: use Heading styles for its titles.</p>
          ))}
        {tab === "pages" && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: p.pages }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => p.onPage(i)}
                className={`flex flex-col items-start rounded border px-2 py-1.5 text-left hover:bg-slate-50 ${p.atPage === i + 1 ? "border-blue-500" : "border-slate-200"}`}
              >
                <span className="text-xs font-semibold">Page {i + 1}</span>
                <span className="line-clamp-2 text-xs text-slate-500">{pageText(i) || "(empty)"}</span>
              </button>
            ))}
          </div>
        )}
        {tab === "results" &&
          (query.trim() ? (
            <>
              <p className="px-1 pb-1 text-xs text-slate-500">{results.length} results</p>
              {results.map((r) => (
                <button key={r.from} type="button" onClick={() => go(r.from, r.to)} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-100">
                  {r.before}
                  <mark className="bg-yellow-200">{r.match}</mark>
                  {r.after}
                </button>
              ))}
            </>
          ) : (
            <p className="p-2 text-slate-500">Search for text in the document.</p>
          ))}
      </div>
    </aside>
  );
}

// ---- Line Focus ----

/** Dims everything but a few lines around the cursor (Immersive Reader › Line Focus). */
export function LineFocus({ editor, lines }: { editor: Editor; lines: number }) {
  const [band, setBand] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const measure = () => {
      const sheet = editor.view.dom.closest<HTMLElement>(".docs-sheet");
      if (!sheet) return;
      const origin = sheet.getBoundingClientRect();
      const scale = origin.width / sheet.offsetWidth || 1;
      const at = editor.view.coordsAtPos(editor.state.selection.head);
      const lineHeight = (at.bottom - at.top) / scale || 24;
      const middle = ((at.top + at.bottom) / 2 - origin.top) / scale;
      const height = lineHeight * lines * 1.25;
      setBand({ top: middle - height / 2, height });
    };
    measure();
    editor.on("transaction", measure);
    return () => {
      editor.off("transaction", measure);
    };
  }, [editor, lines]);
  if (!band) return null;
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[15] bg-black/70" style={{ height: Math.max(0, band.top) }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[15] bg-black/70" style={{ top: band.top + band.height }} />
    </>
  );
}

// ---- Read Mode ----

export type ColumnWidth = "narrow" | "moderate" | "wide" | "full";
export type PageTint = "none" | "sepia" | "inverse";

export const COLUMN_WIDTHS: Record<ColumnWidth, number | null> = { narrow: 520, moderate: 680, wide: 860, full: null };

/** Read Mode's bar: the document's name, View settings, and the way out. */
export function ReadModeBar(p: {
  title: string;
  column: ColumnWidth;
  onColumn: (c: ColumnWidth) => void;
  tint: PageTint;
  onTint: (t: PageTint) => void;
  nav: boolean;
  onNav: () => void;
  onFind: () => void;
  onExit: () => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-slate-200 bg-surface px-2 py-1 text-sm text-slate-700">
      <Menu label="Tools">
        {(close) => <Item onClick={() => (close(), p.onFind())}>Find</Item>}
      </Menu>
      <Menu label="View">
        {(close) => (
          <>
            <Item checked={p.nav} onClick={() => (close(), p.onNav())}>
              Navigation Pane
            </Item>
            <p className="px-2 pt-2 text-xs font-semibold text-slate-500">Column Width</p>
            {(["narrow", "moderate", "wide", "full"] as const).map((c) => (
              <Item key={c} checked={p.column === c} onClick={() => (close(), p.onColumn(c))}>
                {c === "full" ? "Wide (full screen)" : c[0].toUpperCase() + c.slice(1)}
              </Item>
            ))}
            <p className="px-2 pt-2 text-xs font-semibold text-slate-500">Page Color</p>
            {(["none", "sepia", "inverse"] as const).map((t) => (
              <Item key={t} checked={p.tint === t} onClick={() => (close(), p.onTint(t))}>
                {t[0].toUpperCase() + t.slice(1)}
              </Item>
            ))}
          </>
        )}
      </Menu>
      <span className="min-w-0 flex-1 truncate text-center font-medium">{p.title}</span>
      <button type="button" onClick={p.onExit} title="Exit Read Mode (Esc)" className="rounded px-2 py-1 hover:bg-slate-100">
        Exit Read Mode
      </button>
    </div>
  );
}

function Menu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button type="button" onMouseDown={keepFocus} onClick={() => setOpen(!open)} className="flex items-center gap-0.5 rounded px-2 py-1 hover:bg-slate-100">
        {label} <ChevronDown size={12} />
      </button>
      <Drop open={open} onClose={() => setOpen(false)}>
        <div className="w-52">{children(() => setOpen(false))}</div>
      </Drop>
    </span>
  );
}

const Item = ({ onClick, checked, children }: { onClick: () => void; checked?: boolean; children: ReactNode }) => (
  <button type="button" onMouseDown={keepFocus} onClick={onClick} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-slate-100">
    <span className="w-3 text-blue-700">{checked ? "✓" : ""}</span>
    {children}
  </button>
);
