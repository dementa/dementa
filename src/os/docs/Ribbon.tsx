"use client";

// The ribbon: Word's row of tabs (File … Help) and the tools of the open tab.

import type { Editor, JSONContent } from "@tiptap/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import type { PageLayout } from "./layout";
import { ChartTab, selectedChart } from "./ribbon/ChartForm";
import { HomeTab } from "./ribbon/HomeTab";
import { InsertTab } from "./ribbon/InsertTab";
import { LayoutTab } from "./ribbon/LayoutTab";
import { DesignTab } from "./ribbon/DesignTab";
import { HeaderFooterTab, PageNumberMenu, PartMenu, type HfControls } from "./ribbon/HeaderFooterTab";
import { HelpTab } from "./ribbon/HelpTab";
import { TableTab } from "./ribbon/OtherTabs";
import { MailingsTab } from "./ribbon/MailingsTab";
import { ReferencesTab } from "./ribbon/ReferencesTab";
import { ReviewTab, type ReviewView } from "./ribbon/ReviewTab";
import { ImmersiveTab, OutliningTab, ViewTab, type ViewControls } from "./ribbon/ViewTab";
import { PictureTab } from "./ribbon/PictureTab";
import { ShapeTab } from "./ribbon/ShapeTab";
import { Group, keepFocus } from "./ribbon/parts";

type Tab = "home" | "insert" | "design" | "layout" | "references" | "mailings" | "review" | "view" | "help" | Contextual;
/** Tabs that only show while a table, chart, picture or shape is selected, like Word's coloured ones. */
type Contextual = "table" | "chart" | "picture" | "headerFooter" | "outlining" | "immersive";

/** In Word's order. File isn't here: it opens the File screen instead of a set of tools. */
const TABS: { id: Exclude<Tab, Contextual>; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "insert", label: "Insert" },
  { id: "design", label: "Design" },
  { id: "layout", label: "Layout" },
  { id: "references", label: "References" },
  { id: "mailings", label: "Mailings" },
  { id: "review", label: "Review" },
  { id: "view", label: "View" },
  { id: "help", label: "Help" },
];

/** Docs' ribbon blue. */
export const RIBBON_BLUE = "#2b579a";

interface Props {
  editor: Editor;
  /** The document's name, for headers and footers. */
  title: string;
  headerFooter: HfControls;
  /** Opens a footnote or endnote to type it. */
  onNote: (id: string) => void;
  /** Opens a document the Mailings tab made (merged letters, envelopes, labels). */
  onGenerated: (content: JSONContent, layout: Partial<PageLayout>, title: string) => void;
  /** How the Review tab's changes, comments and panes show (kept by the Docs window). */
  review: ReviewView;
  view: ViewControls;
  layout: PageLayout;
  onLayout: (patch: Partial<PageLayout>) => void;
  onError: (text: string) => void;
  onFile: () => void;
  onFind: (mode: "find" | "replace") => void;
}

