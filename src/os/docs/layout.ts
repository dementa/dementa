// Page setup (the Layout tab): paper size, orientation, margins, columns, line numbers and
// hyphenation, saved with each document along with its design (the Design tab). Sizes are in
// screen pixels (96 per inch).

import { DEFAULT_DESIGN, parseDesign, type DocDesign } from "./design";
import { NO_MERGE, parseMailMerge, type MailMerge } from "./mailMerge";
import { parseComments, type Comment } from "./review/comments";
import { NO_REFERENCES, parseReferences, type References } from "./references";

export type Orientation = "portrait" | "landscape";

export interface Sides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LineNumbering {
  /** The first line's number. */
  start: number;
  /** Only every nth number is shown (Word's "Count by"). */
  countBy: number;
  /** Starting again from `start` on each page. */
  perPage?: boolean;
}

/** Headers and footers (HTML), the same on every page, or a different one on the first page. */
export interface HeadersFooters {
  header: string;
  footer: string;
  firstHeader: string;
  firstFooter: string;
  differentFirst: boolean;
}

export const NO_HEADERS: HeadersFooters = { header: "", footer: "", firstHeader: "", firstFooter: "", differentFirst: false };

export interface PageLayout {
  /** The paper as it's held upright. */
  width: number;
  height: number;
  orientation: Orientation;
  margins: Sides;
  columns: number;
  /** Space between columns. */
  columnGap: number;
  /** A line drawn between columns. */
  columnLine: boolean;
  lineNumbers: LineNumbering | null;
  hyphenate: boolean;
  design: DocDesign;
  headers: HeadersFooters;
  /** Sources for citations, and the citation style (References tab). */
  references: References;
  /** Mailings: the recipient list and the kind of merge. */
  mailMerge: MailMerge;
  /** Review: comments, Track Changes and Restrict Editing. */
  review: ReviewSettings;
}

export type Protection = "none" | "readonly" | "tracked" | "comments";

export interface ReviewSettings {
  comments: Comment[];
  tracking: boolean;
  protection: Protection;
  /** SHA-256 of the password that stops protection ("" for none). */
  password: string;
  /** The proofing language ("" for none: don't check spelling). */
  language: string;
}

export const NO_REVIEW: ReviewSettings = { comments: [], tracking: false, protection: "none", password: "", language: "en" };

const IN = 96;
const MM = 96 / 25.4;

/** Word's paper sizes, upright. */
export const PAGE_SIZES = [
  { id: "letter", label: "Letter", w: 8.5 * IN, h: 11 * IN },
  { id: "legal", label: "Legal", w: 8.5 * IN, h: 14 * IN },
  { id: "executive", label: "Executive", w: 7.25 * IN, h: 10.5 * IN },
  { id: "tabloid", label: "Tabloid", w: 11 * IN, h: 17 * IN },
  { id: "a3", label: "A3", w: 297 * MM, h: 420 * MM },
  { id: "a4", label: "A4", w: 210 * MM, h: 297 * MM },
  { id: "a5", label: "A5", w: 148 * MM, h: 210 * MM },
  { id: "b5", label: "B5 (JIS)", w: 182 * MM, h: 257 * MM },
] as const;

/** Word's margin choices. */
export const MARGIN_PRESETS: { id: string; label: string; sides: Sides }[] = [
  { id: "normal", label: "Normal", sides: { top: IN, right: IN, bottom: IN, left: IN } },
  { id: "narrow", label: "Narrow", sides: { top: IN / 2, right: IN / 2, bottom: IN / 2, left: IN / 2 } },
  { id: "moderate", label: "Moderate", sides: { top: IN, right: 0.75 * IN, bottom: IN, left: 0.75 * IN } },
  { id: "wide", label: "Wide", sides: { top: IN, right: 2 * IN, bottom: IN, left: 2 * IN } },
];

export const MAX_COLUMNS = 4;

const A4 = PAGE_SIZES[5];

export const DEFAULT_LAYOUT: PageLayout = {
  width: A4.w,
  height: A4.h,
  orientation: "portrait",
  margins: MARGIN_PRESETS[0].sides,
  columns: 1,
  columnGap: IN / 2,
  columnLine: false,
  lineNumbers: null,
  hyphenate: false,
  design: DEFAULT_DESIGN,
  headers: NO_HEADERS,
  references: NO_REFERENCES,
  mailMerge: NO_MERGE,
  review: NO_REVIEW,
};

const near = (a: number, b: number) => Math.abs(a - b) < 1;

/** The named paper size a layout uses, if any. */
export const sizeOf = (l: PageLayout) => PAGE_SIZES.find((s) => near(s.w, l.width) && near(s.h, l.height));

/** The named margins a layout uses, if any. */
export const marginsOf = (l: PageLayout) =>
  MARGIN_PRESETS.find((m) => (["top", "right", "bottom", "left"] as const).every((side) => near(m.sides[side], l.margins[side])));

