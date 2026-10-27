// Mail merge, as in Word's Mailings tab: a list of recipients (typed in, or from a CSV file),
// merge fields in the document that stand for their details, and finishing the merge into one
// letter (or e-mail, envelope, label, directory line) per recipient. Also Create › Envelopes and
// Labels. The merge's settings and list are saved with the document's page layout.

import type { JSONContent } from "@tiptap/core";

export type MergeType = "none" | "letters" | "email" | "envelopes" | "labels" | "directory";

export interface MailMerge {
  type: MergeType;
  /** The list's column names, in order. */
  fields: string[];
  records: Record<string, string>[];
  /** Records left out of the merge (Edit Recipient List), by their place in `records`. */
  excluded: number[];
  /** Word's address fields → the list's columns (Match Fields). */
  match: Record<string, string>;
  /** Where the list came from: "Typed in" or a file name. */
  source: string;
}

export const NO_MERGE: MailMerge = { type: "none", fields: [], records: [], excluded: [], match: {}, source: "" };

/** Word's columns for a new list (Type a New List). */
export const NEW_LIST_FIELDS = ["Title", "First Name", "Last Name", "Company Name", "Address Line 1", "Address Line 2", "City", "State", "ZIP Code", "Country or Region", "Home Phone", "Work Phone", "E-mail Address"];

/** Word's address fields, which Address Block and Greeting Line are made of (Match Fields). */
export const ADDRESS_FIELDS = ["Courtesy Title", "First Name", "Last Name", "Company", "Address 1", "Address 2", "City", "State", "Postal Code", "Country or Region", "E-mail Address"];

/** Other names lists use for each address field, for matching them up on their own. */
const ALIASES: Record<string, string[]> = {
  "Courtesy Title": ["title", "courtesy title", "salutation", "mr/ms"],
  "First Name": ["first name", "firstname", "first", "given name", "forename"],
  "Last Name": ["last name", "lastname", "last", "surname", "family name"],
  Company: ["company", "company name", "organisation", "organization", "business"],
  "Address 1": ["address", "address 1", "address line 1", "street", "address1"],
  "Address 2": ["address 2", "address line 2", "address2"],
  City: ["city", "town"],
  State: ["state", "province", "county", "region"],
  "Postal Code": ["postal code", "zip", "zip code", "postcode", "post code"],
  "Country or Region": ["country", "country or region", "nation"],
  "E-mail Address": ["e-mail address", "email", "e-mail", "email address", "mail"],
};

/** Match Fields: each address field to the list's column with the same (or a usual other) name. */
export function guessMatch(fields: string[], current: Record<string, string> = {}): Record<string, string> {
  const match: Record<string, string> = {};
  for (const std of ADDRESS_FIELDS) {
    if (current[std] && fields.includes(current[std])) {
      match[std] = current[std];
      continue;
    }
    const found = fields.find((f) => ALIASES[std].includes(f.trim().toLowerCase()));
    if (found) match[std] = found;
  }
  return match;
}

/** The records in the merge: all but the ones left out. */
export const includedRecords = (m: MailMerge) => m.records.map((r, i) => ({ r, i })).filter(({ i }) => !m.excluded.includes(i));

// ---- CSV ----

/** A CSV (or tab-separated) file → column names and records, quotes and all. */
export function parseCsv(text: string): { fields: string[]; records: Record<string, string>[] } {
  const clean = text.replace(/^﻿/, "");
  const first = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/\t/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? "\t" : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head = [], ...body] = rows.filter((r) => r.some((c) => c.trim()));
  const fields = head.map((h, i) => h.trim() || `Column ${i + 1}`);
  return { fields, records: body.map((r) => Object.fromEntries(fields.map((f, i) => [f, (r[i] ?? "").trim()]))) };
}

// ---- What a field shows ----

export interface GreetingOptions {
  /** "Dear", "To", or none. */
  salutation: string;
  /** "full" (Joshua Randall Jr.), "first" (Joshua), "title-last" (Mr. Randall). */
  name: "full" | "first" | "title-last";
  punctuation: string;
  /** When a recipient has no name: "Dear Sir or Madam,". */
  fallback: string;
}

export const DEFAULT_GREETING: GreetingOptions = { salutation: "Dear", name: "full", punctuation: ",", fallback: "Dear Sir or Madam," };

export interface AddressOptions {
  name: "full" | "title-full" | "first";
  company: boolean;
  country: boolean;
}

export const DEFAULT_ADDRESS: AddressOptions = { name: "title-full", company: true, country: false };

