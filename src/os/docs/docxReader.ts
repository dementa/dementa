// Reads a Word document (.docx) made anywhere else into Docs, keeping how it looks: fonts, sizes,
// colours, alignment, spacing, indents, Word's styles (with their real look), lists with their
// bullet and number styles, tables (widths, merged cells, cell colours, borders), pictures (in line
// with, in front of or behind the text), links, page and column breaks, and the page setup: size,
// orientation, margins, columns, line numbers and hyphenation.
//
// A .docx is a zip of XML files: word/document.xml (the text), styles.xml (styles and the document's
// default font), numbering.xml (lists), theme1.xml (theme fonts), _rels (where pictures and links
// point) and media/ (the pictures). Everything is written as the inline styles Docs' editor reads.

import type JSZip from "jszip";
import { DEFAULT_DESIGN, DEFAULT_WATERMARK, type BorderStyle, type DocDesign, type Watermark } from "./design";
import { DEFAULT_LAYOUT, NO_HEADERS, NO_REVIEW, type HeadersFooters, type PageLayout } from "./layout";
import { NO_MERGE } from "./mailMerge";
import { NO_REFERENCES } from "./references";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** Word measures most things in twentieths of a point: 15 to a screen pixel. */
const TWIPS_PER_PX = 15;
/** …and drawings in EMUs: 9525 to a screen pixel. */
const EMUS_PER_PX = 9525;

// ---- XML helpers ----

const kids = (el: Element | null | undefined, name?: string): Element[] =>
  el ? Array.from(el.children).filter((c) => !name || c.localName === name) : [];
const kid = (el: Element | null | undefined, name: string): Element | null => kids(el, name)[0] ?? null;
/** The first element with this name anywhere inside. */
const find = (el: Element | null | undefined, name: string): Element | null => (el ? (el.getElementsByTagNameNS("*", name)[0] ?? null) : null);

/** A w: attribute (Word writes them with the namespace, a few tools without). */
function attr(el: Element | null | undefined, name: string, ns = W): string | null {
  if (!el) return null;
  return el.getAttributeNS(ns, name) ?? el.getAttribute(`w:${name}`) ?? el.getAttribute(name);
}

const num = (value: string | null) => {
  const n = Number(value);
  return value !== null && Number.isFinite(n) ? n : null;
};

