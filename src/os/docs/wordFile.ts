// Word documents (.docx). Saving turns the document into a real Word file, and also tucks a copy of
// Docs' own page inside it, so the document opens in Docs again exactly as it was. When the file
// has changed since (it was edited in Word, say), or it came from somewhere else, Docs reads Word's
// version instead (docxReader.ts), keeping how it looks.

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  LineNumberRestartFormat,
  Packer,
  PageBorderOffsetFrom,
  PageOrientation,
  Paragraph,
  ShadingType,
  type IBaseParagraphStyleOptions,
  type IBorderOptions,
  type IStylesOptions,
} from "docx";
import { htmlToContent, type HtmlImage } from "docx/html";
import { TextWatermark } from "docx/watermarks";
import JSZip from "jszip";
import { fontsOf, paletteOf, spacingOf, styleSetOf, toneColour, withEffect, type DocDesign, type Look, type PageBorder } from "./design";
import { svgUrl } from "./graphics";
import { readDocx } from "./docxReader";
import { isBlank } from "./headerFooter";
import type { Comment } from "./review/comments";
import { DEFAULT_LAYOUT, textWidth, type PageLayout } from "./layout";

export const WORD_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Word measures pages in twentieths of a point: 15 to a screen pixel. */
const TWIPS_PER_PX = 15;
/** …and drawings in EMUs: 9525 to a screen pixel. */
const EMUS_PER_PX = 9525;

const NAMESPACE = "urn:dementa:docs";
const COPY_PATH = "customXml/item1.xml";
const COPY_PROPS_PATH = "customXml/itemProps1.xml";

