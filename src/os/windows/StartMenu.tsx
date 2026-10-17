"use client";

import { Power, RotateCcw, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type AppDef, type AppId, type PowerAction } from "../apps";
import { cloud, type CloudFile } from "../cloud";
import { AppTile } from "../common";
import { DocumentIcon } from "../FilesApp";
import { TASKBAR_HEIGHT } from "./Taskbar";

interface Props {
  apps: AppDef[];
  /** Opened from the taskbar's Search button: start with the cursor in the search box. */
  searchFirst: boolean;
  onClose: () => void;
  onOpen: (id: AppId) => void;
  onOpenFile: (path: string) => void;
  onPower: (action: PowerAction) => void;
}

/** "Just now", "5 min ago", "Yesterday", or a date. */
function whenText(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (hours < 48) return "Yesterday";
  return new Date(iso).toLocaleDateString();
}

export function StartMenu({ apps, searchFirst, onClose, onOpen, onOpenFile, onPower }: Props) {
  const [query, setQuery] = useState("");
  const [powerOpen, setPowerOpen] = useState(false);
  const [recent, setRecent] = useState<CloudFile[] | null>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (searchFirst) search.current?.focus();
  }, [searchFirst]);

  // Recommended: the latest files from the cloud.
  useEffect(() => {
    cloud
      .recent()
      .then((r) => setRecent(r.files.slice(0, 6)))
      .catch(() => setRecent([]));
  }, []);

  const q = query.trim().toLowerCase();
  const appResults = q ? apps.filter((a) => a.name.toLowerCase().includes(q) || a.blurb.toLowerCase().includes(q)) : [];
  const fileResults = q ? (recent ?? []).filter((f) => f.name.toLowerCase().includes(q)) : [];

  return (
    <>
      <div className="absolute inset-0 z-[9001]" onPointerDown={onClose} />
      <div
        role="dialog"
        aria-label="Start"
        className="menu-pop absolute left-1/2 z-[9002] flex w-[min(620px,calc(100vw-16px))] -translate-x-1/2 flex-col rounded-xl border border-black/10 bg-[#f3f4f6]/90 text-black shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-[#242424]/92 dark:text-white"
        style={{ bottom: TASKBAR_HEIGHT + 12, maxHeight: `calc(100% - ${TASKBAR_HEIGHT + 24}px)` }}
      >
        <div className="px-6 pt-6 pb-2">
          <label className="flex items-center gap-2.5 rounded-full border border-black/10 bg-white px-4 py-2 focus-within:border-blue-500 dark:border-white/10 dark:bg-white/10">
            <Search size={16} className="opacity-60" />
            <input
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && appResults[0]) onOpen(appResults[0].id);
                else if (e.key === "Enter" && fileResults[0]) onOpenFile(fileResults[0].path);
              }}
              placeholder="Search for apps, settings and documents"
              aria-label="Search"
              className="w-full bg-transparent text-sm outline-none select-text placeholder:text-black/50 dark:placeholder:text-white/50"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
          {q ? (
            <section className="pt-3">
              <h3 className="mb-2 text-sm font-semibold">Best matches</h3>
              {appResults.length + fileResults.length === 0 && (
                <p className="py-6 text-center text-sm opacity-60">No results for “{query}”.</p>
              )}
              <ul className="space-y-0.5">
                {appResults.map((app) => (
                  <li key={app.id}>
                    <button
                      onClick={() => onOpen(app.id)}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      <AppTile app={app} size={32} />
                      <span>
                        <span className="block text-sm">{app.name}</span>
                        <span className="block text-xs opacity-60">App</span>
                      </span>
                    </button>
                  </li>
                ))}
                {fileResults.map((f) => (
                  <li key={f.path}>
                    <RecentFile file={f} onOpen={() => onOpenFile(f.path)} />
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <>
              <section className="pt-3">
                <h3 className="mb-2 px-2 text-sm font-semibold">Pinned</h3>
                <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
                  {apps.map((app) => (
                    <button
                      key={app.id}
                      onClick={() => onOpen(app.id)}
                      className="flex flex-col items-center gap-1.5 rounded-md px-1 py-3 text-xs hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      <AppTile app={app} size={36} />
                      <span className="w-full truncate text-center">{app.name}</span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="pt-4">
                <h3 className="mb-2 px-2 text-sm font-semibold">Recommended</h3>
                {recent === null ? (
                  <p className="px-2 py-3 text-xs opacity-60">Loading…</p>
                ) : recent.length === 0 ? (
                  <p className="px-2 py-3 text-xs opacity-60">Files you add in Files will show up here.</p>
                ) : (
                  <div className="grid gap-1 sm:grid-cols-2">
                    {recent.map((f) => (
                      <RecentFile key={f.path} file={f} onOpen={() => onOpenFile(f.path)} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <div className="relative flex items-center gap-3 rounded-b-xl border-t border-black/5 bg-black/[.03] px-6 py-3 dark:border-white/10 dark:bg-white/5">
          <span className="flex flex-1 items-center gap-2.5 text-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-violet-500 font-semibold text-white">
              D
            </span>
            Dementa user
          </span>
          <button
            onClick={() => setPowerOpen((o) => !o)}
            aria-label="Power"
            aria-expanded={powerOpen}
            title="Power"
            className={`rounded-md p-2 ${powerOpen ? "bg-black/10 dark:bg-white/15" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
          >
            <Power size={17} />
          </button>
          {powerOpen && (
            <div className="menu-pop absolute right-4 bottom-full mb-1 w-44 rounded-lg border border-black/10 bg-[#f9f9fa] p-1 text-sm shadow-xl dark:border-white/10 dark:bg-[#2c2c2c]">
              <button
                onClick={() => onPower("restart")}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <RotateCcw size={16} /> Restart
              </button>
              <button
                onClick={() => onPower("shutdown")}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <Power size={16} /> Shut down
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function RecentFile({ file, onOpen }: { file: CloudFile; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10">
      <DocumentIcon name={file.name} type={file.type} size={30} />
      <span className="min-w-0">
        <span className="block truncate text-sm">{file.name}</span>
        <span className="block text-xs opacity-60">{whenText(file.modified)}</span>
      </span>
    </button>
  );
}