/** A record's value for one of Word's address fields, through Match Fields. */
const std = (m: MailMerge, r: Record<string, string>, name: string) => {
  const column = m.match[name];
  return (column ? r[column] : r[name]) ?? "";
};

export function addressBlock(m: MailMerge, r: Record<string, string>, o: AddressOptions = DEFAULT_ADDRESS): string[] {
  const first = std(m, r, "First Name");
  const last = std(m, r, "Last Name");
  const title = std(m, r, "Courtesy Title");
  const name = o.name === "first" ? first : [o.name === "title-full" ? title : "", first, last].filter(Boolean).join(" ");
  const cityLine = [std(m, r, "City"), std(m, r, "State"), std(m, r, "Postal Code")].filter(Boolean).join(" ");
  return [name, o.company ? std(m, r, "Company") : "", std(m, r, "Address 1"), std(m, r, "Address 2"), cityLine, o.country ? std(m, r, "Country or Region") : ""].filter(
    (line) => line.trim(),
  );
}

export function greetingLine(m: MailMerge, r: Record<string, string>, o: GreetingOptions = DEFAULT_GREETING): string {
  const first = std(m, r, "First Name");
  const last = std(m, r, "Last Name");
  const title = std(m, r, "Courtesy Title");
  const name = o.name === "first" ? first : o.name === "title-last" ? [title, last].filter(Boolean).join(" ") : [first, last].filter(Boolean).join(" ");
  if (!name.trim()) return o.fallback;
  return `${o.salutation ? `${o.salutation} ` : ""}${name}${o.punctuation}`;
}

export type Comparison = "equal" | "notEqual" | "less" | "greater" | "blank" | "notBlank" | "contains";

export const COMPARISONS: { id: Comparison; name: string }[] = [
  { id: "equal", name: "Equal to" },
  { id: "notEqual", name: "Not equal to" },
  { id: "less", name: "Less than" },
  { id: "greater", name: "Greater than" },
  { id: "contains", name: "Contains" },
  { id: "blank", name: "Is blank" },
  { id: "notBlank", name: "Is not blank" },
];

export function compare(value: string, op: Comparison, against: string): boolean {
  const a = value.trim();
  const b = against.trim();
  const numbers = a !== "" && b !== "" && !Number.isNaN(Number(a)) && !Number.isNaN(Number(b));
  switch (op) {
    case "equal":
      return a.toLowerCase() === b.toLowerCase();
    case "notEqual":
      return a.toLowerCase() !== b.toLowerCase();
    case "less":
      return numbers ? Number(a) < Number(b) : a.localeCompare(b) < 0;
    case "greater":
      return numbers ? Number(a) > Number(b) : a.localeCompare(b) > 0;
    case "contains":
      return a.toLowerCase().includes(b.toLowerCase());
    case "blank":
      return !a;
    case "notBlank":
      return Boolean(a);
  }
}

/** A merge field's settings, as its node keeps them (mergeNodes.ts). */
export interface FieldAttrs {
  kind: "field" | "address" | "greeting" | "if" | "skip" | "record";
  name: string;
  op: Comparison;
  value: string;
  then: string;
  otherwise: string;
  options: string;
}

/** What a merge field shows for a record (`at` is its place in the merge, from 1). */
export function fieldText(m: MailMerge, r: Record<string, string>, f: FieldAttrs, at: number): string {
  switch (f.kind) {
    case "address":
      return addressBlock(m, r, { ...DEFAULT_ADDRESS, ...parseOptions(f.options) }).join("\n");
    case "greeting":
      return greetingLine(m, r, { ...DEFAULT_GREETING, ...parseOptions(f.options) });
    case "if":
      return compare(r[f.name] ?? "", f.op, f.value) ? f.then : f.otherwise;
    case "skip":
      return "";
    case "record":
      return String(at);
    default:
      return r[f.name] ?? "";
  }
}

const parseOptions = (text: string) => {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
};

/** How a merge field reads while not previewing: «First Name», «AddressBlock». */
export function fieldLabel(f: Pick<FieldAttrs, "kind" | "name">): string {
  switch (f.kind) {
    case "address":
      return "«AddressBlock»";
    case "greeting":
      return "«GreetingLine»";
    case "if":
      return `«IF ${f.name}»`;
    case "skip":
      return `«Skip Record If ${f.name}»`;
    case "record":
      return "«Merge Record #»";
    default:
      return `«${f.name}»`;
  }
}

// ---- Finishing the merge ----

