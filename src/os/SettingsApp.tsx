"use client";

import {
  AppWindow,
  Brush,
  Check,
  ChevronRight,
  Cloud,
  CloudOff,
  FolderOpen,
  Info,
  LayoutGrid,
  Maximize,
  Monitor,
  Moon,
  Palette,
  Power,
  RotateCcw,
  Search,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { APPS, READY_APPS, WALLPAPERS, type AppId, type OSStyle, type PowerAction, type Theme, type WallpaperId } from "./apps";
import { API_URL } from "./cloud";
import { AppTile } from "./common";
import { isDesktopApp } from "./desktopBridge";
import { isFullscreen, toggleFullscreen } from "./fullscreen";

export interface SettingsProps {
  style: OSStyle;
  wallpaper: WallpaperId;
  theme: Theme;
  deviceName: string;
  onStyle: (s: OSStyle) => void;
  onWallpaper: (w: WallpaperId) => void;
  onTheme: (t: Theme) => void;
  onRename: (name: string) => void;
  onPower: (action: PowerAction) => void;
  onOpen: (id: AppId) => void;
}

type Page = "system" | "personalisation" | "apps" | "about";

const PAGES: { id: Page; label: string; icon: LucideIcon; color: string }[] = [
  { id: "system", label: "System", icon: Monitor, color: "text-sky-500" },
  { id: "personalisation", label: "Personalisation", icon: Brush, color: "text-orange-500" },
  { id: "apps", label: "Apps", icon: LayoutGrid, color: "text-violet-500" },
  { id: "about", label: "About", icon: Info, color: "text-slate-500" },
];

/** Everything "Find a setting" can find, and which page it lives on. */
const SEARCHABLE: { label: string; page: Page; words: string }[] = [
  { label: "Device name", page: "system", words: "rename computer pc name" },
  { label: "Full screen", page: "system", words: "display screen fullscreen" },
  { label: "Storage", page: "system", words: "files cloud r2 space" },
  { label: "Power", page: "system", words: "restart shut down shutdown off" },
  { label: "Theme", page: "personalisation", words: "dewindows demac style taskbar dock look" },
  { label: "Colours", page: "personalisation", words: "dark light auto mode appearance colors" },
  { label: "Background", page: "personalisation", words: "wallpaper picture desktop" },
  { label: "Installed apps", page: "apps", words: "programs applications" },
  { label: "About Dementa OS", page: "about", words: "version info specifications" },
];

const OS_THEMES = [
  { id: "windows", name: "deWindows", about: "Taskbar and Start at the bottom, window buttons on the right." },
  { id: "mac", name: "deMac", about: "Menu bar at the top, dock at the bottom, window buttons on the left." },
] as const;

const COLOUR_MODES = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "auto", label: "Auto", icon: Monitor },
] as const;


export function SettingsApp(props: SettingsProps) {
  const [page, setPage] = useState<Page>("system");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = q ? SEARCHABLE.filter((s) => `${s.label} ${s.words}`.toLowerCase().includes(q)) : [];

  return (
    <div className="flex h-full bg-slate-100 text-slate-800">
      {/* Navigation */}
      <nav className="hidden w-60 shrink-0 flex-col gap-1 overflow-y-auto px-3 py-4 sm:flex">
        <div className="mb-3 flex items-center gap-3 px-2">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-violet-500 text-lg font-semibold text-white">
            D
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">Dementa user</span>
            <span className="block text-xs text-slate-500">Local account</span>
          </span>
        </div>
        <label className="mb-2 flex items-center gap-2 rounded-md border border-slate-200 bg-surface px-3 py-1.5 focus-within:border-blue-500">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a setting"
            aria-label="Find a setting"
            className="w-full bg-transparent text-sm outline-none select-text"
          />
          <Search size={14} className="text-slate-500" />
        </label>
        {PAGES.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setPage(p.id);
              setQuery("");
            }}
            className={`relative flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${
              page === p.id && !q ? "bg-slate-200/80 font-medium" : "hover:bg-slate-200/50"
            }`}
          >
            {page === p.id && !q && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-blue-600" />}
            <p.icon size={18} className={p.color} />
            {p.label}
          </button>
        ))}
      </nav>

      {/* Page */}
      <main className="min-w-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8">
        {q ? (
          <>
            <h1 className="mb-5 text-2xl font-semibold">Search results</h1>
            {results.length === 0 ? (
              <p className="text-sm text-slate-500">No settings match “{query}”.</p>
            ) : (
              <div className="space-y-1">
                {results.map((r) => (
                  <Row
                    key={r.label}
                    icon={PAGES.find((p) => p.id === r.page)!.icon}
                    title={r.label}
                    subtitle={PAGES.find((p) => p.id === r.page)!.label}
                    onClick={() => {
                      setPage(r.page);
                      setQuery("");
                    }}
                  />
                ))}
              </div>
            )}
          </>
        ) : page === "system" ? (
          <SystemPage {...props} goTo={setPage} />
        ) : page === "personalisation" ? (
          <PersonalisationPage {...props} />
        ) : page === "apps" ? (
          <AppsPage onOpen={props.onOpen} />
        ) : (
          <AboutPage {...props} />
        )}
      </main>
    </div>
  );
}