/** On/off settings like <w:b/> or <w:b w:val="false"/>; null when the element isn't there. */
function toggle(el: Element | null): boolean | null {
  if (!el) return null;
  const v = attr(el, "val");
  return !(v === "0" || v === "false" || v === "off");
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const px = (twips: number) => Math.round((twips / TWIPS_PER_PX) * 10) / 10;

/** "FF0000" → "#ff0000"; "auto" or nonsense → null. */
const hex = (value: string | null) => (value && /^[0-9a-f]{6}$/i.test(value) ? `#${value.toLowerCase()}` : null);

// ---- Formatting ----

interface RunProps {
  font?: string;
  /** Points. */
  size?: number;
  colour?: string | null;
  highlight?: string | null;
  bold?: boolean;
  italic?: boolean;
  underline?: string | null;
  strike?: boolean;
  vertAlign?: "superscript" | "subscript" | null;
  caps?: boolean;
  hidden?: boolean;
}

interface ParaProps {
  align?: string;
  /** All in pixels. */
  left?: number;
  right?: number;
  firstLine?: number;
  before?: number;
  after?: number;
  /** A multiple ("1.15") or a height ("18px"). */
  lineHeight?: string;
  shading?: string | null;
  border?: "top" | "bottom" | "box" | null;
  pageBreakBefore?: boolean;
  noLineNumbers?: boolean;
  numId?: string;
  ilvl?: number;
}

/** Word's highlighter colours. */
const HIGHLIGHTS: Record<string, string> = {
  yellow: "#ffff00", green: "#00ff00", cyan: "#00ffff", magenta: "#ff00ff", blue: "#0000ff", red: "#ff0000",
  darkBlue: "#000080", darkCyan: "#008080", darkGreen: "#008000", darkMagenta: "#800080", darkRed: "#800000",
  darkYellow: "#808000", darkGray: "#808080", lightGray: "#c0c0c0", black: "#000000", white: "#ffffff",
};

const UNDERLINES: Record<string, string> = {
  single: "solid", words: "solid", thick: "solid", double: "double", dotted: "dotted", dottedHeavy: "dotted",
  dash: "dashed", dashedHeavy: "dashed", dashLong: "dashed", dotDash: "dashed", dotDotDash: "dashed", wave: "wavy", wavyHeavy: "wavy", wavyDouble: "wavy",
};

const ALIGN: Record<string, string> = { left: "left", start: "left", center: "center", right: "right", end: "right", both: "justify", distribute: "justify" };

// ---- The document's parts ----

interface Style {
  type: string;
  name: string;
  basedOn: string | null;
  pPr: Element | null;
  rPr: Element | null;
  tblPr: Element | null;
}

interface Level {
  format: string;
  text: string;
  /** The first number. */
  start: number;
}

interface Context {
  styles: Map<string, Style>;
  defaultPara: string | null;
  defaults: { run: RunProps; para: ParaProps };
  /** numId → its levels. */
  lists: Map<string, Level[]>;
  rels: Map<string, { target: string; external: boolean }>;
  themeFonts: { major?: string; minor?: string };
  /** Font name → its generic family, for when the computer doesn't have it. */
  fontFamilies: Map<string, string>;
  zip: JSZip;
  pictures: Map<string, string>;
  /** The width between the page's margins, in twips. */
  textWidth: number;
  /** Footnotes' and endnotes' text, by id. */
  notes: { footnote: Map<string, string>; endnote: Map<string, string> };
  /** Comments by id, and the ones the text uses. */
  comments: Map<string, { author: string; date: string; text: string }>;
  usedComments: Set<string>;
}

function readRunProps(rPr: Element | null, ctx: Pick<Context, "themeFonts">, into: RunProps = {}): RunProps {
  if (!rPr) return into;
  const out = { ...into };
  const fonts = kid(rPr, "rFonts");
  if (fonts) {
    const theme = attr(fonts, "asciiTheme") ?? attr(fonts, "hAnsiTheme");
    const font = attr(fonts, "ascii") ?? attr(fonts, "hAnsi") ?? (theme ? (theme.startsWith("major") ? ctx.themeFonts.major : ctx.themeFonts.minor) : undefined);
    if (font) out.font = font;
  }
  const size = num(attr(kid(rPr, "sz"), "val"));
  if (size) out.size = size / 2;
  const colour = kid(rPr, "color");
  if (colour) out.colour = hex(attr(colour, "val"));
  const highlight = kid(rPr, "highlight");
  if (highlight) out.highlight = HIGHLIGHTS[attr(highlight, "val") ?? ""] ?? null;
  const shading = hex(attr(kid(rPr, "shd"), "fill"));
  if (shading && shading !== "#ffffff" && !out.highlight) out.highlight = shading;
  const b = toggle(kid(rPr, "b"));
  if (b !== null) out.bold = b;
  const i = toggle(kid(rPr, "i"));
  if (i !== null) out.italic = i;
  const u = kid(rPr, "u");
  if (u) {
    const v = attr(u, "val") ?? "single";
    out.underline = v === "none" ? null : (UNDERLINES[v] ?? "solid");
  }
  const strike = toggle(kid(rPr, "strike")) ?? toggle(kid(rPr, "dstrike"));
  if (strike !== null) out.strike = strike;
  const va = attr(kid(rPr, "vertAlign"), "val");
  if (va) out.vertAlign = va === "superscript" || va === "subscript" ? va : null;
  const caps = toggle(kid(rPr, "caps"));
  if (caps !== null) out.caps = caps;
  const hidden = toggle(kid(rPr, "vanish"));
  if (hidden !== null) out.hidden = hidden;
  return out;
}

function readParaProps(pPr: Element | null, into: ParaProps = {}): ParaProps {
  if (!pPr) return into;
  const out = { ...into };
  const jc = attr(kid(pPr, "jc"), "val");
  if (jc) out.align = ALIGN[jc] ?? "left";
  const ind = kid(pPr, "ind");
  if (ind) {
    const left = num(attr(ind, "left") ?? attr(ind, "start"));
    if (left !== null) out.left = px(left);
    const right = num(attr(ind, "right") ?? attr(ind, "end"));
    if (right !== null) out.right = px(right);
    const first = num(attr(ind, "firstLine"));
    const hanging = num(attr(ind, "hanging"));
    if (hanging !== null) out.firstLine = -px(hanging);
    else if (first !== null) out.firstLine = px(first);
  }
  const suppress = toggle(kid(pPr, "suppressLineNumbers"));
  if (suppress !== null) out.noLineNumbers = suppress;
  const spacing = kid(pPr, "spacing");
  if (spacing) {
    const before = num(attr(spacing, "before"));
    if (before !== null) out.before = px(before);
    const after = num(attr(spacing, "after"));
    if (after !== null) out.after = px(after);
    const line = num(attr(spacing, "line"));
    const rule = attr(spacing, "lineRule") ?? "auto";
    // Word's "single" spacing is a little more than the font's size (about 1.15 lines in a browser).
    if (line) out.lineHeight = rule === "auto" ? String(Math.round((line / 240) * 1.15 * 100) / 100) : `${px(line)}px`;
  }
  const shd = kid(pPr, "shd");
  if (shd) out.shading = hex(attr(shd, "fill"));
  const borders = kid(pPr, "pBdr");
  if (borders) {
    const drawn = (name: string) => !["nil", "none"].includes(attr(kid(borders, name), "val") ?? "none");
    const [top, bottom, sides] = [drawn("top"), drawn("bottom"), drawn("left") || drawn("right")];
    out.border = sides || (top && bottom) ? "box" : top ? "top" : bottom ? "bottom" : null;
  }
  const pageBreak = toggle(kid(pPr, "pageBreakBefore"));
  if (pageBreak !== null) out.pageBreakBefore = pageBreak;
  const numPr = kid(pPr, "numPr");
  if (numPr) {
    const id = attr(kid(numPr, "numId"), "val");
    if (id) out.numId = id;
    out.ilvl = num(attr(kid(numPr, "ilvl"), "val")) ?? out.ilvl ?? 0;
  }
  return out;
}

/** A style with everything it's based on, oldest first. */
function styleChain(ctx: Context, id: string | null): Style[] {
  const chain: Style[] = [];
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const style = ctx.styles.get(id);
    if (!style) break;
    chain.unshift(style);
    id = style.basedOn;
  }
  return chain;
}

// ---- Turning it into HTML ----

function runStyle(p: RunProps, ctx: Context): string {
  const css: string[] = [];
  if (p.font) {
    const generic = ctx.fontFamilies.get(p.font) ?? "sans-serif";
    css.push(`font-family: ${/[^\w-]/.test(p.font) ? `"${p.font}"` : p.font}, ${generic}`);
  }
  if (p.size) css.push(`font-size: ${p.size}pt`);
  if (p.colour) css.push(`color: ${p.colour}`);
  return css.join("; ");
}

function wrapRun(html: string, p: RunProps, ctx: Context): string {
  if (!html) return "";
  let out = html;
  const style = runStyle(p, ctx);
  if (style) out = `<span style="${escapeHtml(style)}">${out}</span>`;
  if (p.vertAlign === "superscript") out = `<sup>${out}</sup>`;
  if (p.vertAlign === "subscript") out = `<sub>${out}</sub>`;
  if (p.strike) out = `<s>${out}</s>`;
  if (p.underline) out = `<u${p.underline !== "solid" ? ` style="text-decoration-style: ${p.underline}"` : ""}>${out}</u>`;
  if (p.italic) out = `<em>${out}</em>`;
  if (p.bold) out = `<strong>${out}</strong>`;
  if (p.highlight) out = `<mark data-color="${p.highlight}" style="background-color: ${p.highlight}">${out}</mark>`;
  return out;
}

interface Para {
  html: string;
  /** For lists: which list and how deep. */
  numId?: string;
  ilvl?: number;
  /** Goes before its paragraph: a picture that paragraph's text flows around. */
  before?: boolean;
}

class Converter {
  constructor(private ctx: Context) {}

  /** The comments whose text is being read (their ranges can run across paragraphs). */
  private openComments: string[] = [];

