// Sources, citations and bibliographies (References › Citations & Bibliography), in Word's
// styles: APA, MLA, Chicago, Harvard and IEEE. The document keeps its sources and its style with
// its page layout; citations and the bibliography show them in the chosen style.

export type SourceType = "book" | "article" | "website" | "report";

export interface Source {
  id: string;
  type: SourceType;
  /** "Last, First" each. */
  authors: string[];
  title: string;
  year: string;
  /** Books and reports. */
  publisher: string;
  city: string;
  /** Journal articles. */
  journal: string;
  volume: string;
  issue: string;
  pages: string;
  /** Websites: the site's name, its address and when it was looked at. */
  site: string;
  url: string;
  accessed: string;
}

export type CitationStyle = "apa" | "mla" | "chicago" | "harvard" | "ieee";

export const CITATION_STYLES: { id: CitationStyle; name: string; title: string }[] = [
  { id: "apa", name: "APA Seventh Edition", title: "References" },
  { id: "mla", name: "MLA Ninth Edition", title: "Works Cited" },
  { id: "chicago", name: "Chicago Seventeenth Edition", title: "Bibliography" },
  { id: "harvard", name: "Harvard - Anglia", title: "Reference List" },
  { id: "ieee", name: "IEEE", title: "References" },
];

export const SOURCE_TYPES: { id: SourceType; name: string }[] = [
  { id: "book", name: "Book" },
  { id: "article", name: "Journal Article" },
  { id: "website", name: "Web site" },
  { id: "report", name: "Report" },
];

export interface References {
  style: CitationStyle;
  sources: Source[];
}

export const NO_REFERENCES: References = { style: "apa", sources: [] };

export const emptySource = (): Source => ({
  id: `s${Math.random().toString(36).slice(2, 8)}`,
  type: "book",
  authors: [],
  title: "",
  year: "",
  publisher: "",
  city: "",
  journal: "",
  volume: "",
  issue: "",
  pages: "",
  site: "",
  url: "",
  accessed: "",
});

const esc = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const em = (text: string) => (text ? `<em>${esc(text)}</em>` : "");

interface Name {
  last: string;
  first: string;
}

const nameOf = (author: string): Name => {
  const [last, first = ""] = author.split(",").map((s) => s.trim());
  return { last, first };
};

/** "Ada Mary" → "A. M." */
const initials = (first: string) =>
  first
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((p) => `${p[0].toUpperCase()}.`)
    .join(" ");

const lastNames = (s: Source) => s.authors.map((a) => nameOf(a).last).filter(Boolean);

/** The names in a citation: one, two, or the first and "et al.". */
function citedNames(s: Source, style: CitationStyle) {
  const names = lastNames(s);
  if (!names.length) return s.title || "Anonymous";
  if (names.length === 1) return names[0];
  if (names.length === 2) return style === "apa" ? `${names[0]} & ${names[1]}` : `${names[0]} and ${names[1]}`;
  return `${names[0]} et al.`;
}

const yearOf = (s: Source) => s.year || "n.d.";

/**
 * A citation in the text, like "(Smith, 2020, p. 12)" or "[3]". `number` is its place in the
 * bibliography, for IEEE.
 */
export function citationText(sources: Source[], style: CitationStyle, pages: string, number: (s: Source) => number): string {
  if (!sources.length) return "(Citation)";
  if (style === "ieee") return `[${sources.map(number).sort((a, b) => a - b).join(", ")}]`;
  const one = (s: Source, last: boolean) => {
    const who = citedNames(s, style);
    const p = last && pages ? pages : "";
    switch (style) {
      case "mla":
        return p ? `${who} ${p}` : who;
      case "chicago":
        return `${who} ${yearOf(s)}${p ? `, ${p}` : ""}`;
      default:
        return `${who}, ${yearOf(s)}${p ? `, p. ${p}` : ""}`;
    }
  };
  return `(${sources.map((s, i) => one(s, i === sources.length - 1)).join("; ")})`;
}

/** Authors as a bibliography lists them, in each style. */
function authorList(s: Source, style: CitationStyle) {
  const names = s.authors.map(nameOf).filter((n) => n.last);
  if (!names.length) return "";
  switch (style) {
    case "apa": {
      const parts = names.map((n) => `${n.last}${n.first ? `, ${initials(n.first)}` : ""}`);
      return parts.length > 1 ? `${parts.slice(0, -1).join(", ")}, & ${parts.at(-1)}` : parts[0];
    }
    case "harvard": {
      const parts = names.map((n) => `${n.last}${n.first ? `, ${initials(n.first)}` : ""}`);
      return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
    }
    case "ieee": {
      const parts = names.map((n) => `${n.first ? `${initials(n.first)} ` : ""}${n.last}`);
      return parts.length > 2 ? `${parts[0]} et al.` : parts.join(" and ");
    }
    default: {
      // MLA and Chicago: the first name turned round, the rest as written.
      const first = `${names[0].last}${names[0].first ? `, ${names[0].first}` : ""}`;
      if (names.length === 1) return first;
      if (style === "mla" && names.length > 2) return `${first}, et al`;
      const rest = names.slice(1).map((n) => `${n.first ? `${n.first} ` : ""}${n.last}`);
      return `${first}, ${rest.length > 1 ? `${rest.slice(0, -1).join(", ")}, and ${rest.at(-1)}` : `and ${rest[0]}`}`;
    }
  }
}