const walk = (node: JSONContent, visit: (n: JSONContent) => JSONContent[] | null): JSONContent => {
  if (!node.content) return node;
  return { ...node, content: node.content.flatMap((child) => visit(child) ?? [walk(child, visit)]) };
};

const fieldsOf = (node: JSONContent): FieldAttrs[] => {
  const found: FieldAttrs[] = [];
  const visit = (n: JSONContent) => {
    if (n.type === "mergeField") found.push(n.attrs as FieldAttrs);
    n.content?.forEach(visit);
  };
  visit(node);
  return found;
};

/** Whether a "Skip Record If" rule in the document leaves this record out. */
export const skipped = (doc: JSONContent, r: Record<string, string>) => fieldsOf(doc).some((f) => f.kind === "skip" && compare(r[f.name] ?? "", f.op, f.value));

/** The document with its merge fields filled in for one record (multi-line ones become line breaks). */
export function fillDoc(doc: JSONContent, m: MailMerge, r: Record<string, string>, at: number): JSONContent {
  return walk(doc, (n) => {
    if (n.type !== "mergeField") return null;
    const text = fieldText(m, r, n.attrs as FieldAttrs, at);
    if (!text) return [];
    return text.split("\n").flatMap((line, i) => [...(i ? [{ type: "hardBreak" }] : []), ...(line ? [{ type: "text", text: line, ...(n.marks && { marks: n.marks }) }] : [])]);
  });
}

/**
 * Finish & Merge: one copy of the document per record in the merge, filled in: letters and
 * e-mails start on a new page each, a directory runs them on one after another. Labels fill the
 * label cells in order (see `fillLabels`).
 */
export function mergeAll(doc: JSONContent, m: MailMerge, which: "all" | number[]): JSONContent {
  const records = includedRecords(m).filter(({ i }) => which === "all" || which.includes(i));
  const kept = records.filter(({ r }) => !skipped(doc, r));
  if (m.type === "labels") return fillLabels(doc, m, kept.map(({ r }) => r));
  const parts: JSONContent[] = [];
  kept.forEach(({ r }, n) => {
    if (n && m.type !== "directory") parts.push({ type: "pageBreak" });
    parts.push(...(fillDoc(doc, m, r, n + 1).content ?? []));
  });
  return { type: "doc", content: parts.length ? parts : [{ type: "paragraph" }] };
}

/** Labels: each label cell (in order, page after page of the sheet) gets the next record. */
function fillLabels(doc: JSONContent, m: MailMerge, records: Record<string, string>[]): JSONContent {
  const table = doc.content?.find((n) => n.type === "table");
  if (!table) return doc;
  const perSheet = (table.content ?? []).reduce((n, row) => n + (row.content?.length ?? 0), 0) || 1;
  const sheets: JSONContent[] = [];
  for (let start = 0; start < Math.max(records.length, 1); start += perSheet) {
    let k = start;
    const filled = walk(table, (n) => {
      if (n.type !== "tableCell") return null;
      const r = records[k++];
      return [r ? fillDoc(n, m, r, k) : { ...n, content: [{ type: "paragraph" }] }];
    });
    if (sheets.length) sheets.push({ type: "pageBreak" });
    sheets.push(filled);
  }
  return { type: "doc", content: sheets };
}

// ---- Envelopes and labels ----

const IN = 96;
const MM = 96 / 25.4;

/** Word's envelope sizes, held flat (width × height). */
export const ENVELOPES = [
  { id: "dl", name: "DL (110 × 220 mm)", w: 220 * MM, h: 110 * MM },
  { id: "c5", name: "C5 (162 × 229 mm)", w: 229 * MM, h: 162 * MM },
  { id: "c6", name: "C6 (114 × 162 mm)", w: 162 * MM, h: 114 * MM },
  { id: "10", name: "Size 10 (4 1/8 × 9 1/2 in)", w: 9.5 * IN, h: 4.125 * IN },
  { id: "monarch", name: "Monarch (3 7/8 × 7 1/2 in)", w: 7.5 * IN, h: 3.875 * IN },
];

