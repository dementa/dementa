"use client";

import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  Download,
  ExternalLink,
  Eye,
  Film,
  FileText,
  FolderPlus,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  List,
  Loader2,
  Monitor,
  Music,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  cloud,
  CloudError,
  formatBytes,
  joinPath,
  parentPath,
  type CloudFile,
  type CloudFolder,
  type FolderListing,
} from "./cloud";
import { ContextMenu, menuAt, type MenuEntry, type OpenMenu } from "./ContextMenu";
import { PropertiesDialog, type PropertiesInfo } from "./PropertiesDialog";

/** Where the window is looking: a folder path ("" is the top level) or the Recents view. */
type Location = { kind: "folder"; path: string } | { kind: "recents" };

type Item = ({ kind: "folder" } & CloudFolder) | ({ kind: "file" } & CloudFile);

const SYSTEM_ICONS: Record<string, LucideIcon> = {
  Desktop: Monitor,
  Documents: FileText,
  Downloads: Download,
  Pictures: ImageIcon,
  Music: Music,
  Videos: Film,
};

const ROOT_NAME = "Dementa Cloud";
const SYSTEM_FOLDERS = Object.keys(SYSTEM_ICONS);
const DRAG_TYPE = "application/x-dementa-path";

const sameLocation = (a: Location, b: Location) =>
  a.kind === b.kind && (a.kind === "recents" || a.path === (b as { path: string }).path);

const titleOf = (loc: Location) => (loc.kind === "recents" ? "Recents" : loc.path ? loc.path.split("/").pop()! : ROOT_NAME);

const errorText = (err: unknown) => (err instanceof CloudError ? err.message : String(err));