// ---- Pages ----

function SystemPage(props: SettingsProps & { goTo: (p: Page) => void }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(props.deviceName);
  const [cloudOk, setCloudOk] = useState<boolean | null>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/status`)
      .then((r) => setCloudOk(r.ok))
      .catch(() => setCloudOk(false));
    const sync = () => setFull(isFullscreen());
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const saveName = () => {
    const clean = name.trim().slice(0, 30);
    if (clean) props.onRename(clean);
    else setName(props.deviceName);
    setRenaming(false);
  };

  return (
    <>
      <h1 className="mb-5 text-2xl font-semibold">System</h1>
      <div className="mb-5 flex flex-wrap items-center gap-5">
        <span className="h-20 w-32 shrink-0 rounded-lg shadow-md ring-1 ring-black/10" style={{ background: WALLPAPERS[props.wallpaper].css }} />
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={name}
              aria-label="Device name"
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") {
                  setName(props.deviceName);
                  setRenaming(false);
                }
              }}
              className="w-full max-w-xs rounded-md border border-blue-500 bg-surface px-2 py-1 text-xl font-semibold outline-none select-text"
            />
          ) : (
            <p className="truncate text-xl font-semibold">{props.deviceName}</p>
          )}
          <p className="text-sm text-slate-500">Dementa OS · {OS_THEMES.find((t) => t.id === props.style)!.name}</p>
          {!renaming && (
            <button onClick={() => setRenaming(true)} className="text-sm text-blue-600 hover:underline">
              Rename
            </button>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {cloudOk === false ? <CloudOff size={26} className="text-red-500" /> : <Cloud size={26} className="text-sky-500" />}
          <span className="leading-tight">
            <span className="block text-sm font-medium">Dementa Cloud</span>
            <span className="block text-xs text-slate-500">{cloudOk === null ? "Checking…" : cloudOk ? "Connected" : "Can't connect"}</span>
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <Row icon={Maximize} title="Full screen" subtitle="Hide the browser's bars and use the whole screen">
          <Switch on={full} label="Full screen" onChange={toggleFullscreen} />
        </Row>
        <Row icon={FolderOpen} title="Storage" subtitle="Your folders and files in Dementa Cloud" onClick={() => props.onOpen("files")} />
        <Row icon={Palette} title="Personalisation" subtitle="Theme, colours, background" onClick={() => props.goTo("personalisation")} />
        <Row icon={Power} title="Power" subtitle="Restart or shut down Dementa OS">
          <span className="flex gap-2">
            <SmallButton onClick={() => props.onPower("restart")}>
              <RotateCcw size={14} /> Restart
            </SmallButton>
            <SmallButton onClick={() => props.onPower("shutdown")}>
              <Power size={14} /> Shut down
            </SmallButton>
          </span>
        </Row>
      </div>
    </>
  );
}

function PersonalisationPage(props: SettingsProps) {
  // Picking a theme only selects it; it changes the whole system after "Apply theme".
  const [chosen, setChosen] = useState<OSStyle>(props.style);
  const chosenName = OS_THEMES.find((t) => t.id === chosen)!.name;

  return (
    <>
      <h1 className="mb-5 text-2xl font-semibold">Personalisation</h1>

      <Card title="Theme" subtitle="Changes how the whole of Dementa OS looks and works">
        <div className="grid gap-3 sm:grid-cols-2">
          {OS_THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setChosen(t.id)}
              aria-pressed={chosen === t.id}
              className={`rounded-lg border-2 p-2 text-left transition ${
                chosen === t.id ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <StylePreview style={t.id} />
              <span className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
                {t.name}
                {props.style === t.id && (
                  <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <Check size={10} /> Current
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">{t.about}</span>
            </button>
          ))}
        </div>
        {chosen !== props.style && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-100 px-3 py-2 text-sm">
            <span>Switch Dementa OS to {chosenName}? Open windows stay open.</span>
            <span className="flex shrink-0 gap-2">
              <button onClick={() => setChosen(props.style)} className="rounded-md px-3 py-1.5 hover:bg-slate-200">
                Cancel
              </button>
              <button onClick={() => props.onStyle(chosen)} className="rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700">
                Apply theme
              </button>
            </span>
          </div>
        )}
      </Card>

      <Card title="Colours" subtitle="Auto follows your computer's light or dark setting">
        <div className="grid grid-cols-3 gap-3">
          {COLOUR_MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => props.onTheme(id)}
              aria-pressed={props.theme === id}
              className={`rounded-lg border-2 p-2 text-left transition ${
                props.theme === id ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <ColourPreview mode={id} />
              <span className="mt-2 flex items-center gap-1.5 text-sm font-medium">
                <Icon size={15} className={props.theme === id ? "text-blue-600" : "text-slate-500"} />
                {label}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Background" subtitle="The picture behind your desktop">
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(WALLPAPERS) as WallpaperId[]).map((id) => (
            <button
              key={id}
              onClick={() => props.onWallpaper(id)}
              aria-pressed={props.wallpaper === id}
              className={`overflow-hidden rounded-lg border-2 text-sm font-medium ${
                props.wallpaper === id ? "border-blue-500" : "border-transparent hover:border-slate-300"
              }`}
            >
              <span className="block h-16" style={{ background: WALLPAPERS[id].css }} />
              <span className="block py-1.5">{WALLPAPERS[id].name}</span>
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}

function AppsPage({ onOpen }: { onOpen: (id: AppId) => void }) {
  return (
    <>
      <h1 className="mb-5 text-2xl font-semibold">Apps</h1>
      <p className="mb-2 text-sm text-slate-500">Installed apps ({APPS.length})</p>
      <div className="space-y-1">
        {APPS.map((app) => (
          <div key={app.id} className="flex items-center gap-4 rounded-lg bg-surface px-4 py-3 shadow-sm">
            <AppTile app={app} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{app.name}</span>
              <span className="block truncate text-xs text-slate-500">{app.blurb}</span>
            </span>
            {!READY_APPS.has(app.id) && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Coming soon</span>
            )}
            <SmallButton onClick={() => onOpen(app.id)}>
              <AppWindow size={14} /> Open
            </SmallButton>
          </div>
        ))}
      </div>
    </>
  );
}

function AboutPage(props: SettingsProps) {
  const [details, setDetails] = useState<{ screen: string; edition: string; browser: string } | null>(null);
  useEffect(() => {
    const chrome = navigator.userAgent.match(/Chrome\/(\d+)/)?.[1];
    setDetails({
      screen: `${window.screen.width} × ${window.screen.height}`,
      edition: isDesktopApp() ? "App" : "Web",
      browser: chrome ? `Chromium ${chrome}` : navigator.userAgent.split(" ").pop() ?? "Unknown",
    });
  }, []);

  const rows: [string, string][] = [
    ["Device name", props.deviceName],
    ["Edition", details ? `Dementa OS ${details.edition}` : "…"],
    ["Version", "0.1.0"],
    ["Theme", OS_THEMES.find((t) => t.id === props.style)!.name],
    ["Colours", COLOUR_MODES.find((c) => c.id === props.theme)!.label],
    ["Screen", details?.screen ?? "…"],
    ["Engine", details?.browser ?? "…"],
  ];

  return (
    <>
      <h1 className="mb-5 text-2xl font-semibold">About</h1>
      <Card title="Dementa OS" subtitle="A complete computer desktop that runs in your browser">
        <dl className="divide-y divide-slate-200 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-4 py-2">
              <dt className="w-32 shrink-0 text-slate-500">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}

// ---- Building blocks ----

/** A setting row: icon, title, description, then a control or a › arrow. */
function Row(props: { icon: LucideIcon; title: string; subtitle: string; onClick?: () => void; children?: ReactNode }) {
  const content = (
    <>
      <props.icon size={20} className="shrink-0 text-slate-600" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{props.title}</span>
        <span className="block truncate text-xs text-slate-500">{props.subtitle}</span>
      </span>
      {props.children ?? (props.onClick && <ChevronRight size={18} className="text-slate-500" />)}
    </>
  );
  const className = "flex min-h-16 w-full items-center gap-4 rounded-lg bg-surface px-4 py-3 text-left shadow-sm";
  return props.onClick && !props.children ? (
    <button onClick={props.onClick} className={`${className} hover:bg-slate-50`}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="mb-3 rounded-lg bg-surface p-4 shadow-sm">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mb-3 text-xs text-slate-500">{subtitle}</p>
      {children}
    </section>
  );
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className="flex items-center gap-2 text-sm"
    >
      <span className="text-slate-600">{on ? "On" : "Off"}</span>
      <span className={`relative h-5 w-10 rounded-full transition ${on ? "bg-blue-600" : "border border-slate-500 bg-transparent"}`}>
        <span
          className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full transition-all ${
            on ? "left-[23px] bg-white" : "left-[4px] bg-slate-600"
          }`}
        />
      </span>
    </button>
  );
}

function SmallButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-surface px-3 py-1.5 text-sm hover:bg-slate-50"
    >
      {children}
    </button>
  );
}

function StylePreview({ style }: { style: OSStyle }) {
  return (
    <span className="relative block h-20 overflow-hidden rounded-md" style={{ background: WALLPAPERS.ocean.css }}>
      {style === "windows" ? (
        <span className="absolute inset-x-0 bottom-0 flex h-3 items-center justify-center gap-0.5 bg-white/75">
          {["#3b82f6", "#f59e0b", "#0ea5e9", "#22c55e", "#64748b"].map((c) => (
            <span key={c} className="h-1.5 w-1.5 rounded-sm" style={{ background: c }} />
          ))}
        </span>
      ) : (
        <>
          <span className="absolute inset-x-0 top-0 h-2 bg-white/60" />
          <span className="absolute bottom-1 left-1/2 h-3 w-16 -translate-x-1/2 rounded bg-white/50" />
        </>
      )}
    </span>
  );
}

/** A tiny window drawn in light, dark, or half of each (auto). */
function ColourPreview({ mode }: { mode: Theme }) {
  const win = (dark: boolean) => (
    <span className={`flex h-full flex-col ${dark ? "bg-[#1b2130]" : "bg-white"}`}>
      <span className={`h-2 ${dark ? "bg-[#2d3546]" : "bg-[#e2e8f0]"}`} />
      <span className={`m-1.5 h-1.5 w-8 rounded-full ${dark ? "bg-[#67728a]" : "bg-[#cbd5e1]"}`} />
      <span className={`mx-1.5 h-1.5 w-5 rounded-full ${dark ? "bg-[#3d4659]" : "bg-[#e2e8f0]"}`} />
    </span>
  );
  return (
    <span className="relative block h-16 overflow-hidden rounded-md p-2" style={{ background: WALLPAPERS.ocean.css }}>
      <span className="flex h-full overflow-hidden rounded shadow">
        {mode === "auto" ? (
          <>
            <span className="w-1/2 overflow-hidden">{win(false)}</span>
            <span className="w-1/2 overflow-hidden">{win(true)}</span>
          </>
        ) : (
          <span className="w-full">{win(mode === "dark")}</span>
        )}
      </span>
    </span>
  );
}