const join = (...parts: string[]) => parts.filter(Boolean).join(" ");
const end = (text: string) => (text && !/[.?!]$/.test(text.replace(/<[^>]+>/g, "")) ? `${text}.` : text);

/** One bibliography entry, as HTML (titles in italics). */
export function bibliographyEntry(s: Source, style: CitationStyle, number: number): string {
  const who = esc(authorList(s, style));
  const year = esc(yearOf(s));
  const t = esc(s.title);
  const place = esc([s.city, s.publisher].filter(Boolean).join(": "));
  const volume = esc(s.volume);
  const issue = esc(s.issue);
  const pages = esc(s.pages);
  const url = esc(s.url);
  switch (style) {
    case "apa":
      if (s.type === "article")
        return join(end(who), `(${year}).`, end(t), `${em(s.journal)}${volume ? `, ${em(s.volume)}` : ""}${issue ? `(${issue})` : ""}${pages ? `, ${pages}` : ""}.`);
      if (s.type === "website") return join(end(who), `(${year}).`, end(em(s.title)), end(esc(s.site)), url);
      return join(end(who), `(${year}).`, end(em(s.title)), end(esc(s.publisher)));
    case "mla":
      if (s.type === "article")
        return join(end(who), `"${end(t)}"`, `${em(s.journal)}${volume ? `, vol. ${volume}` : ""}${issue ? `, no. ${issue}` : ""}, ${year}${pages ? `, pp. ${pages}` : ""}.`);
      if (s.type === "website") return join(end(who), `"${end(t)}"`, `${em(s.site)}${s.site ? ", " : ""}${year}${url ? `, ${url}` : ""}.`);
      return join(end(who), end(em(s.title)), `${esc(s.publisher)}${s.publisher ? ", " : ""}${year}.`);
    case "chicago":
      if (s.type === "article") return join(end(who), `${year}.`, `"${end(t)}"`, `${em(s.journal)}${volume ? ` ${volume}` : ""}${issue ? ` (${issue})` : ""}${pages ? `: ${pages}` : ""}.`);
      if (s.type === "website") return join(end(who), `${year}.`, `"${end(t)}"`, end(esc(s.site)), url);
      return join(end(who), `${year}.`, end(em(s.title)), end(place));
    case "harvard":
      if (s.type === "article")
        return join(who, `(${year})`, `'${t}',`, `${em(s.journal)}${volume ? `, ${volume}` : ""}${issue ? `(${issue})` : ""}${pages ? `, pp. ${pages}` : ""}.`);
      if (s.type === "website") return join(who, `(${year})`, end(em(s.title)), url ? `Available at: ${url}${s.accessed ? ` (Accessed: ${esc(s.accessed)})` : ""}.` : "");
      return join(who, `(${year})`, end(em(s.title)), end(place));
    case "ieee":
      if (s.type === "article")
        return join(`[${number}]`, `${who},`, `"${t},"`, `${em(s.journal)}${volume ? `, vol. ${volume}` : ""}${issue ? `, no. ${issue}` : ""}${pages ? `, pp. ${pages}` : ""}, ${year}.`);
      if (s.type === "website") return join(`[${number}]`, `${who},`, `"${t}."`, end(esc(s.site)), url ? `[Online]. Available: ${url}` : "");
      return join(`[${number}]`, `${who},`, `${em(s.title)}.`, `${place}${place ? ", " : ""}${year}.`);
  }
}

/** Sorted as each style lists them: by author (or title), or for IEEE in the order they're first cited. */
export function bibliographyOrder(sources: Source[], style: CitationStyle, citedOrder: string[]): Source[] {
  if (style === "ieee") {
    const rank = (s: Source) => {
      const i = citedOrder.indexOf(s.id);
      return i < 0 ? Infinity : i;
    };
    return [...sources].sort((a, b) => rank(a) - rank(b));
  }
  const key = (s: Source) => (lastNames(s)[0] ?? s.title).toLowerCase();
  return [...sources].sort((a, b) => key(a).localeCompare(key(b)) || yearOf(a).localeCompare(yearOf(b)));
}

/** A short label for a source in menus: "Smith (2020) – Networks". */
export const sourceLabel = (s: Source) => `${citedNames(s, "apa")} (${yearOf(s)})${s.title ? ` – ${s.title}` : ""}`;

const text = (v: unknown) => (typeof v === "string" ? v.slice(0, 2000) : "");

export function parseReferences(value: unknown): References {
  if (!value || typeof value !== "object") return NO_REFERENCES;
  const v = value as Record<string, unknown>;
  const style = CITATION_STYLES.some((s) => s.id === v.style) ? (v.style as CitationStyle) : "apa";
  const sources = Array.isArray(v.sources)
    ? v.sources
        .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object" && typeof s.id === "string")
        .map((s) => ({
          ...emptySource(),
          id: String(s.id),
          type: SOURCE_TYPES.some((t) => t.id === s.type) ? (s.type as SourceType) : "book",
          authors: Array.isArray(s.authors) ? s.authors.filter((a): a is string => typeof a === "string").slice(0, 50) : [],
          title: text(s.title),
          year: text(s.year),
          publisher: text(s.publisher),
          city: text(s.city),
          journal: text(s.journal),
          volume: text(s.volume),
          issue: text(s.issue),
          pages: text(s.pages),
          site: text(s.site),
          url: text(s.url),
          accessed: text(s.accessed),
        }))
    : [];
  return { style, sources };
}
