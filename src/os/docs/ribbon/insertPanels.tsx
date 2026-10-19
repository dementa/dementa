"use client";

// The small forms that open under Insert tab buttons: table size, hyperlink, online pictures,
// Wikipedia, SmartArt, bookmarks and cross-references (charts are in ChartForm.tsx).

import type { Editor } from "@tiptap/react";
import { ArrowLeft, Loader2, Search, Trash2, Unlink } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { MAX_SMARTART_ITEMS, SMARTART_LAYOUTS, smartArtSvg, svgUrl, type SmartArtLayout } from "../graphics";
import {
  addBookmark,
  BOOKMARK_NAME,
  bookmarkText,
  deleteBookmark,
  goToBookmark,
  insertCrossReference,
  listBookmarks,
  listHeadings,
} from "../insertNodes";
import { keepFocus } from "./parts";

export const inputClass = "rounded-md border border-slate-300 bg-surface px-2 py-1.5 text-sm outline-none select-text focus:border-blue-500";
export const primaryClass = "rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40";
const quietClass = "rounded-md px-2 py-1 text-sm hover:bg-slate-100 disabled:opacity-40";

export const Title = ({ children }: { children: ReactNode }) => <h3 className="text-sm font-semibold">{children}</h3>;
export const Problem = ({ children }: { children: ReactNode }) => <p className="text-xs text-red-600">{children}</p>;

