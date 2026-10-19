"use client";

// The ribbon: Word's row of tabs (File … Help) and the tools of the open tab.

import type { Editor } from "@tiptap/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import type { PageLayout } from "./layout";
import { ChartTab, selectedChart } from "./ribbon/ChartForm";
import { HomeTab } from "./ribbon/HomeTab";
import { InsertTab } from "./ribbon/InsertTab";
import { ComingSoon, LayoutTab, TableTab } from "./ribbon/OtherTabs";
import { PictureTab } from "./ribbon/PictureTab";
import { keepFocus } from "./ribbon/parts";

type Tab = "home" | "insert" | "design" | "layout" | "references" | "mailings" | "review" | "view" | "help" | Contextual;
/** Tabs that only show while a table, chart or picture is selected, like Word's coloured ones. */
type Contextual = "table" | "chart" | "picture";

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
  layout: PageLayout;
  onLayout: (patch: Partial<PageLayout>) => void;
  onError: (text: string) => void;
  onFile: () => void;
  onFind: (mode: "find" | "replace") => void;
}

export function Ribbon({ editor, layout, onLayout, onError, onFile, onFind }: Props) {
  const [tab, setTab] = useState<Tab>("home");
  const [collapsed, setCollapsed] = useState(false);
  const [showMarks, setShowMarks] = useState(false);
  const inTable = editor.isActive("table");
  const chart = selectedChart(editor);
  const picture = editor.isActive("image");
  const shown = (tab === "table" && !inTable) || (tab === "chart" && !chart) || (tab === "picture" && !picture) ? "home" : tab;

  useEffect(() => {
    editor.view.dom.classList.toggle("show-marks", showMarks);
  }, [editor, showMarks]);

  const tabs: { id: Tab; label: string }[] = [
    ...TABS,
    ...(inTable ? [{ id: "table" as const, label: "Table" }] : []),
    ...(chart ? [{ id: "chart" as const, label: "Chart Design" }] : []),
    ...(picture ? [{ id: "picture" as const, label: chart ? "Format" : "Picture Format" }] : []),
  ];
  const contextual = (id: Tab) => id === "table" || id === "chart" || id === "picture";

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
            <InsertTab editor={editor} onError={onError} />
          ) : shown === "layout" ? (
            <LayoutTab layout={layout} onLayout={onLayout} />
          ) : shown === "table" ? (
            <TableTab editor={editor} />
          ) : shown === "chart" && chart ? (
            <ChartTab editor={editor} spec={chart} onError={onError} />
          ) : shown === "picture" && picture ? (
            <PictureTab editor={editor} />
          ) : (
            <ComingSoon name={TABS.find((t) => t.id === shown)!.label} />
          )}
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