/** "untitled folder", "untitled folder 2", … whichever is free. */
function freeName(base: string, taken: Set<string>) {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

function kindOf(item: Item) {
  if (item.kind === "folder") return "Folder";
  const t = item.type;
  if (t.startsWith("image/")) return "Image";
  if (t.startsWith("video/")) return "Video";
  if (t.startsWith("audio/")) return "Audio";
  if (t === "application/pdf") return "PDF document";
  if (t.startsWith("text/")) return "Text document";
  const ext = item.name.includes(".") ? item.name.split(".").pop()!.toUpperCase() : "";
  return ext ? `${ext} file` : "Document";
}

/** Ask Files to show a file: opens its folder and selects it. Change `nonce` to ask again. */
export interface FilesRequest {
  path: string;
  nonce: number;
}

type SortBy = "name" | "modified" | "size" | "kind";

const SORT_LABELS: Record<SortBy, string> = { name: "Name", modified: "Date modified", size: "Size", kind: "Kind" };

/** Folders first (like other operating systems), then by the chosen column. */
function sortItems(items: Item[], by: SortBy, desc: boolean): Item[] {
  const byName = (a: Item, b: Item) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  const value = (i: Item) => (i.kind === "folder" ? 0 : by === "size" ? i.size : by === "modified" ? Date.parse(i.modified) : 0);
  const compare = (a: Item, b: Item) => {
    if (by === "kind") return kindOf(a).localeCompare(kindOf(b)) || byName(a, b);
    if (by === "name") return byName(a, b);
    return value(a) - value(b) || byName(a, b);
  };
  const sorted = (list: Item[]) => {
    const out = [...list].sort(compare);
    return desc ? out.reverse() : out;
  };
  return [...sorted(items.filter((i) => i.kind === "folder")), ...sorted(items.filter((i) => i.kind === "file"))];
}

/** "Dementa Cloud › Documents › Homework" for a folder path. */
const locationText = (folder: string) => [ROOT_NAME, ...(folder ? folder.split("/") : [])].join(" › ");

export function FilesApp({ request }: { request?: FilesRequest | null }) {
  const [location, setLocation] = useState<Location>(() =>
    request ? { kind: "folder", path: parentPath(request.path) } : { kind: "folder", path: "" },
  );
  const [history, setHistory] = useState<{ back: Location[]; forward: Location[] }>({ back: [], forward: [] });
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(request?.path ?? null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [sort, setSort] = useState<{ by: SortBy; desc: boolean }>({ by: "name", desc: false });
  const [properties, setProperties] = useState<PropertiesInfo | null>(null);
  const closeProperties = useCallback(() => setProperties(null), []);
  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null);
  const [preview, setPreview] = useState<CloudFile | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const folderPath = location.kind === "folder" ? location.path : null;

  // Only the newest request may update the window, so a slow answer for a folder you've already
  // left can't replace the folder you're looking at now.
  const latestLoad = useRef(0);

  const load = useCallback(async (loc: Location) => {
    const id = ++latestLoad.current;
    setLoading(true);
    let result: FolderListing;
    let problem = "";
    try {
      result = loc.kind === "recents" ? await cloud.recent() : await cloud.list(loc.path);
    } catch (err) {
      problem = errorText(err);
      result = { path: "", folders: [], files: [] };
    }
    if (id !== latestLoad.current) return;
    setListing(result);
    setError(problem);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(location);
  }, [load, location]);

  const refresh = () => load(location);

  // Opened from elsewhere (e.g. Recommended in the Start menu) while Files is already open.
  useEffect(() => {
    if (!request) return;
    setLocation({ kind: "folder", path: parentPath(request.path) });
    setSelected(request.path);
    setPreview(null);
    setQuery("");
  }, [request]);

  function go(next: Location) {
    if (sameLocation(next, location)) return;
    setHistory((h) => ({ back: [...h.back, location], forward: [] }));
    setLocation(next);
    setSelected(null);
    setQuery("");
    setPreview(null);
  }

  function back() {
    const prev = history.back.at(-1);
    if (!prev) return;
    setHistory((h) => ({ back: h.back.slice(0, -1), forward: [location, ...h.forward] }));
    setLocation(prev);
    setSelected(null);
    setPreview(null);
  }

  function forward() {
    const next = history.forward[0];
    if (!next) return;
    setHistory((h) => ({ back: [...h.back, location], forward: h.forward.slice(1) }));
    setLocation(next);
    setSelected(null);
    setPreview(null);
  }

  /** Runs a change, shows what's happening, reports problems, then reloads the folder. */
  async function act(label: string, task: () => Promise<unknown>) {
    setBusy(label);
    setError("");
    try {
      await task();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(null);
    await load(location);
  }

  const items: Item[] = listing
    ? sortItems(
        [
          ...listing.folders.map((f) => ({ kind: "folder" as const, ...f })),
          ...listing.files.map((f) => ({ kind: "file" as const, ...f })),
        ].filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase())),
        sort.by,
        sort.desc,
      )
    : [];
  const selectedItem = items.find((i) => i.path === selected) ?? null;
  const takenNames = new Set(items.map((i) => i.name));

  function open(item: Item) {
    if (item.kind === "folder") go({ kind: "folder", path: item.path });
    else setPreview(item);
  }

  async function newFolder() {
    if (folderPath === null) return;
    const name = freeName("untitled folder", takenNames);
    await act("Creating folder…", () => cloud.createFolder(joinPath(folderPath, name)));
    setSelected(joinPath(folderPath, name));
    setRenaming(joinPath(folderPath, name));
  }

  async function rename(item: Item, newName: string) {
    setRenaming(null);
    const name = newName.trim();
    if (!name || name === item.name) return;
    const to = joinPath(parentPath(item.path), name);
    await act("Renaming…", () => cloud.move(item.path, to));
    setSelected(to);
  }

  async function moveInto(from: string, folder: string) {
    const to = joinPath(folder, from.split("/").pop()!);
    if (from === folder || parentPath(from) === folder) return;
    await act("Moving…", () => cloud.move(from, to));
  }

  async function upload(files: FileList | File[], folder: string) {
    const list = [...files];
    if (!list.length) return;
    await act(`Uploading ${list.length} item${list.length === 1 ? "" : "s"}…`, async () => {
      for (const file of list) await cloud.upload(file, folder);
    });
  }

  async function remove(item: Item) {
    setConfirmDelete(null);
    await act("Deleting…", () => (item.kind === "folder" ? cloud.deleteFolder(item.path) : cloud.deleteFile(item.path)));
    setSelected(null);
  }

  function download(item: Item) {
    if (item.kind !== "file") return;
    const a = document.createElement("a");
    a.href = cloud.fileUrl(item.path, true);
    a.download = item.name;
    a.click();
  }

  // ---- Keyboard ----

  function onKeyDown(e: KeyboardEvent) {
    if (renaming || (e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "Enter" && selectedItem) open(selectedItem);
    else if (e.key === "F2" && canChange(selectedItem)) setRenaming(selectedItem!.path);
    else if (e.key === "Delete" && canChange(selectedItem)) setConfirmDelete(selectedItem);
    else if (e.key === "Backspace" && folderPath) go({ kind: "folder", path: parentPath(folderPath) });
    else if (e.key === "Escape") setSelected(null);
    else return;
    e.preventDefault();
  }

  // ---- Drag and drop: files from the computer upload; items dragged onto a folder move ----

  function dropOn(folder: string | null) {
    return (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(null);
      if (folder === null) return;
      const from = e.dataTransfer.getData(DRAG_TYPE);
      if (from) moveInto(from, folder);
      else if (e.dataTransfer.files.length) upload(e.dataTransfer.files, folder);
    };
  }

  function dragOver(folder: string | null) {
    return (e: DragEvent) => {
      if (folder === null) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DRAG_TYPE) ? "move" : "copy";
      setDropTarget(folder);
    };
  }

  /** Properties for a file or folder; folders count what's inside once it loads. */
  function showProperties(item: Item | { kind: "folder"; name: string; path: string; system: boolean }) {
    if (item.kind === "file") {
      setProperties({
        name: item.name,
        icon: <ItemIcon item={item} size={48} />,
        rows: [
          ["Type", kindOf(item)],
          ["Location", locationText(parentPath(item.path))],
          "divider",
          ["Size", `${formatBytes(item.size)} (${item.size.toLocaleString()} bytes)`],
          ["Modified", new Date(item.modified).toLocaleString([], { dateStyle: "full", timeStyle: "short" })],
        ],
        action: { label: "Open", onClick: () => open(item) },
      });
      return;
    }
    const base = (contents: string): PropertiesInfo => ({
      name: item.name,
      icon: <FolderIcon size={48} glyph={item.system ? SYSTEM_ICONS[item.path] : undefined} />,
      rows: [
        ["Type", item.system ? "System folder" : "Folder"],
        ["Location", item.path ? locationText(parentPath(item.path)) : "This device"],
        "divider",
        ["Contains", contents],
      ],
      action: item.path === folderPath ? undefined : { label: "Open", onClick: () => go({ kind: "folder", path: item.path }) },
    });
    setProperties(base("Counting…"));
    cloud
      .list(item.path)
      .then((l) => {
        const text = `${l.folders.length} folder${l.folders.length === 1 ? "" : "s"}, ${l.files.length} file${l.files.length === 1 ? "" : "s"} (${formatBytes(l.files.reduce((n, f) => n + f.size, 0))})`;
        setProperties((p) => (p && p.name === item.name ? base(text) : p));
      })
      .catch(() => setProperties((p) => (p && p.name === item.name ? base("Couldn't count the contents") : p)));
  }

  function sortMenu(): MenuEntry[] {
    return [
      ...(Object.keys(SORT_LABELS) as SortBy[]).map((by) => ({
        label: SORT_LABELS[by],
        checked: sort.by === by,
        onSelect: () => setSort((s) => ({ ...s, by })),
      })),
      "divider",
      { label: "Ascending", checked: !sort.desc, onSelect: () => setSort((s) => ({ ...s, desc: false })) },
      { label: "Descending", checked: sort.desc, onSelect: () => setSort((s) => ({ ...s, desc: true })) },
    ];
  }

  function contextMenu(e: MouseEvent, item: Item | null) {
    if (item) setSelected(item.path);
    const items: MenuEntry[] = item
      ? [
          { label: "Open", icon: ExternalLink, onSelect: () => open(item) },
          ...(item.kind === "file" ? [{ label: "Download", icon: Download, onSelect: () => download(item) }] : []),
          "divider",
          { label: "Rename", icon: Pencil, hint: "F2", disabled: !canChange(item), onSelect: () => setRenaming(item.path) },
          { label: "Delete", icon: Trash2, hint: "Del", danger: true, disabled: !canChange(item), onSelect: () => setConfirmDelete(item) },
          "divider",
          { label: "Properties", icon: Info, onSelect: () => showProperties(item) },
        ]
      : [
          {
            label: "View",
            icon: Eye,
            submenu: [
              { label: "Icons", checked: view === "grid", onSelect: () => setView("grid") },
              { label: "List", checked: view === "list", onSelect: () => setView("list") },
            ],
          },
          { label: "Sort by", icon: ArrowDownUp, submenu: sortMenu() },
          { label: "Refresh", icon: RefreshCw, onSelect: refresh },
          "divider",
          { label: "New Folder", icon: FolderPlus, disabled: folderPath === null, onSelect: newFolder },
          { label: "Upload Files…", icon: Upload, disabled: folderPath === null, onSelect: () => picker.current?.click() },
          ...(folderPath !== null
            ? [
                "divider" as const,
                {
                  label: "Properties",
                  icon: Info,
                  onSelect: () =>
                    showProperties({
                      kind: "folder",
                      name: titleOf(location),
                      path: folderPath,
                      system: SYSTEM_FOLDERS.includes(folderPath),
                    }),
                },
              ]
            : []),
        ];
    setMenu(menuAt(e, items));
  }

  function dragProps(item: Item) {
    const isFolder = item.kind === "folder";
    return {
      draggable: canChange(item) && !renaming,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.setData(DRAG_TYPE, item.path);
        e.dataTransfer.effectAllowed = "move";
      },
      onDragOver: isFolder ? dragOver(item.path) : undefined,
      onDragLeave: isFolder ? () => setDropTarget(null) : undefined,
      onDrop: isFolder ? dropOn(item.path) : undefined,
    };
  }

  return (
    <div
      ref={root}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="relative flex h-full bg-surface text-slate-800 outline-none"
    >
      {/* Sidebar */}
      <nav className="hidden w-48 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-slate-100/80 px-2 py-3 text-[13px] sm:flex">
        <SidebarSection title="Favourites">
          <SidebarItem icon={Clock} label="Recents" active={location.kind === "recents"} onClick={() => go({ kind: "recents" })} />
          {Object.entries(SYSTEM_ICONS).map(([name, icon]) => (
            <SidebarItem
              key={name}
              icon={icon}
              label={name}
              active={folderPath === name}
              dropping={dropTarget === name}
              onClick={() => go({ kind: "folder", path: name })}
              onDragOver={dragOver(name)}
              onDragLeave={() => setDropTarget(null)}
              onDrop={dropOn(name)}
            />
          ))}
        </SidebarSection>
        <SidebarSection title="Cloud">
          <SidebarItem
            icon={Cloud}
            label={ROOT_NAME}
            active={folderPath === ""}
            dropping={dropTarget === ""}
            onClick={() => go({ kind: "folder", path: "" })}
            onDragOver={dragOver("")}
            onDragLeave={() => setDropTarget(null)}
            onDrop={dropOn("")}
          />
        </SidebarSection>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex h-12 shrink-0 items-center gap-1 border-b border-slate-200 px-2">
          <ToolButton label="Back" disabled={!history.back.length} onClick={back}>
            <ChevronLeft size={20} />
          </ToolButton>
          <ToolButton label="Forward" disabled={!history.forward.length} onClick={forward}>
            <ChevronRight size={20} />
          </ToolButton>
          <h2 className="ml-1 min-w-0 flex-1 truncate text-[15px] font-semibold">{preview ? preview.name : titleOf(location)}</h2>
          {!preview && (
            <>
              <div className="flex rounded-md bg-slate-100 p-0.5">
                <ToolButton label="Icons" pressed={view === "grid"} onClick={() => setView("grid")}>
                  <LayoutGrid size={16} />
                </ToolButton>
                <ToolButton label="List" pressed={view === "list"} onClick={() => setView("list")}>
                  <List size={16} />
                </ToolButton>
              </div>
              <ToolButton label="New folder" disabled={folderPath === null} onClick={newFolder}>
                <FolderPlus size={18} />
              </ToolButton>
              <ToolButton label="Upload" disabled={folderPath === null} onClick={() => picker.current?.click()}>
                <Upload size={18} />
              </ToolButton>
              <ToolButton label="Delete" disabled={!canChange(selectedItem)} onClick={() => selectedItem && setConfirmDelete(selectedItem)}>
                <Trash2 size={17} />
              </ToolButton>
              <label className="ml-1 hidden items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 md:flex">
                <Search size={14} className="text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search"
                  aria-label="Search in this folder"
                  className="w-28 bg-transparent text-sm outline-none select-text"
                />
              </label>
            </>
          )}
          {preview && (
            <a
              href={cloud.fileUrl(preview.path, true)}
              download={preview.name}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-slate-100"
            >
              <Download size={16} /> Download
            </a>
          )}
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files && folderPath !== null) upload(e.target.files, folderPath);
              e.target.value = "";
            }}
          />
        </div>

        {error && (
          <p role="alert" className="mx-3 mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">
            {error}
          </p>
        )}

        {/* Content */}
        {preview ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-50 p-4">
            <Preview file={preview} />
          </div>
        ) : (
          <div
            className={`min-h-0 flex-1 overflow-auto ${dropTarget !== null && dropTarget === folderPath ? "bg-blue-50 dark:bg-blue-500/10" : ""}`}
            onClick={() => setSelected(null)}
            onContextMenu={(e) => contextMenu(e, null)}
            onDragOver={dragOver(folderPath)}
            onDragLeave={(e) => e.currentTarget === e.target && setDropTarget(null)}
            onDrop={dropOn(folderPath)}
          >
            {loading && !listing ? (
              <div className="flex h-full items-center justify-center text-slate-400">
                <Loader2 className="animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-slate-500">
                <FolderIcon size={72} />
                <p className="font-medium text-slate-700">
                  {query ? "Nothing matches your search" : location.kind === "recents" ? "No recent files" : "This folder is empty"}
                </p>
                {folderPath !== null && !query && <p className="text-sm">Drag files here, or right-click to make a folder.</p>}
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] content-start gap-1 p-3">
                {items.map((item) => (
                  <GridItem
                    key={item.path}
                    item={item}
                    selected={selected === item.path}
                    renaming={renaming === item.path}
                    dropping={dropTarget === item.path}
                    onSelect={() => setSelected(item.path)}
                    onOpen={() => open(item)}
                    onRename={(name) => rename(item, name)}
                    onCancelRename={() => setRenaming(null)}
                    onContextMenu={(e) => contextMenu(e, item)}
                    dragProps={dragProps(item)}
                  />
                ))}
              </div>
            ) : (
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-surface text-left text-xs text-slate-500">
                  <tr className="border-b border-slate-200">
                    <SortHeader label="Name" by="name" sort={sort} onSort={setSort} className="pl-4" />
                    <SortHeader label="Date Modified" by="modified" sort={sort} onSort={setSort} className="hidden md:table-cell" />
                    <SortHeader label="Size" by="size" sort={sort} onSort={setSort} />
                    <SortHeader label="Kind" by="kind" sort={sort} onSort={setSort} className="hidden pr-4 sm:table-cell" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <ListRow
                      key={item.path}
                      item={item}
                      striped={i % 2 === 1}
                      selected={selected === item.path}
                      renaming={renaming === item.path}
                      dropping={dropTarget === item.path}
                      onSelect={() => setSelected(item.path)}
                      onOpen={() => open(item)}
                      onRename={(name) => rename(item, name)}
                      onCancelRename={() => setRenaming(null)}
                      onContextMenu={(e) => contextMenu(e, item)}
                      dragProps={dragProps(item)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Path bar + status */}
        <div className="flex h-7 shrink-0 items-center gap-1 border-t border-slate-200 bg-slate-50 px-3 text-xs text-slate-600">
          {location.kind === "recents" ? (
            <span className="flex items-center gap-1">
              <Clock size={12} /> Recents
            </span>
          ) : (
            <PathBar path={location.path} onGo={(path) => go({ kind: "folder", path })} />
          )}
          <span className="flex-1" />
          {busy ? (
            <span className="flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" /> {busy}
            </span>
          ) : (
            <span>
              {items.length} item{items.length === 1 ? "" : "s"}
              {selectedItem?.kind === "file" && ` · ${selectedItem.name} · ${formatBytes(selectedItem.size)}`}
            </span>
          )}
          <button onClick={refresh} aria-label="Refresh" title="Refresh" className="ml-1 rounded p-0.5 hover:bg-slate-200">
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
      {properties && <PropertiesDialog info={properties} onClose={closeProperties} />}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20 p-4">
          <div className="w-full max-w-sm rounded-xl bg-surface p-5 shadow-2xl" role="alertdialog" aria-label="Confirm delete">
            <p className="font-semibold">Delete “{confirmDelete.name}”?</p>
            <p className="mt-1 text-sm text-slate-600">
              {confirmDelete.kind === "folder" ? "The folder and everything inside it will be deleted. " : ""}
              This can&apos;t be undone yet.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button autoFocus onClick={() => setConfirmDelete(null)} className="rounded-lg px-3 py-1.5 text-sm hover:bg-slate-100">
                Cancel
              </button>
              <button onClick={() => remove(confirmDelete)} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** System folders can't be renamed, moved or deleted. */
const canChange = (item: Item | null): item is Item => Boolean(item) && !(item!.kind === "folder" && item!.system);

// ---- Pieces ----

interface ItemProps {
  item: Item;
  selected: boolean;
  renaming: boolean;
  dropping: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onRename: (name: string) => void;
  onCancelRename: () => void;
  onContextMenu: (e: MouseEvent) => void;
  dragProps: Record<string, unknown>;
}

function GridItem(p: ItemProps) {
  return (
    <div
      {...p.dragProps}
      onClick={(e) => {
        e.stopPropagation();
        p.onSelect();
      }}
      onDoubleClick={p.onOpen}
      onContextMenu={p.onContextMenu}
      title={p.item.name}
      className="flex cursor-default flex-col items-center gap-1 rounded-lg p-1.5 select-none"
    >
      <span
        className={`flex h-[76px] w-[86px] items-center justify-center rounded-lg ${
          p.dropping ? "bg-blue-100 dark:bg-blue-500/20 ring-2 ring-blue-400" : p.selected ? "bg-slate-200/80" : ""
        }`}
      >
        <ItemIcon item={p.item} size={64} />
      </span>
      {p.renaming ? (
        <RenameInput name={p.item.name} onDone={p.onRename} onCancel={p.onCancelRename} className="w-full text-center" />
      ) : (
        <span
          className={`line-clamp-2 max-w-full rounded px-1.5 text-center text-xs leading-tight break-words ${
            p.selected ? "bg-blue-600 text-white" : "text-slate-800"
          }`}
        >
          {p.item.name}
        </span>
      )}
    </div>
  );
}

function ListRow(p: ItemProps & { striped: boolean }) {
  const file = p.item.kind === "file" ? p.item : null;
  return (
    <tr
      {...p.dragProps}
      onClick={(e) => {
        e.stopPropagation();
        p.onSelect();
      }}
      onDoubleClick={p.onOpen}
      onContextMenu={p.onContextMenu}
      className={`cursor-default select-none ${
        p.dropping ? "bg-blue-100 dark:bg-blue-500/20" : p.selected ? "bg-blue-600 text-white" : p.striped ? "bg-slate-50" : ""
      }`}
    >
      <td className="py-1 pl-4">
        <span className="flex items-center gap-2">
          <ItemIcon item={p.item} size={20} />
          {p.renaming ? (
            <RenameInput name={p.item.name} onDone={p.onRename} onCancel={p.onCancelRename} className="flex-1 text-slate-800" />
          ) : (
            <span className="truncate">{p.item.name}</span>
          )}
        </span>
      </td>
      <td className={`hidden md:table-cell ${p.selected ? "" : "text-slate-500"}`}>
        {file ? new Date(file.modified).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "--"}
      </td>
      <td className={p.selected ? "" : "text-slate-500"}>{file ? formatBytes(file.size) : "--"}</td>
      <td className={`hidden pr-4 sm:table-cell ${p.selected ? "" : "text-slate-500"}`}>{kindOf(p.item)}</td>
    </tr>
  );
}

function RenameInput({ name, onDone, onCancel, className }: { name: string; onDone: (n: string) => void; onCancel: () => void; className?: string }) {
  const [value, setValue] = useState(name);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => {
    // Select the name without its extension, like other operating systems do.
    const dot = name.lastIndexOf(".");
    ref.current?.focus();
    ref.current?.setSelectionRange(0, dot > 0 ? dot : name.length);
  }, [name]);
  const finish = (commit: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (commit) onDone(value);
    else onCancel();
  };
  return (
    <input
      ref={ref}
      value={value}
      aria-label="New name"
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
      className={`rounded border border-blue-500 bg-surface px-1 text-xs outline-none select-text ${className ?? ""}`}
    />
  );
}

export function FolderIcon({ size, glyph: Glyph }: { size: number; glyph?: LucideIcon }) {
  return (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/folder.svg" alt="" width={size} height={size} draggable={false} className="drop-shadow-sm" />
      {Glyph && (
        <Glyph
          size={size * 0.3}
          strokeWidth={2.4}
          className="absolute text-amber-700/70"
          style={{ left: size * 0.4, top: size * 0.5 }}
        />
      )}
    </span>
  );
}

function ItemIcon({ item, size }: { item: Item; size: number }) {
  if (item.kind === "folder") {
    return <FolderIcon size={size} glyph={item.system ? SYSTEM_ICONS[item.path] : undefined} />;
  }
  if (item.type.startsWith("image/") && size >= 48) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={cloud.fileUrl(item.path)}
        alt=""
        loading="lazy"
        draggable={false}
        className="rounded border border-slate-200 bg-surface object-contain shadow-sm"
        style={{ maxWidth: size + 16, maxHeight: size }}
      />
    );
  }
  return <DocumentIcon name={item.name} type={item.type} size={size} />;
}