/** Label sheets, as Word's Label Options lists them: the label's size and how many across and down. */
export const LABEL_SHEETS = [
  { id: "5160", name: "Avery US Letter 5160 Address Labels", paper: "letter", across: 3, down: 10, w: 2.625 * IN, h: 1 * IN, top: 0.5 * IN, side: 0.1875 * IN, gap: 0.125 * IN },
  { id: "5163", name: "Avery US Letter 5163 Shipping Labels", paper: "letter", across: 2, down: 5, w: 4 * IN, h: 2 * IN, top: 0.5 * IN, side: 0.15625 * IN, gap: 0.1875 * IN },
  { id: "L7160", name: "Avery A4/A5 L7160 Address Labels", paper: "a4", across: 3, down: 7, w: 63.5 * MM, h: 38.1 * MM, top: 15.15 * MM, side: 7.25 * MM, gap: 2.5 * MM },
  { id: "L7163", name: "Avery A4/A5 L7163 Address Labels", paper: "a4", across: 2, down: 7, w: 99.1 * MM, h: 38.1 * MM, top: 15.15 * MM, side: 4.65 * MM, gap: 2.5 * MM },
  { id: "L7651", name: "Avery A4/A5 L7651 Mini Labels", paper: "a4", across: 5, down: 13, w: 38.1 * MM, h: 21.2 * MM, top: 10.7 * MM, side: 4.75 * MM, gap: 2.5 * MM },
];

const lines = (text: string): JSONContent[] =>
  text
    .split("\n")
    .flatMap((line, i) => [...(i ? [{ type: "hardBreak" }] : []), ...(line ? [{ type: "text", text: line }] : [])]);

/** The paragraphs of an envelope: the return address top left, the delivery address in the middle. */
export function envelopeDoc(delivery: JSONContent[], returnAddress: string, envelope: (typeof ENVELOPES)[number]): JSONContent {
  return {
    type: "doc",
    content: [
      { type: "paragraph", content: lines(returnAddress) },
      // Word puts the delivery address about a third down and halfway across.
      { type: "paragraph", attrs: { indent: (envelope.w * 0.42) / 48, spaceBefore: Math.round(envelope.h * 0.22) }, content: delivery },
    ],
  };
}

/** A sheet of labels: a table of label-sized cells, each holding `label` (or empty). */
export function labelsDoc(label: JSONContent[], sheet: (typeof LABEL_SHEETS)[number], fill: boolean): JSONContent {
  const cell = (content: JSONContent[]): JSONContent => ({
    type: "tableCell",
    attrs: { colwidth: [Math.round(sheet.w)], height: `${Math.round(sheet.h)}px`, padding: "4px 8px", verticalAlign: "middle", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none" },
    content: [{ type: "paragraph", content }],
  });
  const gap = (): JSONContent => ({ ...cell([]), attrs: { ...cell([]).attrs, colwidth: [Math.round(sheet.gap)] } });
  const rows: JSONContent[] = [];
  for (let r = 0; r < sheet.down; r++) {
    const cells: JSONContent[] = [];
    for (let c = 0; c < sheet.across; c++) {
      if (c) cells.push(gap());
      cells.push(cell(fill || (r === 0 && c === 0) ? label : []));
    }
    rows.push({ type: "tableRow", content: cells });
  }
  return { type: "doc", content: [{ type: "table", content: rows }] };
}

/** Update Labels: the first label's content in every label. */
export function updateLabels(doc: JSONContent): JSONContent {
  const table = doc.content?.find((n) => n.type === "table");
  const first = table?.content?.[0]?.content?.[0]?.content;
  if (!table || !first) return doc;
  // Gap cells (narrow columns between labels) stay empty.
  const width = table.content?.[0]?.content?.[0]?.attrs?.colwidth?.[0] ?? 0;
  return walk(doc, (n) => (n.type === "tableCell" && (n.attrs?.colwidth?.[0] ?? 0) >= width * 0.5 ? [{ ...n, content: first }] : null));
}

// ---- Saving ----

const text = (v: unknown) => (typeof v === "string" ? v : "");

export function parseMailMerge(value: unknown): MailMerge {
  if (!value || typeof value !== "object") return NO_MERGE;
  const v = value as Record<string, unknown>;
  const fields = Array.isArray(v.fields) ? v.fields.filter((f): f is string => typeof f === "string").slice(0, 200) : [];
  const records = Array.isArray(v.records)
    ? v.records
        .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
        .slice(0, 50000)
        .map((r) => Object.fromEntries(fields.map((f) => [f, text(r[f])])))
    : [];
  const types: MergeType[] = ["none", "letters", "email", "envelopes", "labels", "directory"];
  return {
    type: types.includes(v.type as MergeType) ? (v.type as MergeType) : "none",
    fields,
    records,
    excluded: Array.isArray(v.excluded) ? v.excluded.filter((n): n is number => Number.isInteger(n)) : [],
    match: v.match && typeof v.match === "object" ? Object.fromEntries(Object.entries(v.match as Record<string, unknown>).filter(([, c]) => typeof c === "string")) as Record<string, string> : {},
    source: text(v.source),
  };
}
