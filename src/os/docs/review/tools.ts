// The Review tab's checking tools: spelling and grammar (Editor), the thesaurus, translation,
// the accessibility checker, and comparing two versions of a document.

import type { JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import NSpell from "nspell";

// ---- Spelling and grammar ----

export interface Issue {
  kind: "spelling" | "grammar";
  from: number;
  to: number;
  text: string;
  /** What's wrong, as Word's Editor says it. */
  message: string;
  /** What to put instead (spelling suggestions are looked up when the issue is shown). */
  suggestions: string[];
}

const WORDS_KEY = "dementa-os:docs-dictionary";

let speller: Promise<NSpell> | null = null;
/** Words Ignore All was used on (from the right-click menu or the Editor pane), until Docs closes. */
export const IGNORED_WORDS = new Set<string>();

/** The English dictionary (Hunspell's), loaded once, with the words added to it here. */
export function loadSpeller(): Promise<NSpell> {
  speller ??= Promise.all([fetch("/dictionaries/en.aff").then((r) => r.text()), fetch("/dictionaries/en.dic").then((r) => r.text())]).then(([aff, dic]) => {
    const spell = NSpell({ aff, dic });
    for (const word of ownWords()) spell.add(word);
    return spell;
  });
  return speller;
}

function ownWords(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(WORDS_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((w) => typeof w === "string") : [];
  } catch {
    return [];
  }
}

/** Add to Dictionary: kept for every document. */
export async function addWord(word: string) {
  (await loadSpeller()).add(word);
  try {
    localStorage.setItem(WORDS_KEY, JSON.stringify([...new Set([...ownWords(), word])]));
  } catch {
    // Storage can be blocked; it's still known until Docs closes.
  }
}

/** A paragraph's text as shown (deleted tracked text left out), and where each letter is in the document. */
function shownText(block: PMNode, start: number) {
  let text = "";
  const at: number[] = [];
  block.forEach((child, offset) => {
    const pos = start + offset;
    if (child.isText) {
      if (child.marks.some((m) => m.type.name === "deletion")) return;
      for (let i = 0; i < child.text!.length; i++) {
        text += child.text![i];
        at.push(pos + i);
      }
    } else {
      text += "￼";
      at.push(pos);
    }
  });
  at.push(start + block.content.size);
  return { text, at };
}

const ABBREVIATIONS = new Set(["e.g", "i.e", "etc", "vs", "mr", "mrs", "ms", "dr", "prof", "st", "no", "fig", "al", "approx", "dept"]);
const AN_EXCEPTIONS = /^(uni|use|usu|uti|one|once|eu|ewe|ur[aeiou])/i;
const AN_SILENT_H = /^(hour|honest|honou?r|heir)/i;

/** Grammar slips Word's Editor points out, found with simple rules. */
type Slip = Omit<Issue, "from" | "to"> & { start: number; end: number };

function grammar(text: string): Slip[] {
  const found: Slip[] = [];
  const add = (start: number, end: number, message: string, suggestion: string) =>
    found.push({ kind: "grammar", start, end, text: text.slice(start, end), message, suggestions: [suggestion] });
  for (const m of text.matchAll(/\b(\w+)(\s+)\1\b/gi)) if (!/^\d+$/.test(m[1])) add(m.index, m.index + m[0].length, "Repeated word", m[1]);
  for (const m of text.matchAll(/(?<=\S) {2,}(?=\S)/g)) add(m.index, m.index + m[0].length, "Extra spaces", " ");
  for (const m of text.matchAll(/ +([,.;:!?])/g)) add(m.index, m.index + m[0].length, "Space before punctuation", m[1]);
  for (const m of text.matchAll(/([,;:])(?=[A-Za-z])/g)) add(m.index, m.index + 1, "Missing space after punctuation", `${m[1]} `);
  for (const m of text.matchAll(/(^|[.!?]\s+)([a-z])/g)) {
    const before = text.slice(0, m.index).match(/(\S+)$/)?.[1]?.toLowerCase().replace(/\.$/, "") ?? "";
    if (m[1] && (ABBREVIATIONS.has(before) || before.length === 1)) continue;
    const at = m.index + m[1].length;
    add(at, at + 1, "Capitalization", m[2].toUpperCase());
  }
  for (const m of text.matchAll(/\b(a|an)\s+([A-Za-z]+)/gi)) {
    const word = m[2];
    if (word.length > 1 && word === word.toUpperCase()) continue;
    const vowel = /^[aeiou]/i.test(word) ? !AN_EXCEPTIONS.test(word) : AN_SILENT_H.test(word);
    const right = vowel ? "an" : "a";
    if (m[1].toLowerCase() !== right) add(m.index, m.index + m[1].length, `Use "${right}" before "${word}"`, m[1][0] === "A" ? right[0].toUpperCase() + right.slice(1) : right);
  }
  for (const m of text.matchAll(/(?<![\w'’])i(?![\w'’.])/g)) add(m.index, m.index + 1, "Capitalization", "I");
  return found;
}

/** Every spelling and grammar issue, top to bottom. `ignored` words and issues (by "from:text") are skipped. */
export function findIssues(doc: PMNode, spell: NSpell | null, ignored: Set<string>): Issue[] {
  const issues: Issue[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    issues.push(...blockIssues(node, pos, spell, ignored));
    return false;
  });
  return issues.sort((a, b) => a.from - b.from);
}