/** Width and height of the page on screen. */
export function pageBox(layout: PageLayout) {
  const { width: w, height: h } = layout;
  return layout.orientation === "portrait" ? { w, h } : { w: h, h: w };
}

/** The width that text can take up, between the left and right margins. */
export const textWidth = (layout: PageLayout) => pageBox(layout).w - layout.margins.left - layout.margins.right;

/** Centimetres, or inches where people use them, for the sizes the Layout tab shows. */
export function measureUnit(): { name: "cm" | "in"; px: number; step: number } {
  const lang = typeof navigator === "undefined" ? "" : navigator.language;
  return /^en-(US|LR)|^my\b/i.test(lang) ? { name: "in", px: IN, step: 0.1 } : { name: "cm", px: IN / 2.54, step: 0.1 };
}

const clamp = (n: unknown, min: number, max: number, fallback: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;

/** Anything read back from a document (it may be damaged, or written by an older Docs) → a layout. */
export function parseLayout(value: unknown): PageLayout {
  if (typeof value === "string") {
    if (value.trim().startsWith("{")) {
      try {
        return parseLayout(JSON.parse(value));
      } catch {
        return DEFAULT_LAYOUT;
      }
    }
    return fromWords(value);
  }
  if (!value || typeof value !== "object") return DEFAULT_LAYOUT;
  const v = value as Record<string, unknown>;
  // Older Docs kept named choices: { size: "a4", orientation, margins: "normal" }.
  if (typeof v.size === "string") return fromWords(`${v.size} ${v.orientation} ${v.margins}`);
  const d = DEFAULT_LAYOUT;
  const m = (v.margins ?? {}) as Record<string, unknown>;
  const lines = v.lineNumbers as Record<string, unknown> | null | undefined;
  return {
    width: clamp(v.width, IN, 22 * IN, d.width),
    height: clamp(v.height, IN, 22 * IN, d.height),
    orientation: v.orientation === "landscape" ? "landscape" : "portrait",
    margins: {
      top: clamp(m.top, 0, 10 * IN, d.margins.top),
      right: clamp(m.right, 0, 10 * IN, d.margins.right),
      bottom: clamp(m.bottom, 0, 10 * IN, d.margins.bottom),
      left: clamp(m.left, 0, 10 * IN, d.margins.left),
    },
    columns: Math.round(clamp(v.columns, 1, MAX_COLUMNS, 1)),
    columnGap: clamp(v.columnGap, 0, 4 * IN, d.columnGap),
    columnLine: v.columnLine === true,
    lineNumbers:
      lines && typeof lines === "object"
        ? { start: Math.round(clamp(lines.start, 1, 32767, 1)), countBy: Math.round(clamp(lines.countBy, 1, 100, 1)), perPage: lines.perPage === true }
        : null,
    hyphenate: v.hyphenate === true,
    design: parseDesign(v.design),
    headers: parseHeaders(v.headers),
    references: parseReferences(v.references),
    mailMerge: parseMailMerge(v.mailMerge),
    review: parseReview(v.review),
  };
}

function parseReview(value: unknown): ReviewSettings {
  if (!value || typeof value !== "object") return NO_REVIEW;
  const v = value as Record<string, unknown>;
  const modes: Protection[] = ["none", "readonly", "tracked", "comments"];
  return {
    comments: parseComments(v.comments),
    tracking: v.tracking === true,
    protection: modes.includes(v.protection as Protection) ? (v.protection as Protection) : "none",
    password: typeof v.password === "string" ? v.password : "",
    language: typeof v.language === "string" ? v.language.slice(0, 12) : "en",
  };
}

function parseHeaders(value: unknown): HeadersFooters {
  if (!value || typeof value !== "object") return NO_HEADERS;
  const v = value as Record<string, unknown>;
  const text = (x: unknown) => (typeof x === "string" ? x : "");
  return {
    header: text(v.header),
    footer: text(v.footer),
    firstHeader: text(v.firstHeader),
    firstFooter: text(v.firstFooter),
    differentFirst: v.differentFirst === true,
  };
}

/** "a4 portrait normal": how older Docs wrote layouts into saved documents. */
function fromWords(text: string): PageLayout {
  const words = text.split(/\s+/);
  const size = PAGE_SIZES.find((s) => words.includes(s.id)) ?? A4;
  const margins = MARGIN_PRESETS.find((m) => words.includes(m.id)) ?? MARGIN_PRESETS[0];
  // Older "wide" margins were 1.5 inches all round.
  const sides = words.includes("wide") ? { top: 1.5 * IN, right: 1.5 * IN, bottom: 1.5 * IN, left: 1.5 * IN } : margins.sides;
  return { ...DEFAULT_LAYOUT, width: size.w, height: size.h, orientation: words.includes("landscape") ? "landscape" : "portrait", margins: sides };
}

/** How a layout is written into saved documents. */
export const layoutText = (l: PageLayout) => JSON.stringify(l);