/** A page with a folded corner and the file's extension, coloured by kind. */
export function DocumentIcon({ name, type, size }: { name: string; type: string; size: number }) {
  const ext = name.includes(".") ? name.split(".").pop()!.slice(0, 4).toUpperCase() : "";
  const color = type.startsWith("image/")
    ? "#db2777"
    : type.startsWith("video/")
      ? "#7c3aed"
      : type.startsWith("audio/")
        ? "#ea580c"
        : type === "application/pdf"
          ? "#dc2626"
          : type.includes("spreadsheet") || ext === "CSV"
            ? "#16a34a"
            : type.includes("presentation")
              ? "#d97706"
              : "#2563eb";
  return (
    <svg width={size * 0.8} height={size} viewBox="0 0 40 50" aria-hidden="true" className="drop-shadow-sm">
      <path d="M3 2h24l10 10v35a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" fill="#fff" stroke="#cbd5e1" />
      <path d="M27 2v9a1 1 0 0 0 1 1h9" fill="#f1f5f9" stroke="#cbd5e1" />
      {ext && size >= 40 ? (
        <>
          <rect x="5" y="30" width="30" height="11" rx="2" fill={color} />
          <text x="20" y="38.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fontFamily="sans-serif">
            {ext}
          </text>
        </>
      ) : (
        <rect x="8" y="22" width="24" height="4" rx="2" fill={color} opacity="0.7" />
      )}
    </svg>
  );
}