/** The spelling and grammar issues in one paragraph (at `pos` in the document). */
export function blockIssues(node: PMNode, pos: number, spell: NSpell | null, ignored: Set<string>): Issue[] {
  // Code isn't checked.
  if (node.type.name === "codeBlock") return [];
  const issues: Issue[] = [];
  const { text, at } = shownText(node, pos + 1);
  const where = (start: number, end: number) => ({ from: at[start], to: at[end - 1] + 1 });
  if (spell) {
    for (const m of text.matchAll(/[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’]*/g)) {
      const word = m[0].replace(/['’]+$/, "");
      const before = text[m.index - 1] ?? " ";
      const after = text[m.index + m[0].length] ?? " ";
      // Words in addresses, mixed with digits, or in capitals (like Word's defaults) aren't checked.
      if (/[\d@/._-]/.test(before) || /[\d@/_]/.test(after) || /^(https?|www)$/i.test(word)) continue;
      if (word.length < 2 || word === word.toUpperCase() || ignored.has(word.toLowerCase()) || IGNORED_WORDS.has(word.toLowerCase())) continue;
      const plain = word.replace(/’/g, "'");
      if (spell.correct(plain) || spell.correct(plain.toLowerCase())) continue;
      const { from, to } = where(m.index, m.index + word.length);
      issues.push({ kind: "spelling", from, to, text: word, message: "Spelling", suggestions: [] });
    }
  }
  for (const g of grammar(text)) {
    if (ignored.has(`${at[g.start]}:${g.text}`)) continue;
    const { from, to } = where(g.start, g.end);
    issues.push({ ...g, from, to });
  }
  return issues;
}

// ---- Thesaurus and translation (free web services, asked only when the panes are used) ----

export interface Synonyms {
  meaning: string;
  synonyms: string[];
  antonyms: string[];
}

/** Datamuse's thesaurus: words that mean the same, and the opposite. */
export async function lookUp(word: string): Promise<Synonyms> {
  const get = (q: string) => fetch(`https://api.datamuse.com/words?${q}`).then((r) => (r.ok ? r.json() : [])) as Promise<{ word: string; defs?: string[] }[]>;
  const [syn, ant, def] = await Promise.all([get(`rel_syn=${encodeURIComponent(word)}&max=30`), get(`rel_ant=${encodeURIComponent(word)}&max=12`), get(`sp=${encodeURIComponent(word)}&md=d&max=1`)]);
  const meaning = def[0]?.defs?.[0]?.replace(/^\w+\t/, "") ?? "";
  return { meaning, synonyms: syn.map((w) => w.word), antonyms: ant.map((w) => w.word) };
}

export const LANGUAGES: [string, string][] = [
  ["en", "English"],
  ["fr", "French"],
  ["es", "Spanish"],
  ["pt", "Portuguese"],
  ["de", "German"],
  ["it", "Italian"],
  ["nl", "Dutch"],
  ["sw", "Swahili"],
  ["ar", "Arabic"],
  ["zh-CN", "Chinese (Simplified)"],
  ["ja", "Japanese"],
  ["hi", "Hindi"],
  ["ru", "Russian"],
];

/** MyMemory's free translation, a passage (up to about 500 letters) at a time. */
export async function translate(text: string, from: string, to: string): Promise<string> {
  const pieces = text.match(/[\s\S]{1,480}(?:\s|$)/g) ?? [text];
  const out: string[] = [];
  for (const piece of pieces) {
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(piece)}&langpair=${encodeURIComponent(from)}|${encodeURIComponent(to)}`);
    if (!r.ok) throw new Error("The translation service didn't answer. Try again later.");
    const data = (await r.json()) as { responseData?: { translatedText?: string }; responseStatus?: number; responseDetails?: string };
    if (data.responseStatus && data.responseStatus !== 200) throw new Error(data.responseDetails || "The translation service couldn't translate this.");
    out.push(data.responseData?.translatedText ?? "");
  }
  return out.join(" ").trim();
}

// ---- Accessibility ----

export interface Finding {
  level: "error" | "warning" | "tip";
  title: string;
  why: string;
  pos: number;
  fix?: "alt" | "headerRow";
}

/** The contrast between two colours, as WCAG works it out (1 to 21). */
function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Check Accessibility: what makes the document hard to read for people using screen readers or with low vision. */
export function checkAccessibility(doc: PMNode, page: string): Finding[] {
  const findings: Finding[] = [];
  let lastLevel = 0;
  doc.descendants((node, pos) => {
    switch (node.type.name) {
      case "image":
        if (!(node.attrs.alt ?? "").trim())
          findings.push({ level: "error", title: "Missing alternative text", why: "Screen readers can't describe this picture. Describe what it shows.", pos, fix: "alt" });
        break;
      case "heading": {
        const level = node.attrs.level as number;
        if (!node.textContent.trim()) findings.push({ level: "warning", title: "Empty heading", why: "A heading with no words in it is announced as blank.", pos });
        if (lastLevel && level > lastLevel + 1) findings.push({ level: "warning", title: `Skipped heading level (Heading ${lastLevel} to ${level})`, why: "Headings should go down one level at a time so the outline makes sense.", pos });
        lastLevel = level;
        break;
      }
      case "table": {
        const first = node.firstChild?.firstChild;
        if (first && first.type.name !== "tableHeader") findings.push({ level: "error", title: "No header row in table", why: "A header row tells screen readers what each column holds.", pos, fix: "headerRow" });
        return false;
      }
      case "text": {
        const link = node.marks.find((m) => m.type.name === "link");
        if (link && /^(click here|here|link|read more|more)$/i.test(node.text!.trim()))
          findings.push({ level: "warning", title: "Unclear hyperlink text", why: `"${node.text}" doesn't say where the link goes.`, pos });
        const colour = node.marks.find((m) => m.type.name === "textStyle")?.attrs.color as string | undefined;
        if (colour && /^#[0-9a-f]{6}$/i.test(colour) && contrast(colour, page) < 4.5)
          findings.push({ level: "warning", title: "Hard-to-read text contrast", why: `This text colour is too close to the page colour (${contrast(colour, page).toFixed(1)}:1; 4.5:1 is needed).`, pos });
        break;
      }
    }
  });
  // One warning about contrast is enough per paragraph: drop repeats next to each other.
  return findings.filter((f, i) => !(i && f.title === findings[i - 1].title && f.title.startsWith("Hard") && f.pos - findings[i - 1].pos < 200));
}