export function Ribbon({ editor, title, headerFooter, layout, onLayout, onError, onFile, onFind, onNote, onGenerated, review, view }: Props) {
  const [tab, setTab] = useState<Tab>("home");
  const [collapsed, setCollapsed] = useState(false);
  const [showMarks, setShowMarks] = useState(false);
  const inTable = editor.isActive("table");
  const chart = selectedChart(editor);
  const picture = editor.isActive("image");
  const shape = picture && Boolean(editor.getAttributes("image").shape);
  const editingHf = Boolean(headerFooter.editing);
  // Editing a header or footer opens its tab, as in Word; leaving it goes back to Home.
  const [lastHf, setLastHf] = useState(editingHf);
  if (lastHf !== editingHf) {
    setLastHf(editingHf);
    setTab(editingHf ? "headerFooter" : "home");
  }
  // Outline view and Immersive Reader open their own tabs, as in Word.
  const outlining = view.mode === "outline";
  const [lastView, setLastView] = useState(`${outlining}${view.immersive}`);
  if (lastView !== `${outlining}${view.immersive}`) {
    setLastView(`${outlining}${view.immersive}`);
    setTab(outlining ? "outlining" : view.immersive ? "immersive" : "view");
  }
  const shown =
    (tab === "table" && !inTable) || (tab === "chart" && !chart) || (tab === "picture" && !picture) || (tab === "headerFooter" && !editingHf) || (tab === "outlining" && !outlining) || (tab === "immersive" && !view.immersive)
      ? "home"
      : tab;
  const hfProps = { editor, title, layout, onLayout, hf: headerFooter };

  useEffect(() => {
    editor.view.dom.classList.toggle("show-marks", showMarks);
  }, [editor, showMarks]);

  const tabs: { id: Tab; label: string }[] = [
    ...TABS,
    ...(inTable ? [{ id: "table" as const, label: "Table" }] : []),
    ...(chart ? [{ id: "chart" as const, label: "Chart Design" }] : []),
    ...(picture ? [{ id: "picture" as const, label: shape ? "Shape Format" : chart ? "Format" : "Picture Format" }] : []),
    ...(editingHf ? [{ id: "headerFooter" as const, label: "Header & Footer" }] : []),
    ...(outlining ? [{ id: "outlining" as const, label: "Outlining" }] : []),
    ...(view.immersive ? [{ id: "immersive" as const, label: "Immersive Reader" }] : []),
  ];
  const contextual = (id: Tab) => ["table", "chart", "picture", "headerFooter", "outlining", "immersive"].includes(id);

  const tabButton = (id: Tab, label: string) => {
    const selected = shown === id && !collapsed;
    return (
      <button
        key={id}
        role="tab"
        aria-selected={selected}
        onMouseDown={keepFocus}
        onClick={() => {
          setTab(id);
          setCollapsed(false);
        }}
        className={`shrink-0 px-3 pt-1 pb-1.5 text-[13px] ${
          selected
            ? `rounded-t bg-slate-50 font-medium ${contextual(id) ? "text-emerald-700" : "text-[#2b579a] dark:text-sky-300"}`
            : `text-white hover:bg-white/15 ${contextual(id) ? "font-semibold text-emerald-200" : ""}`
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="shrink-0">
      <div role="tablist" aria-label="Ribbon" className="flex items-end overflow-x-auto px-1 pt-0.5" style={{ background: RIBBON_BLUE }}>
        <button
          onMouseDown={keepFocus}
          onClick={onFile}
          className="shrink-0 px-3 pt-1 pb-1.5 text-[13px] text-white hover:bg-white/15"
        >
          File
        </button>
        {tabs.map((t) => tabButton(t.id, t.label))}
        {collapsed && (
          <button
            title="Show the ribbon"
            aria-label="Show the ribbon"
            onMouseDown={keepFocus}
            onClick={() => setCollapsed(false)}
            className="mb-1 ml-auto shrink-0 rounded p-1 text-white hover:bg-white/15"
          >
            <ChevronDown size={14} />
          </button>
        )}
      </div>

      {!collapsed && (
        <div
          role="toolbar"
          aria-label={`${shown} tools`}
          className="relative flex min-h-[96px] flex-wrap items-stretch gap-y-1 border-b border-slate-200 bg-slate-50 py-1.5 pr-7 pl-1"
        >
          {shown === "home" ? (
            <HomeTab editor={editor} onError={onError} onFind={onFind} showMarks={showMarks} onShowMarks={() => setShowMarks((s) => !s)} />
          ) : shown === "insert" ? (
            <InsertTab editor={editor} onError={onError}>
              <Group label="Header & Footer">
                <PartMenu part="header" {...hfProps} />
                <PartMenu part="footer" {...hfProps} />
                <PageNumberMenu {...hfProps} />
              </Group>
            </InsertTab>
          ) : shown === "headerFooter" ? (
            <HeaderFooterTab {...hfProps} />
          ) : shown === "design" ? (
            <DesignTab layout={layout} onLayout={onLayout} />
          ) : shown === "references" ? (
            <ReferencesTab editor={editor} layout={layout} onLayout={onLayout} onNote={onNote} />
          ) : shown === "mailings" ? (
            <MailingsTab editor={editor} title={title} layout={layout} onLayout={onLayout} onGenerated={onGenerated} />
          ) : shown === "review" ? (
            <ReviewTab editor={editor} title={title} layout={layout} onLayout={onLayout} onGenerated={onGenerated} view={review} />
          ) : shown === "view" ? (
            <ViewTab v={view} />
          ) : shown === "outlining" ? (
            <OutliningTab editor={editor} onClose={() => view.onMode("print")} />
          ) : shown === "immersive" ? (
            <ImmersiveTab v={view} />
          ) : shown === "layout" ? (
            <LayoutTab editor={editor} layout={layout} onLayout={onLayout} />
          ) : shown === "table" ? (
            <TableTab editor={editor} />
          ) : shown === "chart" && chart ? (
            <ChartTab editor={editor} spec={chart} onError={onError} />
          ) : shown === "picture" && shape ? (
            <ShapeTab editor={editor} />
          ) : shown === "picture" && picture ? (
            <PictureTab editor={editor} />
          ) : shown === "help" ? (
            <HelpTab title={title} view={review} />
          ) : null}
          <button
            title="Collapse the ribbon"
            aria-label="Collapse the ribbon"
            onMouseDown={keepFocus}
            onClick={() => setCollapsed(true)}
            className="absolute right-1 bottom-1 rounded p-0.5 text-slate-500 hover:bg-slate-200"
          >
            <ChevronUp size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