function Preview({ file }: { file: CloudFile }) {
  const url = cloud.fileUrl(file.path);
  const [text, setText] = useState<string | null>(null);
  const isText = file.type.startsWith("text/") || file.type === "application/json";

  useEffect(() => {
    if (isText) fetch(url).then((r) => r.text()).then(setText).catch(() => setText("Couldn't load this file."));
  }, [isText, url]);

  if (file.type.startsWith("image/"))
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={file.name} className="max-h-full max-w-full rounded-lg shadow" />;
  if (file.type.startsWith("video/")) return <video src={url} controls className="max-h-full max-w-full rounded-lg" />;
  if (file.type.startsWith("audio/")) return <audio src={url} controls />;
  if (file.type === "application/pdf") return <iframe src={url} title={file.name} className="h-full w-full rounded-lg border-0 bg-surface" />;
  if (isText)
    return (
      <pre className="h-full w-full overflow-auto rounded-lg bg-surface p-4 text-sm whitespace-pre-wrap text-slate-800 shadow-inner select-text">
        {text ?? "Loading…"}
      </pre>
    );
  return (
    <div className="flex flex-col items-center gap-3 text-center text-slate-600">
      <DocumentIcon name={file.name} type={file.type} size={96} />
      <p>This kind of file can&apos;t be shown here yet.</p>
      <a href={cloud.fileUrl(file.path, true)} download={file.name} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700">
        Download
      </a>
    </div>
  );
}

