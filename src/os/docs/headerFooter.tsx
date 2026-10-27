"use client";

// Headers and footers, as in Word: the same on every page (or a different one on the first page),
// half an inch from the top and bottom of the paper, with page numbers each page fills in for
// itself. Double-click the top or bottom margin of a page to edit them; the body is dimmed
// meanwhile, and clicking it goes back to the body.

import { DOMParser as SchemaParser, DOMSerializer, type Schema } from "@tiptap/pm/model";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { editorExtensions } from "./editorSetup";
import type { HeadersFooters } from "./layout";

export type Part = "header" | "footer";

/** The header or footer being edited, and on which page. */
export interface HfTarget {
  part: Part;
  first: boolean;
  page: number;
}

/** Word's "Header from Top" and "Footer from Bottom": half an inch. */
export const HF_DISTANCE = 48;

export const hfKey = (part: Part, first: boolean): keyof Omit<HeadersFooters, "differentFirst"> =>
  first ? (part === "header" ? "firstHeader" : "firstFooter") : part;

/** The header or footer a page shows. */
export const hfFor = (h: HeadersFooters, part: Part, page: number) => h[hfKey(part, h.differentFirst && page === 0)];

/** Nothing but empty lines (or nothing at all). */
export const isBlank = (html: string) => !html.replace(/<p[^>]*>(\s|<br[^>]*>)*<\/p>/g, "").trim();

const safe = new Map<string, string>();

/**
 * A header or footer as HTML that's safe to show: read through the document's own schema, as the
 * editor would, so only what a document can hold comes through (no scripts, say, from a Word file).
 */
export function safeHtml(schema: Schema, html: string) {
  if (isBlank(html)) return "";
  const cached = safe.get(html);
  if (cached !== undefined) return cached;
  const body = new window.DOMParser().parseFromString(html, "text/html").body;
  const doc = SchemaParser.fromSchema(schema).parse(body);
  const out = document.createElement("div");
  out.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(doc.content));
  if (safe.size > 40) safe.clear();
  safe.set(html, out.innerHTML);
  return out.innerHTML;
}

/** Each page's own number, and how many there are, in its page number fields. */
export const fillFields = (html: string, page: number, pages: number) =>
  html.replace(/<span data-field="(page|pages)"[^>]*><\/span>/g, (_, kind: string) => `<span data-field="${kind}">${kind === "page" ? page : pages}</span>`);

/** A page's header and footer, drawn on its sheet of paper. */
export function PageHeaders(p: {
  headers: HeadersFooters;
  schema: Schema;
  page: number;
  pages: number;
  height: number;
  text: { left: number; width: number };
  /** The part being edited on this page, which its editor shows instead. */
  hidden?: Part | null;
}) {
  const show = (part: Part) => {
    if (p.hidden === part) return null;
    const html = safeHtml(p.schema, hfFor(p.headers, part, p.page));
    if (!html) return null;
    return (
      <div
        // "ProseMirror" gives it the document's look (design.ts); the editor's own styles would make it relative.
        className="docs-hf ProseMirror opacity-60"
        style={{
          position: "absolute",
          left: p.text.left,
          width: p.text.width,
          ...(part === "header" ? { top: HF_DISTANCE } : { bottom: HF_DISTANCE }),
        }}
        dangerouslySetInnerHTML={{ __html: fillFields(html, p.page + 1, p.pages) }}
      />
    );
  };
  return (
    <>
      {show("header")}
      {show("footer")}
    </>
  );
}

const LABELS: Record<Part, string> = { header: "Header", footer: "Footer" };

/** Editing a header or footer, in its place on the page. */
export function HeaderFooterEditor(p: {
  target: HfTarget;
  html: string;
  /** Where the page starts, and its height, in the sheet's pixels. */
  top: number;
  height: number;
  text: { left: number; width: number };
  onChange: (html: string) => void;
  onEditor: (editor: Editor | null) => void;
  onClose: () => void;
}) {
  const { part, first } = p.target;
  const onChange = useRef(p.onChange);
  onChange.current = p.onChange;
  const editor = useEditor({
    extensions: editorExtensions(`Type the ${LABELS[part].toLowerCase()}…`),
    content: p.html,
    immediatelyRender: false,
    autofocus: "end",
    editorProps: { attributes: { class: "docs-hf select-text", spellcheck: "true" } },
    onUpdate: ({ editor }) => onChange.current(editor.isEmpty ? "" : editor.getHTML()),
  });
  const { onEditor } = p;
  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor, onEditor]);

  const label = `${first ? "First Page " : ""}${LABELS[part]}`;
  return (
    <div
      className="docs-hf-edit absolute z-20"
      style={{
        left: p.text.left,
        width: p.text.width,
        ...(part === "header" ? { top: p.top + HF_DISTANCE } : { top: p.top + p.height - HF_DISTANCE, transform: "translateY(-100%)" }),
      }}
      onKeyDown={(e) => e.key === "Escape" && p.onClose()}
    >
      {/* Word's dashed line between the header or footer and the body, with its name on it */}
      <div className={`pointer-events-none absolute inset-x-[-12px] border-dashed border-blue-500 ${part === "header" ? "-bottom-1.5 border-b" : "-top-1.5 border-t"}`}>
        <span className={`absolute left-0 rounded-sm bg-blue-100 px-1.5 text-[11px] leading-4 text-blue-800 ${part === "header" ? "top-0" : "-top-4"}`}>{label}</span>
      </div>
      <EditorContent editor={editor} lang="en" />
    </div>
  );
}
