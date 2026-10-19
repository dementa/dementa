"use client";

// Find and Replace (Home › Editing, Ctrl+F, Ctrl+H): highlights every match in the document.

import type { Editor } from "@tiptap/react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { showMatches } from "./extensions";
import { findMatches } from "./textOps";

interface Props {
  editor: Editor;
  mode: "find" | "replace";
  /** Changes each time Find is asked for; the search box takes the cursor again. */
  focusKey: number;
  onMode: (mode: "find" | "replace") => void;
  onClose: () => void;
}

export function FindPanel({ editor, mode, focusKey, onMode, onClose }: Props) {
  const searchBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchBox.current?.focus();
    searchBox.current?.select();
  }, [focusKey]);

  const [query, setQuery] = useState(() => {
    // Start with the selected text, like Word does.
    const { from, to, empty } = editor.state.selection;
    const text = empty ? "" : editor.state.doc.textBetween(from, to, " ");
    return text.length <= 60 ? text : "";
  });
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [current, setCurrent] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  /** Bumped whenever the document changes, to search it again. */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    editor.on("update", bump);
    return () => {
      editor.off("update", bump);
    };
  }, [editor]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` stands for the document changing
  const matches = useMemo(() => findMatches(editor.state.doc, query, matchCase), [editor, query, matchCase, version]);
  const index = matches.length ? Math.min(current, matches.length - 1) : -1;

  useEffect(() => {
    showMatches(editor, matches, index);
    if (index >= 0) {
      const m = matches[index];
      editor.chain().setTextSelection(m).scrollIntoView().run();
    }
  }, [editor, matches, index]);

  // Remove the highlights when the panel closes.
  useEffect(
    () => () => {
      if (!editor.isDestroyed) showMatches(editor, [], -1);
    },
    [editor],
  );

  const step = (by: number) => matches.length && setCurrent((index + by + matches.length) % matches.length);

  function replaceOne() {
    if (index < 0) return;
    const { from, to } = matches[index];
    editor.chain().command(({ tr }) => (tr.insertText(replacement, from, to), true)).run();
    setNote(null);
  }

  function replaceAll() {
    if (!matches.length) return;
    const count = matches.length;
    editor
      .chain()
      .command(({ tr }) => {
        [...matches].reverse().forEach((m) => tr.insertText(replacement, m.from, m.to));
        return true;
      })
      .run();
    setNote(`Replaced ${count} ${count === 1 ? "match" : "matches"}.`);
  }

  function close() {
    onClose();
    editor.commands.focus();
  }

  // Escape closes the panel wherever the focus is (buttons that become disabled drop it).
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      editor.commands.focus();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [editor, onClose]);

  return (
    <div
      role="dialog"
      aria-label={mode === "find" ? "Find" : "Find and replace"}
      className="menu-pop absolute top-3 right-5 z-20 w-80 rounded-lg bg-surface p-3 text-slate-800 shadow-xl ring-1 ring-black/10"
    >
      <div className="mb-2 flex items-center gap-1">
        {(["find", "replace"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onMode(m)}
            className={`rounded px-2 py-0.5 text-sm ${mode === m ? "bg-blue-100 font-medium text-blue-800" : "hover:bg-slate-100"}`}
          >
            {m === "find" ? "Find" : "Replace"}
          </button>
        ))}
        <button onClick={close} aria-label="Close" title="Close (Esc)" className="ml-auto rounded p-1 hover:bg-slate-100">
          <X size={16} />
        </button>
      </div>

      <div className="flex items-center gap-1 rounded-md border border-slate-300 px-2 focus-within:border-blue-500">
        <input
          ref={searchBox}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCurrent(0);
            setNote(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              step(e.shiftKey ? -1 : 1);
            }
          }}
          placeholder="Search the document"
          aria-label="Find"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none select-text"
        />
        <span className="shrink-0 text-xs text-slate-500">{query ? (matches.length ? `${index + 1} of ${matches.length}` : "No results") : ""}</span>
        <button onClick={() => step(-1)} disabled={!matches.length} aria-label="Previous match" className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30">
          <ChevronUp size={16} />
        </button>
        <button onClick={() => step(1)} disabled={!matches.length} aria-label="Next match" className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30">
          <ChevronDown size={16} />
        </button>
      </div>

      {mode === "replace" && (
        <>
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder="Replace with"
            aria-label="Replace with"
            className="mt-2 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm outline-none select-text focus:border-blue-500"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={replaceOne} disabled={!matches.length} className="rounded-md px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40">
              Replace
            </button>
            <button
              onClick={replaceAll}
              disabled={!matches.length}
              className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Replace all
            </button>
          </div>
        </>
      )}

      <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
        Match case
      </label>
      {note && <p className="mt-1 text-sm text-green-700">{note}</p>}
    </div>
  );
}