function PathBar({ path, onGo }: { path: string; onGo: (path: string) => void }) {
  const parts = path ? path.split("/") : [];
  return (
    <span className="flex min-w-0 items-center gap-0.5 overflow-hidden">
      <button onClick={() => onGo("")} className="flex shrink-0 items-center gap-1 rounded px-1 hover:bg-slate-200">
        <Cloud size={12} /> {ROOT_NAME}
      </button>
      {parts.map((part, i) => (
        <span key={i} className="flex min-w-0 items-center gap-0.5">
          <ChevronRight size={12} className="shrink-0 text-slate-400" />
          <button onClick={() => onGo(parts.slice(0, i + 1).join("/"))} className="truncate rounded px-1 hover:bg-slate-200">
            {part}
          </button>
        </span>
      ))}
    </span>
  );
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 px-2 text-[11px] font-semibold text-slate-500">{title}</p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function SidebarItem(props: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  dropping?: boolean;
  onClick: () => void;
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: DragEvent) => void;
}) {
  const Icon = props.icon;
  return (
    <li>
      <button
        onClick={props.onClick}
        onDragOver={props.onDragOver}
        onDragLeave={props.onDragLeave}
        onDrop={props.onDrop}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left ${
          props.dropping ? "bg-blue-100 dark:bg-blue-500/20 ring-1 ring-blue-400" : props.active ? "bg-slate-300/70" : "hover:bg-slate-200/70"
        }`}
      >
        <Icon size={16} className="shrink-0 text-blue-500" />
        <span className="truncate">{props.label}</span>
      </button>
    </li>
  );
}

function ToolButton(props: { label: string; disabled?: boolean; pressed?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.pressed}
      disabled={props.disabled}
      onClick={props.onClick}
      className={`rounded-md p-1.5 text-slate-600 disabled:opacity-30 ${
        props.pressed ? "bg-surface shadow-sm" : "hover:bg-slate-100 disabled:hover:bg-transparent"
      }`}
    >
      {props.children}
    </button>
  );
}

/** A list-view column title: click to sort by it, click again to reverse. */
function SortHeader(props: {
  label: string;
  by: SortBy;
  sort: { by: SortBy; desc: boolean };
  onSort: (s: { by: SortBy; desc: boolean }) => void;
  className?: string;
}) {
  const active = props.sort.by === props.by;
  return (
    <th className={`py-0.5 font-medium ${props.className ?? ""}`} aria-sort={active ? (props.sort.desc ? "descending" : "ascending") : undefined}>
      <button
        onClick={() => props.onSort({ by: props.by, desc: active ? !props.sort.desc : false })}
        className={`-ml-1 flex items-center gap-1 rounded px-1 py-1 hover:bg-slate-100 ${active ? "text-slate-800" : ""}`}
      >
        {props.label}
        {active && (props.sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
      </button>
    </th>
  );
}
