"use client";

// The File screen (Word calls it "backstage"): document info, New, Open, Save and Save as.

import { ArrowLeft, FilePlus, FolderOpen, Info, Save, SaveAll, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { MARGINS, PAGE_SIZES, type PageLayout } from "./layout";
import { RIBBON_BLUE } from "./Ribbon";

type Page = "info" | "new" | "open";

interface Props {
  title: string;
  path: string | null;
  dirty: boolean;
  words: number;
  characters: number;
  layout: PageLayout;
  onClose: () => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
}

export function Backstage(p: Props) {
  const [page, setPage] = useState<Page>("info");

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [p]);

  const item = (icon: LucideIcon, label: string, onClick: () => void, selected = false) => {
    const Icon = icon;
    return (
      <button
        onClick={onClick}
        className={`flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm ${selected ? "bg-white/20 font-medium" : "hover:bg-white/10"}`}
      >
        <Icon size={18} /> {label}
      </button>
    );
  };

  return (
    <div className="absolute inset-0 z-30 flex bg-surface text-slate-800">
      <nav className="flex w-48 shrink-0 flex-col py-3 text-white" style={{ background: RIBBON_BLUE }}>
        <button onClick={p.onClose} aria-label="Back to the document" title="Back (Esc)" className="mx-3 mb-3 w-fit rounded-full p-2 hover:bg-white/15">
          <ArrowLeft size={20} />
        </button>
        {item(Info, "Info", () => setPage("info"), page === "info")}
        {item(FilePlus, "New", () => setPage("new"), page === "new")}
        {item(FolderOpen, "Open", () => setPage("open"), page === "open")}
        <span className="mx-5 my-2 h-px bg-white/25" />
        {item(Save, "Save", p.onSave)}
        {item(SaveAll, "Save as", p.onSaveAs)}
      </nav>

      <main className="min-w-0 flex-1 overflow-y-auto px-10 py-8">
        {page === "info" ? (
          <>
            <h1 className="mb-6 text-3xl font-light">Info</h1>
            <h2 className="text-xl font-semibold">{p.title}</h2>
            <p className="mb-6 text-sm text-slate-500">{p.path ? `Dementa Cloud › ${p.path.split("/").join(" › ")}` : "Not saved yet"}</p>
            <dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-sm">
              <dt className="text-slate-500">Status</dt>
              <dd>{p.dirty ? "Has changes that aren't saved" : p.path ? "Saved" : "New document"}</dd>
              <dt className="text-slate-500">Words</dt>
              <dd>{p.words}</dd>
              <dt className="text-slate-500">Characters</dt>
              <dd>{p.characters}</dd>
              <dt className="text-slate-500">Page</dt>
              <dd>
                {PAGE_SIZES[p.layout.size].label}, {p.layout.orientation}, {MARGINS[p.layout.margins].label.toLowerCase()} margins
              </dd>
            </dl>
          </>
        ) : page === "new" ? (
          <>
            <h1 className="mb-6 text-3xl font-light">New</h1>
            <button onClick={p.onNew} className="group flex w-36 flex-col items-center gap-2 text-sm">
              <span className="h-44 w-32 rounded-sm bg-white shadow ring-1 ring-black/10 group-hover:ring-2 group-hover:ring-blue-500" />
              Blank document
            </button>
          </>
        ) : (
          <>
            <h1 className="mb-6 text-3xl font-light">Open</h1>
            <button onClick={p.onOpen} className="flex items-center gap-3 rounded-lg px-4 py-3 text-left hover:bg-slate-100">
              <FolderOpen size={32} className="text-amber-500" />
              <span>
                <span className="block font-medium">Dementa Cloud</span>
                <span className="block text-sm text-slate-500">Browse your folders</span>
              </span>
            </button>
          </>
        )}
      </main>
    </div>
  );
}