// ---- Compare ----

/** The shortest edit between two lists of words: which are kept, removed and added. */
function diff<T>(a: T[], b: T[]): { op: "same" | "del" | "ins"; item: T }[] {
  const n = a.length;
  const m = b.length;
  // Too big to compare word by word: everything changed.
  if (n * m > 4_000_000) return [...a.map((item) => ({ op: "del" as const, item })), ...b.map((item) => ({ op: "ins" as const, item }))];
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: { op: "same" | "del" | "ins"; item: T }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: "same", item: a[i++] });
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ op: "del", item: a[i++] });
    else out.push({ op: "ins", item: b[j++] });
  }
  while (i < n) out.push({ op: "del", item: a[i++] });
  while (j < m) out.push({ op: "ins", item: b[j++] });
  return out;
}

/**
 * Compare: the revised document's paragraphs, with what changed from the original shown as
 * tracked changes by `author`.
 */
export function compareDocs(original: string[], revised: string[], author: string): JSONContent {
  const date = new Date().toISOString();
  const mark = (kind: "insertion" | "deletion") => [{ type: kind, attrs: { author, date } }];
  const text = (t: string, kind?: "insertion" | "deletion"): JSONContent => ({ type: "text", text: t, ...(kind && { marks: mark(kind) }) });
  const paragraphs: JSONContent[] = [];
  // Blank lines at the end don't count.
  const trim = (list: string[]) => list.slice(0, list.length - [...list].reverse().findIndex((t) => t.trim()) || list.length);
  const raw = diff(trim(original), trim(revised));
  // Paragraphs removed and ones added in their place (in a run of each): compared in pairs, word by word.
  const steps: ({ op: "same" | "del" | "ins"; item: string } | { op: "pair"; item: string; with: string })[] = [];
  for (let k = 0; k < raw.length; ) {
    if (raw[k].op !== "del") {
      steps.push(raw[k++]);
      continue;
    }
    const dels: string[] = [];
    while (raw[k]?.op === "del") dels.push(raw[k++].item);
    const inss: string[] = [];
    while (raw[k]?.op === "ins") inss.push(raw[k++].item);
    const pairs = Math.min(dels.length, inss.length);
    for (let i = 0; i < pairs; i++) steps.push({ op: "pair", item: dels[i], with: inss[i] });
    for (const item of dels.slice(pairs)) steps.push({ op: "del", item });
    for (const item of inss.slice(pairs)) steps.push({ op: "ins", item });
  }
  for (const s of steps) {
    if (s.op === "pair") {
      const words = diff(s.item.split(/(\s+)/), s.with.split(/(\s+)/));
      const content: JSONContent[] = [];
      for (const w of words) {
        if (!w.item) continue;
        const kind = w.op === "same" ? undefined : w.op === "del" ? "deletion" : "insertion";
        const last = content.at(-1);
        if (last && (last.marks?.[0]?.type ?? undefined) === kind) last.text += w.item;
        else content.push(text(w.item, kind));
      }
      paragraphs.push({ type: "paragraph", content });
      continue;
    }
    const kind = s.op === "same" ? undefined : s.op === "del" ? "deletion" : "insertion";
    paragraphs.push({ type: "paragraph", content: s.item ? [text(s.item, kind)] : [] });
  }
  return { type: "doc", content: paragraphs.length ? paragraphs : [{ type: "paragraph" }] };
}
