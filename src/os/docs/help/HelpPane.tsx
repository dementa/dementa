"use client";

// The Help tab's pane: help topics (searchable), keyboard shortcuts, short training guides, and
// what's new in Docs. Everything here describes what Docs does today.

import { ArrowLeft, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

export type HelpSection = "help" | "shortcuts" | "training" | "whatsnew";

interface Topic {
  title: string;
  /** Where it is, like "Layout tab". */
  where: string;
  body: string[];
}

const TOPICS: Topic[] = [
  {
    title: "Save, open and share documents",
    where: "File",
    body: [
      "Ctrl+S saves the document to your files in the cloud; the first time, it asks for a name and a folder. File › Save as saves a copy elsewhere.",
      "Docs saves Word files (.docx) that open in Word with their pages, styles, headers and footers, footnotes, comments and tracked changes, and opens Word files you're given.",
      "What you type is also kept as a draft on this computer, so closing the window doesn't lose it.",
    ],
  },
  {
    title: "Format text and paragraphs",
    where: "Home tab",
    body: [
      "Font, size, bold, italic, underline, colours and highlight are in the Font group; alignment, lists, indents, line spacing, shading and borders in the Paragraph group.",
      "Styles (Normal, Title, Heading 1–3, Quote) give text a consistent look; headings also make the table of contents and the Navigation Pane.",
      "Find and Replace is under Editing (Ctrl+F, Ctrl+H).",
    ],
  },
  {
    title: "Insert pictures, tables, shapes and links",
    where: "Insert tab",
    body: [
      "Insert pictures from your computer or online, tables, shapes, SmartArt, charts, screenshots and videos, links, bookmarks and cross-references.",
      "Select a picture or shape to get its Format tab: wrap text around it (In Line, Square, Top and Bottom, Behind or In Front of Text), size it, and arrange it. Shift+click selects several; Group joins them.",
    ],
  },
  {
    title: "Pages, headers, footers and page numbers",
    where: "Insert and Layout tabs",
    body: [
      "Docs shows real pages: text flows on to the next page when one fills up. Ctrl+Enter starts a new page.",
      "Insert › Header, Footer and Page Number add them to every page; double-click the top or bottom margin of a page to edit them. Different First Page is on the Header & Footer tab.",
      "Layout sets margins, orientation, paper size, columns, line numbers and hyphenation; the corner buttons on Page Setup and Paragraph open all their settings.",
    ],
  },
  {
    title: "Themes, colours, watermark and page borders",
    where: "Design tab",
    body: [
      "Themes, Colors and Fonts change the whole document's look; the style set gallery changes how titles and headings look; Paragraph Spacing the space between paragraphs.",
      "Watermark, Page Color and Page Borders are under Page Background. Set as Default makes new documents start with the current look.",
    ],
  },
  {
    title: "Table of contents, footnotes and citations",
    where: "References tab",
    body: [
      "Table of Contents builds one from your headings, with page numbers; it updates as you write.",
      "Insert Footnote (Alt+Ctrl+F) puts a note at the bottom of the page; Insert Endnote at the end of the document. Click a note's number to type it.",
      "Insert Citation and Manage Sources keep your sources; Style switches between APA, MLA, Chicago, Harvard and IEEE, and Bibliography lists them in that style.",
      "Insert Caption numbers figures and tables; Mark Entry and Insert Index make an index.",
    ],
  },
  {
    title: "Mail merge, envelopes and labels",
    where: "Mailings tab",
    body: [
      "Select Recipients (type a list or use a CSV file), then put Address Block, Greeting Line and merge fields in the document. Preview Results shows each person's version.",
      "Finish & Merge makes one document with a page per person, prints them, or prepares e-mails to send from your mail app.",
      "Envelopes and Labels make a document laid out for printing them.",
    ],
  },
  {
    title: "Check spelling, comment and track changes",
    where: "Review tab",
    body: [
      "Spelling & Grammar (F7) lists mistakes with suggestions; Thesaurus (Shift+F7) finds other words; Check Accessibility finds what makes the document hard to read.",
      "New Comment (Ctrl+Alt+M) comments on the selected text; comments show beside the page, where you can reply and resolve them.",
      "Track Changes (Ctrl+Shift+E) marks what's typed and deleted so it can be accepted or rejected. Restrict Editing makes the document read-only, or allows only comments or tracked changes.",
      "Translate (MyMemory) and the Thesaurus (Datamuse) use free web services: the words you look up are sent to them.",
    ],
  },
  {
    title: "Views, zoom and the Navigation Pane",
    where: "View tab",
    body: [
      "Print Layout shows pages; Web Layout fills the window; Read Mode is for reading (Esc goes back); Outline shows the document's headings to collapse, reorder and promote; Draft is one long sheet.",
      "Focus hides everything but the page; Immersive Reader has line focus, wider spacing, page colours and Read Aloud.",
      "Show the Ruler (drag its markers to change indents and margins), Gridlines and the Navigation Pane (headings, pages and search). Zoom, One Page and Page Width set the size; Switch Modes darkens the page.",
    ],
  },
];

const SHORTCUTS: [string, [string, string][]][] = [
  [
    "Documents",
    [
      ["Ctrl+S", "Save"],
      ["Ctrl+Shift+S", "Save as"],
      ["Ctrl+O", "Open"],
      ["Ctrl+Z / Ctrl+Y", "Undo / Redo"],
      ["F1", "Help"],
    ],
  ],
  [
    "Text",
    [
      ["Ctrl+B / I / U", "Bold / Italic / Underline"],
      ["Ctrl+, / Ctrl+.", "Subscript / Superscript"],
      ["Ctrl+] / Ctrl+[", "Grow / Shrink font"],
      ["Ctrl+X / C / V", "Cut / Copy / Paste"],
      ["Ctrl+F / Ctrl+H", "Find / Replace"],
    ],
  ],
  [
    "Paragraphs and pages",
    [
      ["Ctrl+L / E / R / J", "Align left / Centre / Align right / Justify"],
      ["Ctrl+Enter", "Page break"],
      ["Ctrl+Shift+Enter", "Column break"],
      ["Shift+Enter", "Line break"],
    ],
  ],
  [
    "References and review",
    [
      ["Alt+Ctrl+F", "Insert footnote"],
      ["Ctrl+Alt+M", "New comment"],
      ["Ctrl+Shift+E", "Track Changes on or off"],
      ["F7", "Spelling & Grammar"],
      ["Shift+F7", "Thesaurus"],
    ],
  ],
  [
    "Outline view",
    [
      ["Alt+Shift+Left / Right", "Promote / Demote"],
      ["Alt+Shift+Up / Down", "Move up / down"],
    ],
  ],
  [
    "Pictures and views",
    [
      ["Shift+click", "Select several pictures or shapes"],
      ["Delete", "Delete the selected pictures"],
      ["Esc", "Leave Focus, Read Mode or a header"],
    ],
  ],
];

const TRAINING: { title: string; steps: string[] }[] = [
  {
    title: "Your first document",
    steps: [
      "Type a title, then pick Title in Home › Styles.",
      "Use Heading 1 and Heading 2 for the sections.",
      "Press Ctrl+S, give the document a name and choose a folder.",
      "File › Save as › a .docx name saves a copy for Word.",
    ],
  },
  {
    title: "Pages, page numbers and a cover",
    steps: [
      "Insert › Cover Page adds a first page.",
      "Insert › Page Number › Bottom of Page › Plain Number, center.",
      "Double-click the top margin to type a header; tick Different First Page so the cover has none.",
      "Layout › Margins and Size set up the paper.",
    ],
  },
  {
    title: "A report with references",
    steps: [
      "References › Insert Citation › Add New Source, and fill in the book or article.",
      "Choose your course's style (APA, Harvard…) under Style.",
      "At the end, References › Bibliography › References.",
      "At the start, References › Table of Contents › Automatic Table 1.",
    ],
  },
  {
    title: "Letters to many people",
    steps: [
      "Mailings › Select Recipients › Type a New List (or use a CSV file).",
      "Put the cursor where the address goes: Address Block; then Greeting Line.",
      "Preview Results and the arrows show each person's letter.",
      "Finish & Merge › Edit Individual Documents makes them all.",
    ],
  },
  {
    title: "Reviewing someone's work",
    steps: [
      "Review › Track Changes, then edit: your changes are marked.",
      "Select text and click New Comment to ask or explain.",
      "Accept or Reject goes through the changes one by one, or all at once.",
      "Save as .docx: Word shows the same changes and comments.",
    ],
  },
];

const NEW: { title: string; items: string[] }[] = [
  {
    title: "Pages and layout",
    items: [
      "Real pages, with text flowing from one to the next",
      "Headers, footers and page numbers",
      "Columns, line numbers, hyphenation, margins and paper sizes",
      "Text wrapping around pictures; grouping pictures and shapes",
    ],
  },
  {
    title: "Design",
    items: ["Themes, colour sets, font pairs and style sets", "Watermarks, page colours and page borders", "Shape effects"],
  },
  {
    title: "References, Mailings and Review",
    items: [
      "Tables of contents and figures, footnotes and endnotes, citations, bibliographies, captions and indexes",
      "Mail merge, envelopes and labels",
      "Spelling and grammar, thesaurus, translation, Read Aloud and accessibility checking",
      "Comments, Track Changes, Compare and Restrict Editing",
    ],
  },
  {
    title: "View",
    items: ["Read Mode, Web Layout, Outline and Draft", "Focus and Immersive Reader", "Ruler, gridlines, Navigation Pane and dark pages"],
  },
];

export function HelpPane({ section, onSection }: { section: HelpSection; onSection: (s: HelpSection) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Topic | null>(null);
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOPICS;
    // Topics named after what's searched for come first.
    const named = TOPICS.filter((t) => `${t.title} ${t.where}`.toLowerCase().includes(q));
    return [...named, ...TOPICS.filter((t) => !named.includes(t) && t.body.join(" ").toLowerCase().includes(q))];
  }, [query]);
  const shortcuts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SHORTCUTS.map(([group, list]) => [group, list.filter(([k, what]) => !q || `${k} ${what}`.toLowerCase().includes(q))] as const).filter(([, list]) => list.length);
  }, [query]);

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" className="flex gap-3 border-b border-slate-200 text-xs">
        {(
          [
            ["help", "Help"],
            ["shortcuts", "Shortcuts"],
            ["training", "Training"],
            ["whatsnew", "What's New"],
          ] as [HelpSection, string][]
        ).map(([id, name]) => (
          <button
            key={id}
            role="tab"
            aria-selected={section === id}
            onClick={() => onSection(id)}
            className={`-mb-px border-b-2 pb-1 ${section === id ? "border-blue-600 font-semibold text-blue-700" : "border-transparent text-slate-500"}`}
          >
            {name}
          </button>
        ))}
      </div>

      {(section === "help" || section === "shortcuts") && !open && (
        <label className="flex items-center gap-1.5 rounded border border-slate-300 px-2">
          <Search size={13} className="text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={section === "help" ? "Search help" : "Search shortcuts"} className="min-w-0 flex-1 bg-transparent py-1 outline-none" />
        </label>
      )}

      {section === "help" &&
        (open ? (
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => setOpen(null)} className="flex items-center gap-1 self-start text-xs text-blue-700 hover:underline">
              <ArrowLeft size={12} /> All topics
            </button>
            <h3 className="text-base font-semibold">{open.title}</h3>
            <p className="text-xs text-slate-500">{open.where}</p>
            {open.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {found.map((t) => (
              <button key={t.title} type="button" onClick={() => setOpen(t)} className="rounded px-2 py-1.5 text-left hover:bg-slate-100">
                <span className="block font-medium">{t.title}</span>
                <span className="block text-xs text-slate-500">{t.where}</span>
              </button>
            ))}
            {!found.length && <p className="text-slate-500">Nothing in Help matches “{query}”.</p>}
          </div>
        ))}

      {section === "shortcuts" && (
        <div className="flex flex-col gap-3">
          {shortcuts.map(([group, list]) => (
            <Block key={group} title={group}>
              {list.map(([keys, what]) => (
                <div key={keys} className="flex items-baseline justify-between gap-2 py-0.5">
                  <span>{what}</span>
                  <kbd className="shrink-0 rounded border border-slate-300 bg-slate-50 px-1.5 font-sans text-[11px]">{keys}</kbd>
                </div>
              ))}
            </Block>
          ))}
          <p className="text-xs text-slate-400">On a Mac, use Cmd where it says Ctrl.</p>
        </div>
      )}

      {section === "training" &&
        TRAINING.map((t) => (
          <Block key={t.title} title={t.title}>
            <ol className="list-decimal space-y-1 pl-5">
              {t.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </Block>
        ))}

      {section === "whatsnew" &&
        NEW.map((n) => (
          <Block key={n.title} title={n.title}>
            <ul className="list-disc space-y-1 pl-5">
              {n.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </Block>
        ))}
    </div>
  );
}

const Block = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="rounded-lg border border-slate-200 p-3">
    <h3 className="mb-1.5 font-semibold">{title}</h3>
    {children}
  </section>
);
