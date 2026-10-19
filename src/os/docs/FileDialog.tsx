"use client";

// Docs' Open and Save as windows: the Files app, the way other operating systems use their file
// explorer for these.

import { X } from "lucide-react";
import { FilesApp } from "../FilesApp";

/** Files Docs can open: Word documents, its older web-page documents (.html) and plain text. */
export const OPENABLE = /\.(docx|html?|txt)$/i;
const DOCS_FILE = /\.(docx|html?)$/i;

interface Props {
  mode: "open" | "save";
  /** Folder to start in, e.g. "Documents". */
  folder: string;
  /** Suggested name when saving, without ".docx". */
  name?: string;
  onCancel: () => void;
  /** The chosen file's full path. */
  onPick: (path: string) => void;
  /** Open only: a document chosen from this computer instead. */
  onComputerFile?: (file: File) => void;
}

export function FileDialog({ mode, folder, name = "", onCancel, onPick, onComputerFile }: Props) {
  const title = mode === "open" ? "Open" : "Save as";
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
      <div
        role="dialog"
        aria-label={title}
        className="menu-pop flex h-[min(540px,100%)] w-[min(860px,100%)] flex-col overflow-hidden rounded-xl bg-surface text-slate-800 shadow-2xl ring-1 ring-black/10"
      >
        <div className="flex h-9 shrink-0 items-center border-b border-slate-200 bg-slate-50 pr-1 pl-4 text-sm font-medium">
          <span className="flex-1">{title}</span>
          <button type="button" aria-label="Close" title="Close" onClick={onCancel} className="rounded p-1.5 hover:bg-slate-200">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <FilesApp
            picker={{
              mode,
              folder,
              name,
              accept: mode === "open" ? OPENABLE : DOCS_FILE,
              extension: ".docx",
              onPick,
              onCancel,
              fromComputer: onComputerFile && { accept: ".docx,.html,.htm,.txt", onFile: onComputerFile },
            }}
          />
        </div>
      </div>
    </div>
  );
}