  /** The body (or a table cell): paragraphs, lists and tables. */
  async blocks(parent: Element): Promise<string> {
    const items: Para[] = [];
    for (const el of this.flatten(parent)) {
      if (el.localName === "p") items.push(...(await this.paragraph(el)));
      else if (el.localName === "tbl") items.push({ html: await this.table(el) });
    }
    return this.lists(items);
  }

  /** Paragraphs and tables, looking inside content controls and the like. */
  private flatten(parent: Element): Element[] {
    const out: Element[] = [];
    for (const el of kids(parent)) {
      if (el.localName === "p" || el.localName === "tbl") out.push(el);
      else if (["sdt", "sdtContent", "customXml", "ins", "smartTag"].includes(el.localName)) {
        out.push(...this.flatten(el.localName === "sdt" ? (kid(el, "sdtContent") ?? el) : el));
      } else if (el.localName === "AlternateContent") out.push(...this.flatten(kid(el, "Choice") ?? el));
    }
    return out;
  }

  private async paragraph(p: Element): Promise<Para[]> {
    const ctx = this.ctx;
    const pPr = kid(p, "pPr");
    const styleId = attr(kid(pPr, "pStyle"), "val") ?? ctx.defaultPara;
    const chain = styleChain(ctx, styleId);
    let para = { ...ctx.defaults.para };
    let run = { ...ctx.defaults.run };
    for (const s of chain) {
      para = readParaProps(s.pPr, para);
      run = readRunProps(s.rPr, ctx, run);
    }
    para = readParaProps(pPr, para);
    // The paragraph mark's own formatting applies to the paragraph's text only in Word's eyes, so it's not used here.

    const extra: Para[] = [];
    const body = await this.inline(p, run, extra);

    // Word's own style names decide what kind of paragraph it is.
    const name = (chain.at(-1)?.name ?? "").toLowerCase();
    const heading = name.match(/^heading ([1-6])$/);
    const tag = heading ? `h${heading[1]}` : "p";
    const attrs: string[] = [];
    const css: string[] = [];
    if (para.align && para.align !== "left") css.push(`text-align: ${para.align}`);
    const listed = Boolean(para.numId && ctx.lists.has(para.numId) && para.numId !== "0");
    if (!listed && para.left) css.push(`margin-left: ${para.left}px`);
    if (!listed && para.firstLine) css.push(`text-indent: ${para.firstLine}px`);
    if (para.right) css.push(`margin-right: ${para.right}px`);
    // Word only puts space around paragraphs when told to, unlike Docs' own default.
    css.push(`margin-top: ${para.before ?? 0}px`, `margin-bottom: ${para.after ?? 0}px`);
    // An empty paragraph is as tall as its paragraph mark's font (Word forms use tiny ones as spacers).
    if (!body.replace(/<span data-bookmark="[^"]*"><\/span>/g, "")) {
      const mark = readRunProps(kid(pPr, "rPr"), ctx, run).size ?? 11;
      const line = para.lineHeight ?? "1.15";
      css.push(`line-height: ${line.endsWith("px") ? line : `${Math.round(mark * (96 / 72) * Number(line) * 10) / 10}px`}`);
    } else css.push(`line-height: ${para.lineHeight ?? "1.15"}`);
    if (para.shading) css.push(`background-color: ${para.shading}`);
    if (para.border) attrs.push(`data-border="${para.border}"`);
    if (para.noLineNumbers) attrs.push("data-no-line-numbers");
    if (name === "title") attrs.push('data-style="title"');
    if (name === "subtitle") attrs.push('data-style="subtitle"');
    if (css.length) attrs.push(`style="${css.join("; ")}"`);

    const out: Para[] = [];
    if (para.pageBreakBefore) out.push({ html: "<div data-page-break></div>" });
    // Pieces inside the text that are blocks of their own (page breaks, text boxes, pictures in front) go around it.
    // Split at page and column breaks: [text, break, text, break, text…].
    const [first, ...rest] = body.split(new RegExp(`(${PAGE_BREAK}|${COLUMN_BREAK})`));
    out.push({ html: `<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}>${first}</${tag}>`, numId: listed ? para.numId : undefined, ilvl: para.ilvl });
    for (let i = 0; i < rest.length; i += 2) {
      out.push({ html: rest[i] === PAGE_BREAK ? "<div data-page-break></div>" : "<div data-column-break></div>" });
      out.push({ html: `<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}>${rest[i + 1]}</${tag}>` });
    }
    // The end of a section: the next one starts on a new page unless it's "continuous".
    const section = kid(pPr, "sectPr");
    const after = section && attr(kid(section, "type"), "val") !== "continuous" ? [{ html: "<div data-page-break></div>" }] : [];
    return [...extra.filter((e) => e.before), ...out, ...extra.filter((e) => !e.before), ...after];
  }