/** Choices shown as a row of toggle buttons (chart type, SmartArt layout…). */
export function Choice<T extends string>(p: {
  options: { id: T; name: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Lays the choices out in a grid of this many columns instead of one row. */
  columns?: number;
}) {
  return (
    <div className={p.columns ? "grid gap-1" : "flex gap-1"} style={p.columns ? { gridTemplateColumns: `repeat(${p.columns}, 1fr)` } : undefined}>
      {p.options.map((o) => (
        <button
          key={o.id}
          type="button"
          title={o.hint}
          aria-pressed={p.value === o.id}
          onClick={() => p.onChange(o.id)}
          className={`flex-1 rounded-md px-2 py-1 text-sm ${p.value === o.id ? "bg-blue-100 font-medium text-blue-800 ring-1 ring-blue-300" : "hover:bg-slate-100"}`}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

// ---- Table ----

export function TablePicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState({ rows: 0, cols: 0 });
  return (
    <div onMouseLeave={() => setHover({ rows: 0, cols: 0 })}>
      <p className="mb-2 text-xs font-medium text-slate-600">{hover.rows ? `${hover.cols} × ${hover.rows} Table` : "Insert Table"}</p>
      <div className="grid grid-cols-[repeat(10,1.125rem)] gap-0.5">
        {Array.from({ length: 8 * 10 }, (_, i) => {
          const row = Math.floor(i / 10) + 1;
          const col = (i % 10) + 1;
          const lit = row <= hover.rows && col <= hover.cols;
          return (
            <button
              key={i}
              aria-label={`${row} by ${col} table`}
              onMouseDown={keepFocus}
              onMouseEnter={() => setHover({ rows: row, cols: col })}
              onFocus={() => setHover({ rows: row, cols: col })}
              onClick={() => onPick(row, col)}
              className={`h-[1.125rem] w-[1.125rem] border ${lit ? "border-orange-400 bg-orange-100" : "border-slate-300 bg-surface"}`}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---- Hyperlink ----

/** Only web and email links: nothing that could run code when clicked. */
function cleanUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : text.includes("@") && !text.includes("/") ? `mailto:${text}` : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function LinkForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const existing = editor.getAttributes("link").href as string | undefined;
  const [value, setValue] = useState(existing ?? "");
  const [bad, setBad] = useState(false);

  function apply(e: FormEvent) {
    e.preventDefault();
    const href = cleanUrl(value);
    if (!href) return setBad(true);
    const chain = editor.chain().focus().extendMarkRange("link");
    if (editor.state.selection.empty && !existing) {
      // Nothing selected: put the address itself in the document as the link text.
      chain.insertContent({ type: "text", text: value.trim(), marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      chain.setLink({ href }).run();
    }
    onDone();
  }

  return (
    <form onSubmit={apply} className="flex w-72 flex-col gap-2">
      <label className="text-xs font-medium text-slate-600" htmlFor="docs-link">
        Web address
      </label>
      <input
        id="docs-link"
        autoFocus
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setBad(false);
        }}
        placeholder="www.example.com"
        className={inputClass}
      />
      {bad && <Problem>That doesn&apos;t look like a web address.</Problem>}
      <div className="flex justify-end gap-2">
        {existing && (
          <button
            type="button"
            onClick={() => {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              onDone();
            }}
            className="mr-auto flex items-center gap-1 rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50"
          >
            <Unlink size={14} /> Remove
          </button>
        )}
        <button type="submit" className={primaryClass}>
          {existing ? "Update" : "Add link"}
        </button>
      </div>
    </form>
  );
}

// ---- Searching the web (Wikimedia sites only: they're on Dementa's approved list) ----

/** Text that came as HTML from a website, without the HTML. */
const plain = (html: string) => new DOMParser().parseFromString(html, "text/html").body.textContent?.trim() ?? "";

const OFFLINE = "Couldn't reach the internet. Check the connection and try again.";

async function getJson(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(OFFLINE);
  return response.json();
}

function SearchBox(p: { value: string; onChange: (v: string) => void; onSearch: () => void; placeholder: string; busy: boolean }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (p.value.trim()) p.onSearch();
      }}
      className="flex items-center gap-1 rounded-md border border-slate-300 px-2 focus-within:border-blue-500"
    >
      <Search size={14} className="shrink-0 text-slate-500" />
      <input
        autoFocus
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        placeholder={p.placeholder}
        aria-label={p.placeholder}
        className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none select-text"
      />
      {p.busy && <Loader2 size={14} className="shrink-0 animate-spin text-slate-500" />}
    </form>
  );
}

interface Picture {
  title: string;
  src: string;
  page: string;
  credit: string;
}

/** Online Pictures: searches Wikimedia Commons, the free picture library behind Wikipedia. */
export function OnlinePictures({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Picture[] | null>(null);

  async function search() {
    setBusy(true);
    setError(null);
    try {
      const url =
        "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=12" +
        `&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}` +
        "&prop=imageinfo&iiprop=url|mime|extmetadata&iiextmetadatafilter=Artist|LicenseShortName&iiurlwidth=640";
      const data = await getJson(url);
      const pages = Object.values(data.query?.pages ?? {}) as {
        index: number;
        title: string;
        imageinfo?: { thumburl?: string; descriptionurl: string; mime: string; extmetadata?: Record<string, { value: string }> }[];
      }[];
      setFound(
        pages
          .sort((a, b) => a.index - b.index)
          .flatMap((p) => {
            const info = p.imageinfo?.[0];
            if (!info?.thumburl || !/^image\/(jpeg|png|gif|webp)$/.test(info.mime)) return [];
            const artist = plain(info.extmetadata?.Artist?.value ?? "");
            const licence = plain(info.extmetadata?.LicenseShortName?.value ?? "");
            const credit = [artist && `Picture by ${artist}`, licence && `(${licence})`].filter(Boolean).join(" ") || "Picture";
            return [{ title: p.title.replace(/^File:/, "").replace(/\.[^.]+$/, ""), src: info.thumburl, page: info.descriptionurl, credit }];
          }),
      );
    } catch (err) {
      setError(err instanceof TypeError ? OFFLINE : err instanceof Error ? err.message : OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  function insert(p: Picture) {
    const italic = { type: "italic" };
    editor
      .chain()
      .focus()
      .insertContent([
        { type: "image", attrs: { src: p.src, alt: p.title } },
        {
          type: "paragraph",
          content: [
            { type: "text", text: `${p.credit}, via `, marks: [italic] },
            { type: "text", text: "Wikimedia Commons", marks: [italic, { type: "link", attrs: { href: p.page } }] },
          ],
        },
      ])
      .run();
    onDone();
  }

  return (
    <div className="flex w-96 flex-col gap-2">
      <Title>Online Pictures</Title>
      <SearchBox value={query} onChange={setQuery} onSearch={search} placeholder="Search Wikimedia Commons" busy={busy} />
      {error && <Problem>{error}</Problem>}
      {found && !found.length && <p className="text-sm text-slate-500">No pictures found. Try other words.</p>}
      {found && found.length > 0 && (
        <div className="grid max-h-72 grid-cols-3 gap-1.5 overflow-y-auto">
          {found.map((p) => (
            <button
              key={p.src}
              title={`${p.title}\n${p.credit}`}
              onClick={() => insert(p)}
              className="aspect-square overflow-hidden rounded bg-slate-100 ring-blue-500 hover:ring-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- pictures from another site, shown as they are */}
              <img src={p.src} alt={p.title} loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500">Pictures are credited under them, as their licence asks.</p>
    </div>
  );
}

interface Article {
  title: string;
  extract: string;
  url: string;
  picture?: string;
}

const WIKI = "https://simple.wikipedia.org";

/** Wikipedia: look something up and put a summary in the document, with where it came from. */
export function WikipediaPanel({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<string[] | null>(null);
  const [article, setArticle] = useState<Article | null>(null);

  async function attempt(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof TypeError ? OFFLINE : err instanceof Error ? err.message : OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  const search = () =>
    attempt(async () => {
      const data = await getJson(`${WIKI}/w/api.php?action=opensearch&format=json&origin=*&namespace=0&limit=8&search=${encodeURIComponent(query)}`);
      setArticle(null);
      setResults(Array.isArray(data[1]) ? data[1] : []);
    });

  const open = (title: string) =>
    attempt(async () => {
      const data = await getJson(`${WIKI}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
      setArticle({
        title: data.title ?? title,
        extract: data.extract ?? "",
        url: data.content_urls?.desktop?.page ?? `${WIKI}/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
        picture: data.thumbnail?.source,
      });
    });

  function insert(a: Article, withPicture: boolean) {
    const italic = { type: "italic" };
    editor
      .chain()
      .focus()
      .insertContent([
        ...(withPicture && a.picture ? [{ type: "image", attrs: { src: a.picture, alt: a.title } }] : []),
        { type: "paragraph", content: [{ type: "text", text: a.extract }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Source: ", marks: [italic] },
            { type: "text", text: `Wikipedia, “${a.title}”`, marks: [italic, { type: "link", attrs: { href: a.url } }] },
          ],
        },
      ])
      .run();
    onDone();
  }

  return (
    <div className="flex w-96 flex-col gap-2">
      <Title>Wikipedia</Title>
      {article ? (
        <>
          <button onClick={() => setArticle(null)} className="flex w-fit items-center gap-1 text-xs text-blue-700 hover:underline">
            <ArrowLeft size={12} /> Back to results
          </button>
          <div className="flex max-h-60 gap-3 overflow-y-auto">
            {article.picture && (
              // eslint-disable-next-line @next/next/no-img-element -- a picture from Wikipedia, shown as it is
              <img src={article.picture} alt={article.title} className="h-20 w-20 shrink-0 rounded object-cover" />
            )}
            <div>
              <p className="font-medium">{article.title}</p>
              <p className="text-sm text-slate-700 select-text">{article.extract || "This article has no summary."}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {article.picture && (
              <button onClick={() => insert(article, true)} disabled={!article.extract} className={quietClass}>
                Insert with picture
              </button>
            )}
            <button onClick={() => insert(article, false)} disabled={!article.extract} className={primaryClass}>
              Insert text
            </button>
          </div>
        </>
      ) : (
        <>
          <SearchBox value={query} onChange={setQuery} onSearch={search} placeholder="Search Wikipedia" busy={busy} />
          {results && !results.length && <p className="text-sm text-slate-500">Nothing found. Try other words.</p>}
          {results && results.length > 0 && (
            <ul className="max-h-60 overflow-y-auto">
              {results.map((title) => (
                <li key={title}>
                  <button onClick={() => open(title)} className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100">
                    {title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && <Problem>{error}</Problem>}
      <p className="text-xs text-slate-500">From Simple English Wikipedia. A source line goes in under the text.</p>
    </div>
  );
}

// ---- SmartArt ----

export function Preview({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-md bg-slate-100 p-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- a drawing made here, as a data address */}
      {src && <img src={src} alt={alt} className="max-h-full max-w-full" />}
    </div>
  );
}

export function SmartArtForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [layout, setLayout] = useState<SmartArtLayout>("process");
  const [text, setText] = useState("Plan\nDo\nCheck\nAct");
  const items = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const problem = !items.length ? "Type at least one line." : items.length > MAX_SMARTART_ITEMS ? `SmartArt can show up to ${MAX_SMARTART_ITEMS} lines.` : null;
  const src = problem ? null : svgUrl(smartArtSvg(layout, items));

  return (
    <div className="flex w-96 flex-col gap-2">
      <Title>Choose a SmartArt Graphic</Title>
      <Choice options={SMARTART_LAYOUTS} value={layout} onChange={setLayout} />
      <p className="text-xs text-slate-500">{SMARTART_LAYOUTS.find((l) => l.id === layout)!.hint}</p>
      <label className="text-xs font-medium text-slate-600" htmlFor="docs-smartart">
        Type your text here, one line for each shape
      </label>
      <textarea id="docs-smartart" rows={3} value={text} onChange={(e) => setText(e.target.value)} className={`${inputClass} resize-none`} />
      {problem && <Problem>{problem}</Problem>}
      <Preview src={src} alt="SmartArt preview" />
      <div className="flex justify-end">
        <button
          disabled={!src}
          onClick={() => {
            editor.chain().focus().setImage({ src: src!, alt: items.join(", ") }).run();
            onDone();
          }}
          className={primaryClass}
        >
          Insert
        </button>
      </div>
    </div>
  );
}

// ---- Bookmarks and cross-references ----

export function BookmarkPanel({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  // Bumped after a change, to list the bookmarks again.
  const [, setVersion] = useState(0);
  // Names starting with _ are Word's hidden ones (cross-references to headings).
  const bookmarks = listBookmarks(editor.state.doc).filter((b) => !b.name.startsWith("_"));

  function add(e: FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!BOOKMARK_NAME.test(clean)) {
      return setProblem("Start with a letter, then use only letters, numbers and _ (no spaces).");
    }
    addBookmark(editor, clean);
    onDone();
  }

  return (
    <div className="flex w-80 flex-col gap-2">
      <Title>Bookmark</Title>
      <form onSubmit={add} className="flex gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setProblem(null);
          }}
          placeholder="Bookmark name"
          aria-label="Bookmark name"
          className={`${inputClass} min-w-0 flex-1`}
        />
        <button type="submit" className={primaryClass}>
          Add
        </button>
      </form>
      {problem && <Problem>{problem}</Problem>}
      {bookmarks.length ? (
        <ul className="max-h-48 overflow-y-auto">
          {bookmarks.map((b) => (
            <li key={b.pos} className="flex items-center gap-1 rounded px-1 hover:bg-slate-50">
              <span className="min-w-0 flex-1 truncate text-sm">{b.name}</span>
              <button
                onClick={() => {
                  goToBookmark(editor, b.name);
                  onDone();
                }}
                className={quietClass}
              >
                Go To
              </button>
              <button
                aria-label={`Delete ${b.name}`}
                title="Delete"
                onClick={() => {
                  deleteBookmark(editor, b.name);
                  setVersion((v) => v + 1);
                }}
                className="rounded p-1 text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No bookmarks yet. Put the cursor where one should go, name it and press Add.</p>
      )}
    </div>
  );
}

export function CrossReferencePanel({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [kind, setKind] = useState<"heading" | "bookmark">("heading");
  const doc = editor.state.doc;
  const headings = listHeadings(doc);
  const bookmarks = listBookmarks(doc).filter((b) => !b.name.startsWith("_"));

  const item = (key: string | number, text: string, sub: string | null, onClick: () => void) => (
    <li key={key}>
      <button
        onClick={() => {
          onClick();
          onDone();
        }}
        className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
      >
        {text}
        {sub && <span className="block truncate text-xs text-slate-500">{sub}</span>}
      </button>
    </li>
  );

  return (
    <div className="flex w-80 flex-col gap-2">
      <Title>Cross-reference</Title>
      <Choice
        options={[
          { id: "heading" as const, name: "Heading" },
          { id: "bookmark" as const, name: "Bookmark" },
        ]}
        value={kind}
        onChange={setKind}
      />
      <p className="text-xs text-slate-500">Choose what to refer to. The link goes in at the cursor.</p>
      {kind === "heading" ? (
        headings.length ? (
          <ul className="max-h-56 overflow-y-auto">
            {headings.map((h) =>
              item(h.pos, `${" ".repeat(h.level - 1)}${h.text}`, null, () => insertCrossReference(editor, { heading: h.pos }, h.text)),
            )}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No headings yet. Use Heading 1, 2 or 3 on the Home tab.</p>
        )
      ) : bookmarks.length ? (
        <ul className="max-h-56 overflow-y-auto">
          {bookmarks.map((b) => {
            const text = bookmarkText(doc, b.pos + 1);
            return item(b.pos, b.name, text || null, () => insertCrossReference(editor, { bookmark: b.name }, text || b.name));
          })}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No bookmarks yet. Add one with Bookmark first.</p>
      )}
      <p className="text-xs text-slate-500">Ctrl+click a reference in the document to jump to it.</p>
    </div>
  );
}
