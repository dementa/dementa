"use client";

// Header, Footer and Page Number (on the Insert tab), and Word's Header & Footer tab, which shows
// while a header or footer is being edited.

import type { Editor } from "@tiptap/react";
import { ArrowDownToLine, ArrowUpToLine, CalendarDays, FileText, Hash, PanelBottom, PanelTop, X } from "lucide-react";
import { hfKey, isBlank, type HfTarget, type Part } from "../headerFooter";
import type { HeadersFooters, PageLayout } from "../layout";
import { Big, Group, keepFocus, MenuButton, MenuItem } from "./parts";
import { Heading } from "./LayoutTab";

export interface HfControls {
  editing: HfTarget | null;
  edit: (part: Part) => void;
  close: () => void;
}

interface Props {
  /** The editor the ribbon works on: the header's or footer's while one is being edited. */
  editor: Editor;
  title: string;
  layout: PageLayout;
  onLayout: (patch: Partial<PageLayout>) => void;
  hf: HfControls;
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const PAGE = '<span data-field="page"></span>';
const PAGES = '<span data-field="pages"></span>';
const line = (align: string, inner: string) => `<p${align === "left" ? "" : ` style="text-align: ${align}"`}>${inner}</p>`;

/**
 * Puts `html` in a header or footer (both the usual one and the first page's), and opens it to
 * edit, as Word does after you pick one from its gallery.
 */
function setPart(p: Props, part: Part, html: string) {
  const editing = p.hf.editing?.part === part;
  if (editing) {
    // The editor has the header open: change it there, and it saves itself.
    p.editor.chain().focus().setContent(html, true).run();
    return;
  }
  const headers: HeadersFooters = { ...p.layout.headers, [part]: html, ...(p.layout.headers.differentFirst && { [hfKey(part, true)]: html }) };
  p.onLayout({ headers });
  p.hf.edit(part);
}

function removePart(p: Props, part: Part) {
  if (p.hf.editing?.part === part) p.hf.close();
  p.onLayout({ headers: { ...p.layout.headers, [part]: "", [hfKey(part, true)]: "" } });
}

/** Header or Footer: a few ready-made ones, then edit or remove it. */
export function PartMenu({ part, ...p }: Props & { part: Part }) {
  const name = part === "header" ? "Header" : "Footer";
  const title = escape(p.title);
  const has = !isBlank(p.layout.headers[part]) || !isBlank(p.layout.headers[hfKey(part, true)]);
  return (
    <MenuButton
      big
      icon={part === "header" ? PanelTop : PanelBottom}
      label={name}
      menu={(close) => (
        <div className="w-56">
          <Heading>Built-In</Heading>
          <MenuItem label="Blank" onClick={() => (close(), setPart(p, part, "<p></p>"))} />
          <MenuItem label="Title, centered" onClick={() => (close(), setPart(p, part, line("center", title)))} />
          <MenuItem label="Title and page number" onClick={() => (close(), setPart(p, part, `${line("left", title)}${line("right", `Page ${PAGE}`)}`))} />
          <div className="my-1 border-t border-slate-200" />
          <MenuItem label={`Edit ${name}`} onClick={() => (close(), p.hf.edit(part))} />
          {has && <MenuItem label={`Remove ${name}`} onClick={() => (close(), removePart(p, part))} />}
        </div>
      )}
    />
  );
}

export function PageNumberMenu(p: Props) {
  const place = (part: Part, align: string, inner = PAGE) => setPart(p, part, line(align, inner));
  const remove = () => {
    const strip = (html: string) => {
      const left = html.replace(/(Page\s*)?<span data-field="page"[^>]*><\/span>(\s*of\s*<span data-field="pages"[^>]*><\/span>)?/g, "").replace(/<span data-field="pages"[^>]*><\/span>/g, "");
      return isBlank(left) ? "" : left;
    };
    const h = p.layout.headers;
    p.onLayout({ headers: { ...h, header: strip(h.header), footer: strip(h.footer), firstHeader: strip(h.firstHeader), firstFooter: strip(h.firstFooter) } });
  };
  return (
    <MenuButton
      big
      icon={Hash}
      label={"Page\nNumber"}
      menu={(close) => (
        <div className="w-56">
          <Heading>Top of Page</Heading>
          {(["left", "center", "right"] as const).map((a) => (
            <MenuItem key={a} icon={ArrowUpToLine} label={`Plain Number, ${a}`} onClick={() => (close(), place("header", a))} />
          ))}
          <Heading>Bottom of Page</Heading>
          {(["left", "center", "right"] as const).map((a) => (
            <MenuItem key={a} icon={ArrowDownToLine} label={`Plain Number, ${a}`} onClick={() => (close(), place("footer", a))} />
          ))}
          <MenuItem icon={ArrowDownToLine} label="Page X of Y, center" onClick={() => (close(), place("footer", "center", `Page ${PAGE} of ${PAGES}`))} />
          <div className="my-1 border-t border-slate-200" />
          {p.hf.editing && (
            <MenuItem label="Current Position" onClick={() => (close(), p.editor.chain().focus().insertContent({ type: "pageField", attrs: { kind: "page" } }).run())} />
          )}
          <MenuItem label="Remove Page Numbers" onClick={() => (close(), remove())} />
        </div>
      )}
    />
  );
}

/** Word's Header & Footer tab. */
export function HeaderFooterTab(p: Props) {
  const editing = p.hf.editing!;
  const headers = p.layout.headers;
  const insert = (html: string) => p.editor.chain().focus().insertContent(html).run();
  return (
    <>
      <Group label="Header & Footer">
        <PartMenu part="header" {...p} />
        <PartMenu part="footer" {...p} />
        <PageNumberMenu {...p} />
      </Group>
      <Group label="Insert">
        <MenuButton
          big
          arrow={false}
          icon={CalendarDays}
          label={"Date &\nTime"}
          menu={(close) => {
            const now = new Date();
            const forms = [
              now.toLocaleDateString(undefined),
              now.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }),
              now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
              now.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
            ];
            return (
              <div className="w-64">
                <Heading>Available formats</Heading>
                {forms.map((f) => (
                  <MenuItem key={f} label={f} onClick={() => (close(), insert(escape(f)))} />
                ))}
              </div>
            );
          }}
        />
        <Big icon={FileText} label={"Document\nTitle"} title="Insert the document's name" onClick={() => insert(escape(p.title))} />
      </Group>
      <Group label="Navigation">
        <Big icon={PanelTop} label={"Go to\nHeader"} active={editing.part === "header"} onClick={() => p.hf.edit("header")} />
        <Big icon={PanelBottom} label={"Go to\nFooter"} active={editing.part === "footer"} onClick={() => p.hf.edit("footer")} />
      </Group>
      <Group label="Options">
        <label className="flex items-center gap-1.5 self-start px-1 pt-1 text-xs" onMouseDown={keepFocus}>
          <input
            type="checkbox"
            checked={headers.differentFirst}
            onChange={(e) => p.onLayout({ headers: { ...headers, differentFirst: e.target.checked } })}
          />
          Different First Page
        </label>
      </Group>
      <Group label="Close">
        <Big icon={X} label={"Close Header\nand Footer"} danger onClick={p.hf.close} />
      </Group>
    </>
  );
}