  /** The text of a paragraph (or a link inside one). */
  private async inline(parent: Element, paraRun: RunProps, extra: Para[]): Promise<string> {
    const ctx = this.ctx;
    let html = "";
    // A field written as runs: begin, its instruction, separate, the last result Word showed, end.
    let field: { instr: string; done: boolean } | null = null;
    for (const el of kids(parent)) {
      const start = html.length;
      switch (el.localName) {
        case "commentRangeStart": {
          const id = attr(el, "id") ?? "";
          if (ctx.comments.has(id)) {
            this.openComments.push(id);
            ctx.usedComments.add(id);
          }
          break;
        }
        case "commentRangeEnd":
          this.openComments = this.openComments.filter((id) => id !== attr(el, "id"));
          break;
        // Tracked changes: who made them and when.
        case "ins":
        case "del": {
          const inner = await this.inline(el, paraRun, extra);
          const who = `data-author="${escapeHtml(attr(el, "author") ?? "")}" data-date="${escapeHtml(attr(el, "date") ?? "")}"`;
          if (inner) html += `<${el.localName} ${who}>${inner}</${el.localName}>`;
          break;
        }
        case "r": {
          const mark = attr(kid(el, "fldChar"), "fldCharType");
          if (mark === "begin") field = { instr: "", done: false };
          else if (field && !field.done && kid(el, "instrText")) field.instr += kid(el, "instrText")!.textContent ?? "";
          else if (field && (mark === "separate" || mark === "end")) {
            // Page numbers become fields Docs fills in; other fields keep the result Word showed.
            const kind = fieldKind(field.instr);
            if (kind && !field.done) html += `<span data-field="${kind}"></span>`;
            field.done = field.done || Boolean(kind) || mark === "separate";
            if (!kind && mark === "separate") field.instr = "";
            if (mark === "end") field = null;
          } else if (!field || !fieldKind(field.instr)) html += await this.run(el, paraRun, extra);
          break;
        }
        case "hyperlink": {
          const id = attr(el, "id", R);
          const anchor = attr(el, "anchor");
          const rel = id ? ctx.rels.get(id) : undefined;
          const href = rel?.external ? rel.target : anchor ? `#${anchor}` : null;
          const inner = await this.inline(el, paraRun, extra);
          html += href && /^(https?:|mailto:|#)/i.test(href) ? `<a href="${escapeHtml(href)}">${inner}</a>` : inner;
          break;
        }
        case "bookmarkStart": {
          const name = attr(el, "name");
          if (name && !name.startsWith("_")) html += `<span data-bookmark="${escapeHtml(name)}"></span>`;
          break;
        }
        case "fldSimple": {
          const kind = fieldKind(attr(el, "instr") ?? "");
          html += kind ? `<span data-field="${kind}"></span>` : await this.inline(el, paraRun, extra);
          break;
        }
        case "smartTag":
        case "customXml":
        case "sdtContent":
          html += await this.inline(el, paraRun, extra);
          break;
        case "sdt":
          html += await this.inline(kid(el, "sdtContent") ?? el, paraRun, extra);
          break;
        // Anything else is left out.
      }
      // Text inside a comment's range is marked with it.
      if (this.openComments.length && html.length > start) {
        html = html.slice(0, start) + this.openComments.reduce((h, id) => `<span data-comment="wc${escapeHtml(id)}">${h}</span>`, html.slice(start));
      }
    }
    return html;
  }

  private async run(r: Element, paraRun: RunProps, extra: Para[]): Promise<string> {
    const ctx = this.ctx;
    const rPr = kid(r, "rPr");
    let props = { ...paraRun };
    for (const s of styleChain(ctx, attr(kid(rPr, "rStyle"), "val"))) props = readRunProps(s.rPr, ctx, props);
    props = readRunProps(rPr, ctx, props);
    if (props.hidden) return "";

    let text = "";
    let html = "";
    const flush = () => {
      if (text) html += wrapRun(escapeHtml(props.caps ? text.toUpperCase() : text), props, ctx);
      text = "";
    };
    for (const el of kids(r)) {
      switch (el.localName) {
        case "t":
        case "delText":
          text += el.textContent ?? "";
          break;
        case "tab":
        case "ptab":
          text += "  ";
          break;
        case "noBreakHyphen":
          text += "‑";
          break;
        case "sym": {
          const code = parseInt(attr(el, "char") ?? "", 16);
          if (Number.isFinite(code)) text += String.fromCharCode(code >= 0xf000 ? code - 0xf000 : code);
          break;
        }
        case "br":
        case "cr": {
          flush();
          const type = attr(el, "type");
          html += type === "page" ? PAGE_BREAK : type === "column" ? COLUMN_BREAK : "<br>";
          break;
        }
        case "footnoteReference":
        case "endnoteReference": {
          flush();
          const kind = el.localName === "footnoteReference" ? "footnote" : "endnote";
          const id = attr(el, "id") ?? "";
          html += `<sup data-note="${kind}" data-id="w${kind[0]}${escapeHtml(id)}" data-text="${escapeHtml(ctx.notes[kind].get(id) ?? "")}"></sup>`;
          break;
        }
        case "drawing":
        case "AlternateContent":
        case "pict": {
          flush();
          html += await this.drawing(el, extra);
          break;
        }
      }
    }
    flush();
    return html;
  }

  /** A picture: in line with the text, or in front of it; text boxes keep their text, after the paragraph. */
  private async drawing(el: Element, extra: Para[]): Promise<string> {
    const holder = el.localName === "AlternateContent" ? (kid(el, "Choice") ?? el) : el;
    const textBox = find(holder, "txbxContent");
    if (textBox) {
      extra.push({ html: await this.blocks(textBox) });
      return "";
    }
    const blip = find(holder, "blip");
    const id = blip ? attr(blip, "embed", R) : (attr(find(holder, "imagedata"), "id", R) ?? null);
    if (!id) return "";
    const src = await this.picture(id);
    if (!src) return "";
    const extent = find(holder, "extent");
    const w = Math.round((num(attr(extent, "cx", "")) ?? 0) / EMUS_PER_PX);
    const h = Math.round((num(attr(extent, "cy", "")) ?? 0) / EMUS_PER_PX);
    const name = attr(find(holder, "docPr"), "descr", "") ?? attr(find(holder, "docPr"), "name", "") ?? "";
    const size = w && h ? ` style="width: ${w}px; height: ${h}px"` : "";
    const anchor = find(holder, "anchor");
    // Floating pictures with no text wrapping (in front of or behind the text) stay where they were put;
    // ones that text flows around go on their own line, so the text stays readable.
    const behind = anchor && ["1", "true", "on"].includes(attr(anchor, "behindDoc", "") ?? "");
    if (anchor && (find(anchor, "wrapNone") || behind)) {
      const x = Math.round((num(find(find(anchor, "positionH"), "posOffset")?.textContent ?? null) ?? 0) / EMUS_PER_PX);
      const y = Math.round((num(find(find(anchor, "positionV"), "posOffset")?.textContent ?? null) ?? 0) / EMUS_PER_PX);
      extra.push({
        html: `<img src="${src}" alt="${escapeHtml(name)}" data-wrap="${behind ? "behind" : "front"}" data-x="${x}" data-y="${y}"${size}>`,
      });
      return "";
    }
    if (anchor) {
      // Text flows around it (Square, Tight, Through), or it's on a line of its own (Top and Bottom),
      // on the side Word lined it up with, or the side nearer where it was moved to.
      const across = find(anchor, "positionH");
      const align = find(across, "align")?.textContent;
      const offset = (num(find(across, "posOffset")?.textContent ?? null) ?? 0) / EMUS_PER_PX;
      const width = this.ctx.textWidth / TWIPS_PER_PX;
      const side = align === "right" || align === "outside" ? "right" : align === "center" ? "center" : align ? "left" : offset + w / 2 > width * 0.6 ? "right" : offset + w / 2 > width * 0.4 ? "center" : "left";
      const flows = Boolean(find(anchor, "wrapSquare") || find(anchor, "wrapTight") || find(anchor, "wrapThrough"));
      extra.push({
        html: `<img src="${src}" alt="${escapeHtml(name)}" data-wrap="${flows ? "square" : "topBottom"}" data-side="${side}"${size}>`,
        // The paragraph it's anchored to flows around it.
        before: flows,
      });
      return "";
    }
    return `<img src="${src}" alt="${escapeHtml(name)}"${size}>`;
  }

  private async picture(id: string): Promise<string | null> {
    const ctx = this.ctx;
    const cached = ctx.pictures.get(id);
    if (cached) return cached;
    const rel = ctx.rels.get(id);
    if (!rel || rel.external) return null;
    const path = rel.target.startsWith("/") ? rel.target.slice(1) : `word/${rel.target}`;
    const file = ctx.zip.file(path.replace(/\/\.\//g, "/"));
    if (!file) return null;
    const ext = path.split(".").pop()!.toLowerCase();
    const type = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", svg: "image/svg+xml", webp: "image/webp" }[ext];
    if (!type) return null; // Old Windows pictures (.emf, .wmf) can't be shown in a browser.
    const src = `data:${type};base64,${await file.async("base64")}`;
    ctx.pictures.set(id, src);
    return src;
  }

  private async table(tbl: Element): Promise<string> {
    const ctx = this.ctx;
    const tblPr = kid(tbl, "tblPr");
    const grid = kids(kid(tbl, "tblGrid"), "gridCol").map((c) => Math.round(px(num(attr(c, "w")) ?? 0)));
    // Borders and cell margins: the table's own, or its style's; Word's plain tables have no borders.
    const named = styleChain(ctx, attr(kid(tblPr, "tblStyle"), "val"));
    const styles = named.length ? named : styleChain(ctx, "TableNormal");
    const fromTable = (name: string) => kid(tblPr, name) ?? styles.reduce<Element | null>((found, s) => kid(s.tblPr, name) ?? found, null);
    const borders = fromTable("tblBorders");
    const margins = fromTable("tblCellMar");
    const rowList = kids(tbl, "tr");

    interface Cell {
      start: number;
      span: number;
      merge: "restart" | "continue" | null;
      html: string;
      css: string;
      header: boolean;
    }
    const rows: Cell[][] = [];
    for (const [r, tr] of rowList.entries()) {
      const trPr = kid(tr, "trPr");
      const header = toggle(kid(trPr, "tblHeader")) === true;
      // A row's height is at least this tall (or exactly, which is treated the same here).
      const height = num(attr(kid(trPr, "trHeight"), "val"));
      const cells: Cell[] = [];
      let col = num(attr(kid(trPr, "gridBefore"), "val")) ?? 0;
      for (const tc of kids(tr).flatMap((c) => (c.localName === "sdt" ? kids(kid(c, "sdtContent"), "tc") : c.localName === "tc" ? [c] : []))) {
        const tcPr = kid(tc, "tcPr");
        const span = num(attr(kid(tcPr, "gridSpan"), "val")) ?? 1;
        const vMerge = kid(tcPr, "vMerge");
        const merge = vMerge ? (attr(vMerge, "val") === "restart" ? "restart" : "continue") : null;
        // Each side: the cell's own border, else the table's outside edge or its inside lines.
        const own = kid(tcPr, "tcBorders");
        const side = (cellSide: string[], tableSide: string[]) =>
          sideCss(cellSide.map((n) => kid(own, n)).find(Boolean) ?? tableSide.map((n) => kid(borders, n)).find(Boolean) ?? null) ?? "none";
        const top = side(["top"], r === 0 ? ["top"] : ["insideH"]);
        const bottom = side(["bottom"], r === rowList.length - 1 ? ["bottom"] : ["insideH"]);
        const left = side(["left", "start"], col === 0 ? ["left", "start"] : ["insideV"]);
        const right = side(["right", "end"], col + span >= grid.length ? ["right", "end"] : ["insideV"]);
        // Space inside the cell: Word's default is a little on the left and right only.
        const cellMar = kid(tcPr, "tcMar");
        const pad = (names: string[], fallback: number) =>
          px(num(attr(names.map((n) => kid(cellMar, n) ?? kid(margins, n)).find(Boolean) ?? null, "w")) ?? fallback);
        const fill = hex(attr(kid(tcPr, "shd"), "fill"));
        const vAlign = attr(kid(tcPr, "vAlign"), "val");
        const css = [
          `border-top: ${top}`, `border-right: ${right}`, `border-bottom: ${bottom}`, `border-left: ${left}`,
          `padding: ${pad(["top"], 0)}px ${pad(["right", "end"], 108)}px ${pad(["bottom"], 0)}px ${pad(["left", "start"], 108)}px`,
          ...(fill && fill !== "#ffffff" ? [`background-color: ${fill}`] : []),
          ...(vAlign === "center" ? ["vertical-align: middle"] : vAlign === "bottom" ? ["vertical-align: bottom"] : []),
          ...(height ? [`height: ${px(height)}px`] : []),
        ];
        cells.push({ start: col, span, merge, html: merge === "continue" ? "" : await this.blocks(tc), css: css.join("; "), header });
        col += span;
      }
      rows.push(cells);
    }

    // Where the table sits: Word centres some tables that are wider than the text, so they reach into both margins.
    const width = (attr(kid(tblPr, "tblW"), "type") === "dxa" && num(attr(kid(tblPr, "tblW"), "w"))) || grid.reduce((a, b) => a + b, 0) * TWIPS_PER_PX;
    const jc = attr(kid(tblPr, "jc"), "val");
    const indent = px(
      jc === "center" ? (ctx.textWidth - width) / 2 : jc === "right" || jc === "end" ? ctx.textWidth - width : (num(attr(kid(tblPr, "tblInd"), "w")) ?? 0),
    );
    let html = `<table${indent ? ` style="margin-left: ${indent}px"` : ""}><tbody>`;
    rows.forEach((cells, r) => {
      html += "<tr>";
      for (const cell of cells) {
        if (cell.merge === "continue") continue;
        let rowspan = 1;
        if (cell.merge === "restart") {
          for (let below = r + 1; below < rows.length; below++) {
            if (rows[below].some((c) => c.start === cell.start && c.merge === "continue")) rowspan++;
            else break;
          }
        }
        const widths = grid.slice(cell.start, cell.start + cell.span);
        const tag = cell.header ? "th" : "td";
        const css = cell.css;
        html += `<${tag}${cell.span > 1 ? ` colspan="${cell.span}"` : ""}${rowspan > 1 ? ` rowspan="${rowspan}"` : ""}${
          widths.length === cell.span && widths.every((w) => w > 0) ? ` colwidth="${widths.join(",")}"` : ""
        } style="${css}">${cell.html || "<p></p>"}</${tag}>`;
      }
      html += "</tr>";
    });
    return `${html}</tbody></table>`;
  }

  /** Paragraphs that belong to lists become nested <ul>/<ol>, with each list's own bullets or numbers. */
  private lists(items: Para[]): string {
    let html = "";
    // Open lists, outermost first.
    const open: { tag: string; numId: string; ilvl: number }[] = [];
    // Word keeps counting a list after other paragraphs come between its items: numId → count at each level.
    const counts = new Map<string, number[]>();
    const close = (depth: number) => {
      while (open.length > depth) html += `</li></${open.pop()!.tag}>`;
    };
    for (const item of items) {
      if (!item.numId) {
        close(0);
        html += item.html;
        continue;
      }
      const levels = this.ctx.lists.get(item.numId)!;
      const ilvl = Math.min(item.ilvl ?? 0, 8);
      const level = levels[ilvl] ?? levels[0];
      const { tag, style } = listStyle(level);
      const count = counts.get(item.numId) ?? [];
      const n = (count[ilvl] ?? (level?.start ?? 1) - 1) + 1;
      count[ilvl] = n;
      count.length = ilvl + 1; // Deeper levels start again.
      counts.set(item.numId, count);
      // Deeper than the last item: a list inside it. Same depth: the next item. Shallower: close the inner lists.
      while (open.length && (open.at(-1)!.ilvl > ilvl || (open.at(-1)!.ilvl === ilvl && (open.at(-1)!.numId !== item.numId || open.at(-1)!.tag !== tag)))) {
        html += `</li></${open.pop()!.tag}>`;
      }
      if (open.length && open.at(-1)!.ilvl === ilvl) {
        html += `</li><li>${item.html}`;
      } else {
        html += `<${tag}${tag === "ol" && n !== 1 ? ` start="${n}"` : ""}${style ? ` style="list-style-type: ${style}"` : ""}><li>${item.html}`;
        open.push({ tag, numId: item.numId, ilvl });
      }
    }
    close(0);
    return html;
  }
}

/** Splits a paragraph where Word starts a new page inside it. */
const PAGE_BREAK = "\u0000page\u0000";
const COLUMN_BREAK = "\u0000column\u0000";

/** One border side (<w:top w:val="single" w:sz="4" …/>) as CSS; null when there's no such element. */
function sideCss(side: Element | null): string | null {
  if (!side) return null;
  const val = attr(side, "val") ?? "none";
  if (val === "nil" || val === "none") return "none";
  // Sizes are in eighths of a point.
  const width = Math.max(1, Math.round(((num(attr(side, "sz")) || 4) / 8) * (96 / 72)));
  const colour = hex(attr(side, "color")) ?? "#000000";
  const style = val.startsWith("double") ? "double" : val.includes("dash") ? "dashed" : val.includes("dot") ? "dotted" : "solid";
  return `${style === "double" ? Math.max(3, width) : width}px ${style} ${colour}`;
}

/** Word's number formats and bullet characters → a list and its CSS list-style-type. */
function listStyle(level: Level | undefined): { tag: "ul" | "ol"; style: string | null } {
  if (!level || level.format === "bullet") {
    const ch = level?.text ?? "•";
    const style = ch === "o" ? "circle" : ch === "▪" || ch === "" || ch === "■" ? "square" : ch === "•" || ch === "" || ch === "·" ? "disc" : `"${ch} "`;
    return { tag: "ul", style: style === "disc" ? null : style };
  }
  const formats: Record<string, string> = {
    decimal: "decimal", lowerLetter: "lower-alpha", upperLetter: "upper-alpha", lowerRoman: "lower-roman", upperRoman: "upper-roman", decimalZero: "decimal-leading-zero",
  };
  const style = formats[level.format] ?? "decimal";
  return { tag: "ol", style: style === "decimal" ? null : style };
}

// ---- Reading the parts ----

async function xml(zip: JSZip, path: string): Promise<Document | null> {
  const text = await zip.file(path)?.async("string");
  return text ? new DOMParser().parseFromString(text, "application/xml") : null;
}

/** Where a part's pictures and links point (word/header1.xml → word/_rels/header1.xml.rels). */
async function readRels(zip: JSZip, part = "document.xml") {
  const rels = new Map<string, { target: string; external: boolean }>();
  const doc = await xml(zip, `word/_rels/${part}.rels`);
  for (const rel of Array.from(doc?.getElementsByTagName("Relationship") ?? [])) {
    rels.set(rel.getAttribute("Id") ?? "", { target: rel.getAttribute("Target") ?? "", external: rel.getAttribute("TargetMode") === "External" });
  }
  return rels;
}

async function readStyles(zip: JSZip, themeFonts: Context["themeFonts"]) {
  const styles = new Map<string, Style>();
  let defaultPara: string | null = null;
  const doc = await xml(zip, "word/styles.xml");
  const root = doc?.documentElement;
  const defaults = kid(root, "docDefaults");
  const run = readRunProps(kid(kid(defaults, "rPrDefault"), "rPr"), { themeFonts });
  const para = readParaProps(kid(kid(defaults, "pPrDefault"), "pPr"));
  for (const s of kids(root, "style")) {
    const id = attr(s, "styleId");
    if (!id) continue;
    const type = attr(s, "type") ?? "paragraph";
    styles.set(id, {
      type,
      name: attr(kid(s, "name"), "val") ?? id,
      basedOn: attr(kid(s, "basedOn"), "val"),
      pPr: kid(s, "pPr"),
      rPr: kid(s, "rPr"),
      tblPr: kid(s, "tblPr"),
    });
    if (type === "paragraph" && attr(s, "default") === "1") defaultPara = id;
  }
  // Without styles.xml, Word's own defaults: Calibri 11, a little space after each paragraph.
  if (!doc) return { styles, defaultPara, defaults: { run: { font: "Calibri", size: 11 }, para: { after: 10.7, lineHeight: "1.24" } } };
  return { styles, defaultPara, defaults: { run: { size: 10, ...run }, para } };
}

async function readLists(zip: JSZip) {
  const lists = new Map<string, Level[]>();
  const doc = await xml(zip, "word/numbering.xml");
  const root = doc?.documentElement;
  const abstract = new Map<string, Level[]>();
  for (const a of kids(root, "abstractNum")) {
    abstract.set(
      attr(a, "abstractNumId") ?? "",
      kids(a, "lvl").map((l) => ({
        format: attr(kid(l, "numFmt"), "val") ?? "decimal",
        text: attr(kid(l, "lvlText"), "val") ?? "",
        start: num(attr(kid(l, "start"), "val")) ?? 1,
      })),
    );
  }
  for (const n of kids(root, "num")) {
    const levels = abstract.get(attr(kid(n, "abstractNumId"), "val") ?? "");
    if (levels) lists.set(attr(n, "numId") ?? "", levels);
  }
  return lists;
}

async function readTheme(zip: JSZip) {
  const doc = await xml(zip, "word/theme/theme1.xml");
  const font = (name: string) => find(find(doc?.documentElement, name), "latin")?.getAttribute("typeface") || undefined;
  return { major: font("majorFont"), minor: font("minorFont") };
}

async function readFontFamilies(zip: JSZip) {
  const families = new Map<string, string>();
  const doc = await xml(zip, "word/fontTable.xml");
  for (const f of kids(doc?.documentElement, "font")) {
    const family = attr(kid(f, "family"), "val");
    const generic = family === "roman" ? "serif" : family === "modern" ? "monospace" : family === "script" ? "cursive" : "sans-serif";
    families.set(attr(f, "name") ?? "", generic);
  }
  return families;
}

function readTextWidth(body: Element): number {
  const sect = kid(body, "sectPr");
  const margin = kid(sect, "pgMar");
  return (num(attr(kid(sect, "pgSz"), "w")) ?? 11906) - (num(attr(margin, "left")) ?? 1440) - (num(attr(margin, "right")) ?? 1440);
}

/** Page size, orientation, margins, columns and line numbers, from the section settings; hyphenation from the document's settings. */
async function readLayout(body: Element | null, zip: JSZip): Promise<PageLayout> {
  const settings = await xml(zip, "word/settings.xml");
  const hyphenate = toggle(kid(settings?.documentElement, "autoHyphenation")) === true;
  // The body's own section settings (the last section's), as for the text width.
  const sect = kid(body, "sectPr");
  const design = readDesign(body, sect);
  if (!sect) return { ...DEFAULT_LAYOUT, hyphenate, design };
  const size = kid(sect, "pgSz");
  const w = num(attr(size, "w")) ?? 11906;
  const h = num(attr(size, "h")) ?? 16838;
  const margin = kid(sect, "pgMar");
  const side = (name: string) => Math.abs(num(attr(margin, name)) ?? 1440) / TWIPS_PER_PX;
  const cols = kid(sect, "cols");
  const columns = Math.min(4, Math.max(1, num(attr(cols, "num")) ?? 1));
  const lines = kid(sect, "lnNumType");
  return {
    // Word gives the size as the paper is turned; Docs keeps it upright.
    width: Math.min(w, h) / TWIPS_PER_PX,
    height: Math.max(w, h) / TWIPS_PER_PX,
    orientation: attr(size, "orient") === "landscape" || w > h ? "landscape" : "portrait",
    margins: { top: side("top"), right: side("right"), bottom: side("bottom"), left: side("left") },
    columns,
    columnGap: (num(attr(cols, "space")) ?? 720) / TWIPS_PER_PX,
    columnLine: ["1", "true", "on"].includes(attr(cols, "sep") ?? ""),
    lineNumbers: lines
      ? { start: (num(attr(lines, "start")) ?? 0) + 1, countBy: Math.max(1, num(attr(lines, "countBy")) ?? 1), perPage: attr(lines, "restart") === "newPage" }
      : null,
    hyphenate,
    design,
    headers: NO_HEADERS,
    references: NO_REFERENCES,
    mailMerge: NO_MERGE,
    review: NO_REVIEW,
  };
}

const BORDER_STYLES: Record<string, BorderStyle> = { double: "double", dotted: "dotted", dashed: "dashed", dashSmallGap: "dashed", dotDash: "dashed" };

/** The page colour (w:background) and page borders (the section's w:pgBorders). */
function readDesign(body: Element | null, sect: Element | null): DocDesign {
  const hex = (value: string | null) => (value && /^[0-9a-f]{6}$/i.test(value) ? `#${value.toLowerCase()}` : null);
  const pageColor = hex(attr(kid(body?.parentElement, "background"), "color"));
  const edge = kids(kid(sect, "pgBorders")).find((b) => (attr(b, "val") ?? "none") !== "none" && attr(b, "val") !== "nil");
  const pageBorder = edge
    ? {
        style: BORDER_STYLES[attr(edge, "val") ?? ""] ?? "solid",
        // Word's border widths are in eighths of a point.
        width: Math.min(6, Math.max(0.25, (num(attr(edge, "sz")) ?? 4) / 8)),
        color: hex(attr(edge, "color")) ?? "#000000",
      }
    : null;
  return { ...DEFAULT_DESIGN, pageColor, pageBorder };
}

/** A Word document (already opened as a zip) → Docs' page body and page layout. */
export async function readDocx(zip: JSZip): Promise<{ body: string; layout: PageLayout }> {
  const doc = await xml(zip, "word/document.xml");
  const body = kid(doc?.documentElement, "body");
  if (!body) throw new Error("This Word document has no text part.");
  const themeFonts = await readTheme(zip);
  const { styles, defaultPara, defaults } = await readStyles(zip, themeFonts);
  const ctx: Context = {
    styles,
    defaultPara: defaultPara ?? (styles.has("Normal") ? "Normal" : null),
    defaults,
    lists: await readLists(zip),
    rels: await readRels(zip),
    themeFonts,
    fontFamilies: await readFontFamilies(zip),
    zip,
    pictures: new Map(),
    textWidth: readTextWidth(body),
    notes: { footnote: await readNotes(zip, "footnote"), endnote: await readNotes(zip, "endnote") },
    comments: await readComments(zip),
    usedComments: new Set(),
  };
  const html = await new Converter(ctx).blocks(body);
  const layout = await readLayout(body, zip);
  const { headers, watermark } = await readHeadersFooters(body, ctx);
  const comments = [...ctx.usedComments].map((id) => ({ id: `wc${id}`, ...ctx.comments.get(id)!, replies: [], done: false }));
  return { body: html, layout: { ...layout, headers, design: { ...layout.design, watermark }, review: { ...layout.review, comments } } };
}

/** Comments' authors, dates and text, by id. */
async function readComments(zip: JSZip) {
  const comments = new Map<string, { author: string; date: string; text: string }>();
  const doc = await xml(zip, "word/comments.xml");
  for (const c of kids(doc?.documentElement, "comment")) {
    const text = kids(c, "p")
      .map((p) => Array.from(p.getElementsByTagNameNS(W, "t"), (t) => t.textContent ?? "").join(""))
      .join("\n")
      .trim();
    comments.set(attr(c, "id") ?? "", { author: attr(c, "author") ?? "", date: attr(c, "date") ?? "", text });
  }
  return comments;
}

/** Footnotes' or endnotes' text, by id (Word's separators, ids -1 and 0, left out). */
async function readNotes(zip: JSZip, kind: "footnote" | "endnote") {
  const notes = new Map<string, string>();
  const doc = await xml(zip, `word/${kind}s.xml`);
  for (const note of kids(doc?.documentElement, kind)) {
    const id = attr(note, "id") ?? "";
    if (Number(id) <= 0) continue;
    const text = kids(note, "p")
      .map((p) => Array.from(p.getElementsByTagNameNS(W, "t"), (t) => t.textContent ?? "").join(""))
      .join(" ")
      .trim();
    notes.set(id, text);
  }
  return notes;
}

/** Word's PAGE and NUMPAGES fields → Docs' page number fields. */
function fieldKind(instr: string): "page" | "pages" | null {
  const name = instr.trim().split(/\s+/)[0]?.toUpperCase();
  return name === "PAGE" ? "page" : name === "NUMPAGES" || name === "SECTIONPAGES" ? "pages" : null;
}

/**
 * The headers and footers of the first section (as the first pages show them): the usual ones and
 * the first page's, with their pictures and page numbers. A watermark in the header becomes the
 * document's watermark.
 */
async function readHeadersFooters(body: Element, ctx: Context): Promise<{ headers: HeadersFooters; watermark: Watermark | null }> {
  const sections = Array.from(body.getElementsByTagNameNS(W, "sectPr"));
  const first = sections[0];
  const headers = { ...NO_HEADERS, differentFirst: toggle(kid(first, "titlePg")) === true };
  let watermark: Watermark | null = null;
  if (!first) return { headers, watermark };
  // A section without its own header or footer uses the one before it; Word lists them on the first.
  const ref = (name: "header" | "footer", type: string) =>
    sections.map((s) => kids(s, `${name}Reference`).find((r) => (attr(r, "type") ?? "default") === type)).find(Boolean);
  const read = async (name: "header" | "footer", type: string) => {
    const r = ref(name, type);
    const target = r ? ctx.rels.get(attr(r, "id", R) ?? "")?.target : undefined;
    if (!target) return "";
    const part = target.replace(/^\/?word\//, "");
    const doc = await xml(ctx.zip, `word/${part}`);
    if (!doc) return "";
    if (name === "header") watermark ??= readWatermark(doc);
    // The header's pictures are listed in its own _rels file.
    const converter = new Converter({ ...ctx, rels: await readRels(ctx.zip, part), pictures: new Map() });
    const html = await converter.blocks(doc.documentElement);
    // Nothing but empty lines is no header at all.
    return html.replace(/<p[^>]*>(\s|<br>)*<\/p>/g, "").trim() ? html : "";
  };
  headers.header = await read("header", "default");
  headers.footer = await read("footer", "default");
  if (headers.differentFirst) {
    headers.firstHeader = await read("header", "first");
    headers.firstFooter = await read("footer", "first");
  }
  return { headers, watermark };
}

const NAMED_COLOURS: Record<string, string> = { silver: "#c0c0c0", gray: "#808080", grey: "#808080", black: "#000000", red: "#ff0000", blue: "#0000ff" };

/** Word's watermark: WordArt (VML) in the header, with its text in a text path. */
function readWatermark(doc: Document): Watermark | null {
  // The shape's template (v:shapetype) has a text path too, without any text.
  const path = Array.from(doc.getElementsByTagNameNS("*", "textpath")).find((t) => t.getAttribute("string"));
  const text = path?.getAttribute("string")?.trim();
  if (!path || !text) return null;
  const shape = path.parentElement;
  const style = shape?.getAttribute("style") ?? "";
  const fill = (shape?.getAttribute("fillcolor") ?? "silver").toLowerCase();
  const font = /font-family:\s*"?([^";]+)/.exec(path.getAttribute("style") ?? "")?.[1]?.trim();
  const opacity = shape ? Array.from(shape.children).find((c) => c.localName === "fill")?.getAttribute("opacity") : null;
  return {
    text: text.slice(0, 60),
    font: font || DEFAULT_WATERMARK.font,
    color: /^#[0-9a-f]{6}$/.test(fill) ? fill : (NAMED_COLOURS[fill] ?? DEFAULT_WATERMARK.color),
    diagonal: /rotation:\s*(315|-45)/.test(style),
    faint: opacity ? parseFloat(opacity) < 1 : false,
  };
}