const escapeXml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function sha256(data: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** An SVG picture's own text, from its data: URL. */
function svgText(src: string) {
  const data = src.slice(src.indexOf(",") + 1);
  if (!/;base64,/.test(src)) return decodeURIComponent(data);
  const binary = atob(data);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/** A PNG of an SVG picture, for Word versions that can't show SVGs. */
async function svgToPng(src: string): Promise<string | undefined> {
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    return undefined;
  }
  // Twice the size, so it stays sharp when printed.
  const canvas = document.createElement("canvas");
  canvas.width = (img.naturalWidth || 300) * 2;
  canvas.height = (img.naturalHeight || 150) * 2;
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/** The pictures Word needs help with: SVG drawings (which need a PNG too) and online pictures (which are downloaded). */
async function collectImages(body: string, design: DocDesign, threads: Comment[]) {
  const page = new DOMParser().parseFromString(body, "text/html");
  const images: Record<string, HtmlImage> = {};
  // A picture on a line of its own (Top and Bottom) goes in a paragraph of its own, lined up as it was.
  for (const img of page.querySelectorAll<HTMLElement>("img[data-wrap=topBottom]")) {
    const line = page.createElement("p");
    line.style.textAlign = img.dataset.side ?? "left";
    img.replaceWith(line);
    // Its size stays; how it sat on the page is the paragraph's now.
    for (const name of ["display", "clear", "margin"]) img.style.removeProperty(name);
    line.append(img);
  }
  // Table lines Docs draws without saying so (Word's plain grid) are written out, so Word draws them too.
  for (const cell of page.querySelectorAll<HTMLElement>("td, th")) {
    for (const side of ["top", "right", "bottom", "left"]) {
      if (!cell.style.getPropertyValue(`border-${side}-style`)) cell.style.setProperty(`border-${side}`, "1px solid #000000");
    }
  }
  // Where each floating picture goes, in order: moved anywhere in front of or behind the text, or
  // with the text flowing around it on one side.
  const fronts = [...page.querySelectorAll<HTMLElement>("img[data-wrap=front], img[data-wrap=behind], img[data-wrap=square]")].map((img): Float => ({
    x: Number(img.dataset.x) || 0,
    y: Number(img.dataset.y) || 0,
    z: Number(img.dataset.z) || 0,
    wrap: img.dataset.wrap as "front" | "behind" | "square",
    side: img.dataset.side === "right" ? "right" : "left",
  }));
  await Promise.all(
    [...page.querySelectorAll("img")].map(async (img, i) => {
      const src = img.getAttribute("src") ?? "";
      const key = `dementa-image-${i}`;
      if (src.startsWith("data:image/svg+xml")) {
        // Shapes are drawn with the theme's effect (Design › Effects), as they look in Docs.
        const drawn = img.hasAttribute("data-shape") ? svgUrl(withEffect(svgText(src), design)) : src;
        const png = await svgToPng(drawn);
        if (png) images[key] = { data: drawn, fallback: png };
      } else if (/^https?:/i.test(src)) {
        try {
          const response = await fetch(src);
          if (response.ok) images[key] = await response.arrayBuffer();
        } catch {
          // Can't download it; the picture is left out of the Word file.
        }
      } else return;
      img.setAttribute("src", key);
    }),
  );
  // Footnotes and endnotes: a mark in the text, and the note's own text for Word's notes part.
  const footnotes: Record<string, { children: Paragraph[] }> = {};
  const endnotes: Record<string, { children: Paragraph[] }> = {};
  let n = 0;
  for (const mark of page.querySelectorAll<HTMLElement>("sup[data-note]")) {
    const id = String(++n);
    const kind = mark.getAttribute("data-note") === "endnote" ? "EN" : "FN";
    (kind === "FN" ? footnotes : endnotes)[id] = { children: [new Paragraph({ text: mark.getAttribute("data-text") ?? "" })] };
    mark.replaceWith(page.createTextNode(`${FIELD}${kind}${id}${FIELD}`));
  }
  // Tables of contents and figures: each line's text, and its page number at the right.
  for (const block of page.querySelectorAll<HTMLElement>("div[data-ref-block=toc], div[data-ref-block=figures]")) {
    const lines = [...block.querySelectorAll<HTMLElement>(".docs-toc-entry")];
    if (!lines.length) continue;
    const table = page.createElement("table");
    table.setAttribute("style", "border-collapse: collapse; width: 100%");
    for (const line of lines) {
      const row = table.insertRow();
      const text = row.insertCell();
      text.textContent = line.querySelector(".docs-toc-text")?.textContent ?? "";
      text.setAttribute("style", `border: none; padding: 0 0 0 ${line.style.paddingLeft || "0"}`);
      const number = row.insertCell();
      number.textContent = line.querySelector(".docs-toc-page")?.textContent ?? "";
      number.setAttribute("style", "border: none; padding: 0; text-align: right; width: 12%");
    }
    lines.forEach((l) => l.remove());
    block.append(table);
  }
  // Comments: marks where each one's text starts and ends, and its text for Word's comments part.
  const comments: { id: number; author: string; date: Date; children: Paragraph[] }[] = [];
  threads.forEach((c, id) => {
    const spans = page.querySelectorAll<HTMLElement>(`[data-comment="${CSS.escape(c.id)}"]`);
    if (!spans.length) return;
    spans[0].prepend(`${FIELD}CS${id}${FIELD}`);
    spans[spans.length - 1].append(`${FIELD}CE${id}${FIELD}`);
    comments.push({
      id,
      author: c.author || "Author",
      date: c.date ? new Date(c.date) : new Date(),
      children: [new Paragraph({ text: c.text }), ...c.replies.map((r) => new Paragraph({ text: `${r.author}: ${r.text}` }))],
    });
  });
  // Tracked changes: marks around each, which become Word's own insertions and deletions.
  const revisions: { author: string; date: string }[] = [];
  for (const change of page.querySelectorAll<HTMLElement>("ins, del")) {
    const k = revisions.push({ author: change.getAttribute("data-author") || "Author", date: change.getAttribute("data-date") || new Date().toISOString() }) - 1;
    const kind = change.localName === "ins" ? "I" : "D";
    change.prepend(`${FIELD}${kind}S${k}${FIELD}`);
    change.append(`${FIELD}${kind}E${FIELD}`);
    change.replaceWith(...change.childNodes);
  }
  return { body: page.body.innerHTML, images, fronts, footnotes, endnotes, comments, revisions };
}

/** Docs' body text: 16px, which is 12pt. */
const BODY_PT = 12;
const hex = (colour: string) => colour.replace("#", "").toUpperCase();

/** A title or heading's look (design.ts) as a Word paragraph style. */
function wordStyle(look: Look, design: DocDesign, font: string): IBaseParagraphStyleOptions {
  const p = paletteOf(design);
  const pt = look.size * BODY_PT;
  const rule = look.rule && { style: BorderStyle.SINGLE, size: Math.round(look.rule.width * 6), color: hex(toneColour(look.rule.tone, p)), space: 1 };
  return {
    run: {
      ...(font && { font }),
      size: Math.round(pt * 2),
      bold: (look.weight ?? 400) >= 600,
      italics: look.italic,
      allCaps: look.caps,
      ...(look.tracking && { characterSpacing: Math.round(look.tracking * pt * 20) }),
      ...(look.tone && { color: hex(toneColour(look.tone, p)) }),
    },
    paragraph: {
      ...(look.center && { alignment: AlignmentType.CENTER }),
      ...(rule && { border: { bottom: rule, ...(look.rule?.at === "around" && { top: rule }) } }),
      ...(look.fill && { shading: { type: ShadingType.CLEAR, fill: hex(toneColour(look.fill, p)), color: "auto" } }),
    },
  };
}

/** The design's fonts, spacing, title and headings as the Word document's styles. */
function wordStyles(design: DocDesign): IStylesOptions {
  const fonts = fontsOf(design);
  const set = styleSetOf(design);
  const { line, after } = spacingOf(design);
  return {
    default: {
      document: {
        run: { ...(fonts.body && { font: fonts.body }), size: BODY_PT * 2 },
        // Word measures line spacing in 240ths of a line, and space in twentieths of a point.
        paragraph: { spacing: { line: Math.round(line * 240), after: Math.round(after * 20) } },
      },
      title: wordStyle(set.title, design, fonts.heading),
      heading1: wordStyle(set.h1, design, fonts.heading),
      heading2: wordStyle(set.h2, design, fonts.heading),
      heading3: wordStyle(set.h3, design, fonts.heading),
    },
    paragraphStyles: [
      { id: "Subtitle", name: "Subtitle", basedOn: "Normal", next: "Normal", quickFormat: true, ...wordStyle(set.subtitle, design, "") },
      // Word's Caption: small, italic, in the theme's dark text colour.
      { id: "Caption", name: "Caption", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 18, italics: true, color: hex(paletteOf(design).dark2) } },
    ],
  };
}

const WORD_BORDERS: Record<PageBorder["style"], (typeof BorderStyle)[keyof typeof BorderStyle]> = {
  solid: BorderStyle.SINGLE,
  double: BorderStyle.DOUBLE,
  dotted: BorderStyle.DOTTED,
  dashed: BorderStyle.DASHED,
};

/** Page borders, 24pt in from the edge of the page as Word puts them. */
function pageBorders(border: PageBorder) {
  const edge: IBorderOptions = { style: WORD_BORDERS[border.style], size: Math.round(border.width * 8), color: hex(border.color), space: 24 };
  return {
    pageBorders: { offsetFrom: PageBorderOffsetFrom.PAGE },
    pageBorderTop: edge,
    pageBorderRight: edge,
    pageBorderBottom: edge,
    pageBorderLeft: edge,
  };
}

/** Page number fields go through the conversion as marked text, and become Word fields after. */
const FIELD = "\u2063";

const markFields = (html: string) =>
  html.replace(/<span data-field="(page|pages)"[^>]*>[^<]*<\/span>/g, (_, kind: string) => `${FIELD}${kind === "page" ? "PAGE" : "NUMPAGES"}${FIELD}`);

/** Word's PAGE and NUMPAGES fields where the marks are, in each header and footer. */
async function placeFields(zip: JSZip, revisions: { author: string; date: string }[]) {
  const parts = Object.keys(zip.files).filter((path) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(path));
  const marked = new RegExp(`${FIELD}((?:PAGE|NUMPAGES|FN\\d+|EN\\d+|CS\\d+|CE\\d+|IS\\d+|IE|DS\\d+|DE))${FIELD}`);
  // The tracked change the text is in, across runs.
  let open: { kind: "ins" | "del"; k: number } | null = null;
  const wrap = (run: string) => {
    if (!open) return run;
    const r = revisions[open.k];
    const who = `w:id="${1000 + open.k}" w:author="${escapeXml(r.author)}" w:date="${escapeXml(r.date.replace(/\.\d+Z$/, "Z"))}"`;
    const body = open.kind === "del" ? run.replace(/<w:t(\s|>)/g, "<w:delText$1").replace(/<\/w:t>/g, "</w:delText>") : run;
    return `<w:${open.kind} ${who}>${body}</w:${open.kind}>`;
  };
  // What each mark becomes, with the text's own formatting where it has text.
  const field = (name: string, props: string) => {
    const note = /^(FN|EN)(\d+)$/.exec(name);
    if (note) {
      const kind = note[1] === "FN" ? "footnote" : "endnote";
      return wrap(`<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:${kind}Reference w:id="${note[2]}"/></w:r>`);
    }
    const comment = /^C([SE])(\d+)$/.exec(name);
    if (comment)
      return comment[1] === "S"
        ? `<w:commentRangeStart w:id="${comment[2]}"/>`
        : `<w:commentRangeEnd w:id="${comment[2]}"/><w:r><w:commentReference w:id="${comment[2]}"/></w:r>`;
    const change = /^([ID])([SE])(\d*)$/.exec(name);
    if (change) {
      open = change[2] === "S" ? { kind: change[1] === "I" ? "ins" : "del", k: Number(change[3]) } : null;
      return "";
    }
    return wrap(`<w:fldSimple w:instr=" ${name} \\* MERGEFORMAT "><w:r>${props}<w:t>1</w:t></w:r></w:fldSimple>`);
  };
  for (const path of parts) {
    const xml = await zip.file(path)!.async("string");
    if (!xml.includes(FIELD)) continue;
    open = null;
    zip.file(
      path,
      xml.replace(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g, (run) => {
        if (!run.includes(FIELD)) return wrap(run);
        const props = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(run)?.[0] ?? "";
        const text = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/.exec(run)?.[1] ?? "";
        return text
          .split(marked)
          .map((piece, i) => (i % 2 ? field(piece, props) : piece ? wrap(`<w:r>${props}<w:t xml:space="preserve">${piece}</w:t></w:r>`) : ""))
          .join("");
      }),
    );
  }
}

/** Docs' document → a Word file. `page` is Docs' own complete page, kept inside for reopening. */
export async function toWordFile(title: string, body: string, page: string, layout: PageLayout): Promise<Blob> {
  const twips = (px: number) => Math.round(px * TWIPS_PER_PX);
  const { margins, design, headers } = layout;
  // Word's watermarks sit in the header, so they're on every page.
  const watermark = () =>
    design.watermark &&
    new Paragraph({
      children: [
        new TextWatermark({
          text: design.watermark.text,
          font: design.watermark.font,
          color: hex(design.watermark.color),
          opacity: design.watermark.faint ? 0.5 : 1,
          layout: design.watermark.diagonal ? "diagonal" : "horizontal",
        }),
      ],
    });
  const hfContent = (html: string, header: boolean) => {
    const mark = header ? watermark() : null;
    const content = isBlank(html) ? [] : htmlToContent(markFields(html));
    const all = [...(mark ? [mark] : []), ...content];
    // A header or footer needs at least one paragraph.
    return all.length ? all : [new Paragraph({})];
  };
  const hasHeaders = Boolean(design.watermark) || !isBlank(headers.header) || (headers.differentFirst && !isBlank(headers.firstHeader));
  const hasFooters = !isBlank(headers.footer) || (headers.differentFirst && !isBlank(headers.firstFooter));
  const prepared = await collectImages(body, design, layout.review.comments);
  const doc = new Document({
    title,
    creator: "Dementa Docs",
    ...(layout.hyphenate && { hyphenation: { autoHyphenation: true } }),
    styles: wordStyles(design),
    ...(design.pageColor && { background: { color: hex(design.pageColor) } }),
    footnotes: prepared.footnotes,
    endnotes: prepared.endnotes,
    ...(prepared.comments.length && { comments: { children: prepared.comments } }),
    sections: [
      {
        properties: {
          page: {
            size: {
              width: twips(layout.width),
              height: twips(layout.height),
              orientation: layout.orientation === "portrait" ? PageOrientation.PORTRAIT : PageOrientation.LANDSCAPE,
            },
            margin: { top: twips(margins.top), right: twips(margins.right), bottom: twips(margins.bottom), left: twips(margins.left) },
            ...(design.pageBorder && { borders: pageBorders(design.pageBorder) }),
          },
          ...(headers.differentFirst && { titlePage: true }),
          ...(layout.columns > 1 && { column: { count: layout.columns, space: twips(layout.columnGap), separate: layout.columnLine, equalWidth: true } }),
          // Word counts from w:start + 1.
          ...(layout.lineNumbers && {
            lineNumbers: {
              start: layout.lineNumbers.start - 1,
              countBy: layout.lineNumbers.countBy,
              restart: layout.lineNumbers.perPage ? LineNumberRestartFormat.NEW_PAGE : LineNumberRestartFormat.CONTINUOUS,
            },
          }),
        },
        ...(hasHeaders && {
          headers: { default: new Header({ children: hfContent(headers.header, true) }), ...(headers.differentFirst && { first: new Header({ children: hfContent(headers.firstHeader, true) }) }) },
        }),
        ...(hasFooters && {
          footers: { default: new Footer({ children: hfContent(headers.footer, false) }), ...(headers.differentFirst && { first: new Footer({ children: hfContent(headers.firstFooter, false) }) }) },
        }),
        children: [
          ...htmlToContent(prepared.body, {
            images: prepared.images,
            maxImageWidth: textWidth(layout) / layout.columns,
            styleMap: { 'p[data-style="title"]': "Title", 'p[data-style="subtitle"]': "Subtitle", 'p[data-style="caption"]': "Caption" },
          }),
        ],
      },
    ],
  });
  const zip = await JSZip.loadAsync(await Packer.toBlob(doc));
  await placeFronts(zip, prepared.fronts);
  await placeFields(zip, prepared.revisions);
  await addCopy(zip, page);
  return zip.generateAsync({ type: "blob", mimeType: WORD_TYPE, compression: "DEFLATE" });
}

/** A floating picture's place: anywhere in front of or behind the text, or on a side with text around it. */
interface Float {
  x: number;
  y: number;
  z: number;
  wrap: "front" | "behind" | "square";
  side: "left" | "right";
}

/**
 * Floating pictures come out of the conversion floating at the left; this puts each where it
 * belongs: where it was dragged to, in front of or behind the text and in its place in the pile, or
 * on its side with the text wrapping around it (Word's floating pictures are in document order).
 */
async function placeFronts(zip: JSZip, fronts: Float[]) {
  if (!fronts.length) return;
  const path = "word/document.xml";
  let i = 0;
  const xml = (await zip.file(path)!.async("string")).replace(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g, (anchor) => {
    const place = fronts[i++];
    if (!place) return anchor;
    const square = place.wrap === "square";
    return anchor
      .replace(/^<wp:anchor\b[^>]*>/, (open) =>
        open
          .replace(/\bbehindDoc="[^"]*"/, `behindDoc="${place.wrap === "behind" ? 1 : 0}"`)
          // Word stacks floating pictures by relativeHeight.
          .replace(/\brelativeHeight="[^"]*"/, `relativeHeight="${251659264 + (place.z + 1000) * 1024}"`),
      )
      .replace(
        /<wp:positionH\b[\s\S]*?<\/wp:positionH>/,
        square
          ? `<wp:positionH relativeFrom="column"><wp:align>${place.side}</wp:align></wp:positionH>`
          : `<wp:positionH relativeFrom="column"><wp:posOffset>${Math.round(place.x * EMUS_PER_PX)}</wp:posOffset></wp:positionH>`,
      )
      .replace(/<wp:positionV\b[\s\S]*?<\/wp:positionV>/, `<wp:positionV relativeFrom="paragraph"><wp:posOffset>${square ? 0 : Math.round(place.y * EMUS_PER_PX)}</wp:posOffset></wp:positionV>`)
      .replace(/<wp:wrap(None|Square|Tight|Through|TopAndBottom)\b[^>]*?(\/>|>[\s\S]*?<\/wp:wrap\1>)/, square ? '<wp:wrapSquare wrapText="bothSides"/>' : "<wp:wrapNone/>");
  });
  zip.file(path, xml);
}

/**
 * Puts Docs' page in the Word file as a custom XML part (which Word keeps but doesn't show), with a
 * fingerprint of the Word text it was saved with, so a later change in Word can be noticed.
 */
async function addCopy(zip: JSZip, page: string) {
  const fingerprint = await sha256(await zip.file("word/document.xml")!.async("uint8array"));
  zip.file(
    COPY_PATH,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><page xmlns="${NAMESPACE}" fingerprint="${fingerprint}">${escapeXml(page)}</page>`,
  );
  zip.file(
    COPY_PROPS_PATH,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><ds:datastoreItem ds:itemID="{6D1E3B5A-0C8E-4F0B-9B7E-D0C5DE11A000}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="${NAMESPACE}"/></ds:schemaRefs></ds:datastoreItem>`,
  );
  zip.file(
    "customXml/_rels/item1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps1.xml"/></Relationships>`,
  );

  const types = await zip.file("[Content_Types].xml")!.async("string");
  const override = `<Override PartName="/${COPY_PROPS_PATH}" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/>`;
  const xmlDefault = /Extension="xml"/.test(types) ? "" : `<Default Extension="xml" ContentType="application/xml"/>`;
  zip.file("[Content_Types].xml", types.replace("</Types>", `${xmlDefault}${override}</Types>`));

  const relsPath = "word/_rels/document.xml.rels";
  const rels = await zip.file(relsPath)!.async("string");
  zip.file(
    relsPath,
    rels.replace(
      "</Relationships>",
      `<Relationship Id="rIdDementaPage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../${COPY_PATH}"/></Relationships>`,
    ),
  );
}

/**
 * A Word file → Docs' page (when Docs saved it and it hasn't changed since), or the body of Word's
 * version otherwise.
 */
export async function readWordFile(data: ArrayBuffer): Promise<{ page: string } | { body: string; layout: PageLayout }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error("This Word document is damaged, so it can't be opened.");
  }
  const copy = await zip.file(COPY_PATH)?.async("string");
  const main = await zip.file("word/document.xml")?.async("uint8array");
  if (copy && main) {
    const xml = new DOMParser().parseFromString(copy, "application/xml").documentElement;
    if (xml.namespaceURI === NAMESPACE && xml.getAttribute("fingerprint") === (await sha256(main))) {
      return { page: xml.textContent ?? "" };
    }
  }
  try {
    return await readDocx(zip);
  } catch (error) {
    // Something the reader doesn't understand: at least the words come across.
    console.error("Word document:", error);
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.convertToHtml({ arrayBuffer: data });
    return { body: result.value, layout: DEFAULT_LAYOUT };
  }
}
