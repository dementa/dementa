// Word documents (.docx). Saving turns the document into a real Word file, and also tucks a copy of
// Docs' own page inside it, so the document opens in Docs again exactly as it was. When the file
// has changed since (it was edited in Word, say), or it came from somewhere else, Docs reads Word's
// version instead, which keeps the words, headings, lists, tables, pictures and links.

import { Document, Packer, PageOrientation } from "docx";
import { htmlToContent, type HtmlImage } from "docx/html";
import JSZip from "jszip";
import { MARGINS, PAGE_SIZES, type PageLayout } from "./layout";

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
async function collectImages(body: string) {
  const page = new DOMParser().parseFromString(body, "text/html");
  const images: Record<string, HtmlImage> = {};
  // Where each picture in front of the text was moved to, in order.
  const fronts = [...page.querySelectorAll<HTMLElement>("img[data-wrap=front]")].map((img) => ({
    x: Number(img.dataset.x) || 0,
    y: Number(img.dataset.y) || 0,
  }));
  await Promise.all(
    [...page.querySelectorAll("img")].map(async (img, i) => {
      const src = img.getAttribute("src") ?? "";
      const key = `dementa-image-${i}`;
      if (src.startsWith("data:image/svg+xml")) {
        const png = await svgToPng(src);
        if (png) images[key] = { data: src, fallback: png };
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
  return { body: page.body.innerHTML, images, fronts };
}

/** Docs' document → a Word file. `page` is Docs' own complete page, kept inside for reopening. */
export async function toWordFile(title: string, body: string, page: string, layout: PageLayout): Promise<Blob> {
  const { w, h } = PAGE_SIZES[layout.size];
  const margin = MARGINS[layout.margins].px * TWIPS_PER_PX;
  const textWidth = (layout.orientation === "portrait" ? w : h) - 2 * MARGINS[layout.margins].px;
  const prepared = await collectImages(body);
  const doc = new Document({
    title,
    creator: "Dementa Docs",
    sections: [
      {
        properties: {
          page: {
            size: {
              width: w * TWIPS_PER_PX,
              height: h * TWIPS_PER_PX,
              orientation: layout.orientation === "portrait" ? PageOrientation.PORTRAIT : PageOrientation.LANDSCAPE,
            },
            margin: { top: margin, right: margin, bottom: margin, left: margin },
          },
        },
        children: [...htmlToContent(prepared.body, { images: prepared.images, maxImageWidth: textWidth })],
      },
    ],
  });
  const zip = await JSZip.loadAsync(await Packer.toBlob(doc));
  await placeFronts(zip, prepared.fronts);
  await addCopy(zip, page);
  return zip.generateAsync({ type: "blob", mimeType: WORD_TYPE, compression: "DEFLATE" });
}

/**
 * Pictures in front of the text come out of the conversion floating at the left; this puts each
 * where it was dragged to, in front of the text (Word's floating pictures are in document order).
 */
async function placeFronts(zip: JSZip, fronts: { x: number; y: number }[]) {
  if (!fronts.length) return;
  const path = "word/document.xml";
  let i = 0;
  const xml = (await zip.file(path)!.async("string")).replace(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g, (anchor) => {
    const place = fronts[i++];
    if (!place) return anchor;
    return anchor
      .replace(/<wp:positionH\b[\s\S]*?<\/wp:positionH>/, `<wp:positionH relativeFrom="column"><wp:posOffset>${Math.round(place.x * EMUS_PER_PX)}</wp:posOffset></wp:positionH>`)
      .replace(/<wp:positionV\b[\s\S]*?<\/wp:positionV>/, `<wp:positionV relativeFrom="paragraph"><wp:posOffset>${Math.round(place.y * EMUS_PER_PX)}</wp:posOffset></wp:positionV>`)
      .replace(/<wp:wrap(Square|Tight|Through|TopAndBottom)\b[^>]*?(\/>|>[\s\S]*?<\/wp:wrap\1>)/, "<wp:wrapNone/>");
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
export async function readWordFile(data: ArrayBuffer): Promise<{ page: string } | { body: string }> {
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
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.convertToHtml({ arrayBuffer: data });
  return { body: result.value };
}
