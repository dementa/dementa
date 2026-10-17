"use client";

import { ArrowLeft, ArrowRight, Home, Lock, MonitorSmartphone, Plus, RotateCw, Search, ShieldAlert, X } from "lucide-react";
import {
  createElement,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { isDesktopApp } from "../desktopBridge";
import { ALLOWED_HOSTS, APP_ONLY_HOSTS, SEARCH_URL, SITES, type Site } from "./sites";

const HOME = "dementa://home";
const BLOCKED = "dementa://blocked/";
/** App-only site opened in the web version; the real address follows, URI-encoded. */
const APP_ONLY = "dementa://app-only/";
const MAX_TABS = 6;

interface Tab {
  id: number;
  history: string[];
  index: number;
  /** Bumped by Reload to remount the page. */
  reloadKey: number;
  /** Address and title reported by the Windows app's browser as the child clicks around. */
  liveUrl?: string;
  liveTitle?: string;
}

/** Minimal typing for Electron's <webview> element (Windows app only). */
interface WebviewElement extends HTMLElement {
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
  getWebContentsId(): number;
}

/** Webview methods throw until the page inside has started ("dom-ready"); treat that as "not yet". */
function ask<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function matchesHost(url: URL, hosts: string[]): boolean {
  return (
    url.protocol === "https:" &&
    hosts.some((h) => (h.startsWith("*.") ? url.hostname.endsWith(h.slice(1)) : url.hostname === h || url.hostname === `www.${h}`))
  );
}

/** Turns what the child typed into a page to show: an approved address, a blocked page, or a search. */
function resolveInput(input: string, desktop: boolean): string | null {
  const text = input.trim();
  if (!text) return null;
  const looksLikeAddress = !/\s/.test(text) && (/^[a-z]+:\/\//i.test(text) || /\.[a-z]{2,}(\/|$)/i.test(text));
  if (!looksLikeAddress) return SEARCH_URL + encodeURIComponent(text);
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
    return pageFor(url.href, desktop) ?? BLOCKED + encodeURIComponent(url.hostname);
  } catch {
    return SEARCH_URL + encodeURIComponent(text);
  }
}

/** The page to show for an approved address, or null if it isn't approved. */
function pageFor(href: string, desktop: boolean): string | null {
  const url = new URL(href);
  if (matchesHost(url, ALLOWED_HOSTS)) return url.href;
  if (matchesHost(url, APP_ONLY_HOSTS)) return desktop ? url.href : APP_ONLY + encodeURIComponent(url.href);
  return null;
}

/** Real web address behind a page. */
function realUrl(page: string): string {
  return page.startsWith(APP_ONLY) ? decodeURIComponent(page.slice(APP_ONLY.length)) : page;
}

function siteFor(page: string): Site | undefined {
  const url = realUrl(page);
  if (!url.startsWith("https://")) return undefined;
  const host = new URL(url).hostname.replace(/^www\./, "");
  return SITES.find((s) => new URL(s.url).hostname.replace(/^www\./, "") === host);
}

function tabTitle(page: string): string {
  if (page === HOME) return "Home";
  if (page.startsWith(BLOCKED)) return "Not allowed";
  if (page.startsWith(SEARCH_URL)) return "Search";
  return siteFor(page)?.name ?? new URL(realUrl(page)).hostname;
}

let nextTabId = 1;
const newTab = (page = HOME): Tab => ({ id: nextTabId++, history: [page], index: 0, reloadKey: 0 });

// Read once on the client; the server render (web) always says false.
const useDesktop = () => useSyncExternalStore(() => () => {}, isDesktopApp, () => false);

export function BrowserApp({ onActivate }: { onActivate: () => void }) {
  const desktop = useDesktop();
  const [tabs, setTabs] = useState<Tab[]>(() => [newTab()]);
  const [activeId, setActiveId] = useState(tabs[0].id);
  const tab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const page = tab.history[tab.index];
  const isWeb = page.startsWith("https://");

  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const webviews = useRef(new Map<number, WebviewElement>());
  const frames = useRef(new Map<number, HTMLIFrameElement>());

  // Keep the address bar in step with the page shown in the active tab.
  const shownUrl = isWeb && tab.liveUrl ? tab.liveUrl : realUrl(page);
  useEffect(() => {
    setAddress(page === HOME || page.startsWith(BLOCKED) ? "" : shownUrl);
  }, [page, shownUrl]);

  useEffect(() => {
    setLoading(page.startsWith("https://"));
  }, [page, tab.reloadKey]);

  // Clicks inside a website don't reach our page, so notice when it takes focus and bring this
  // window to the front like any other click would.
  useEffect(() => {
    const onBlur = () =>
      setTimeout(() => {
        const el = document.activeElement;
        const ours = [...webviews.current.values(), ...frames.current.values()];
        if (el && ours.includes(el as HTMLIFrameElement & WebviewElement)) onActivate();
      });
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [onActivate]);

  // Windows app: a link inside a website tried to go somewhere unapproved.
  useEffect(() => {
    if (!desktop) return;
    return window.dementa!.onNavigationBlocked((webContentsId, host) => {
      const entry = [...webviews.current.entries()].find(([, wv]) => ask(() => wv.getWebContentsId(), -1) === webContentsId);
      if (!entry) return;
      const [tabId] = entry;
      setTabs((ts) =>
        ts.map((t) => {
          if (t.id !== tabId) return t;
          const history = [...t.history.slice(0, t.index + 1), BLOCKED + encodeURIComponent(host)];
          return { ...t, history, index: history.length - 1, liveUrl: undefined, liveTitle: undefined };
        }),
      );
    });
  }, [desktop]);

  function updateTab(id: number, patch: (t: Tab) => Tab) {
    setTabs((ts) => ts.map((t) => (t.id === id ? patch(t) : t)));
  }

  function navigate(target: string) {
    updateTab(tab.id, (t) => {
      const history = [...t.history.slice(0, t.index + 1), target];
      return { ...t, history, index: history.length - 1, liveUrl: undefined, liveTitle: undefined };
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const target = resolveInput(address, desktop);
    if (target) navigate(target);
  }

  function addTab() {
    if (tabs.length >= MAX_TABS) return;
    const t = newTab();
    setTabs((ts) => [...ts, t]);
    setActiveId(t.id);
  }

  function closeTab(id: number) {
    if (tabs.length === 1) {
      const t = newTab();
      setTabs([t]);
      setActiveId(t.id);
      return;
    }
    const i = tabs.findIndex((t) => t.id === id);
    const rest = tabs.filter((t) => t.id !== id);
    setTabs(rest);
    if (id === activeId) setActiveId(rest[Math.max(0, i - 1)].id);
  }

  // In the Windows app the website keeps its own history (links clicked inside it); use that first.
  const wv = isWeb ? webviews.current.get(tab.id) : undefined;
  const [, rerender] = useState(0);
  const webBack = wv ? ask(() => wv.canGoBack(), false) : false;
  const webForward = wv ? ask(() => wv.canGoForward(), false) : false;
  const canBack = tab.index > 0 || webBack;
  const canForward = tab.index < tab.history.length - 1 || webForward;

  function back() {
    if (wv && webBack) wv.goBack();
    else updateTab(tab.id, (t) => ({ ...t, index: t.index - 1, liveUrl: undefined, liveTitle: undefined }));
  }

  function forward() {
    if (wv && webForward) wv.goForward();
    else updateTab(tab.id, (t) => ({ ...t, index: t.index + 1, liveUrl: undefined, liveTitle: undefined }));
  }

  function reload() {
    if (wv && ask(() => (wv.reload(), true), false)) return;
    updateTab(tab.id, (t) => ({ ...t, reloadKey: t.reloadKey + 1 }));
  }

  return (
    <div className="flex h-full flex-col bg-slate-100">
      {/* Tabs */}
      <div className="flex shrink-0 items-end gap-1 overflow-x-auto px-2 pt-1.5">
        {tabs.map((t) => {
          const tPage = t.history[t.index];
          const active = t.id === tab.id;
          return (
            <div
              key={t.id}
              className={`group flex h-8 max-w-48 min-w-28 shrink-0 cursor-default items-center gap-1.5 rounded-t-lg pr-1 pl-3 text-xs ${
                active ? "bg-surface shadow-sm" : "text-slate-600 hover:bg-surface/60"
              }`}
              onClick={() => setActiveId(t.id)}
            >
              <span>{siteFor(t.liveUrl ?? tPage)?.emoji ?? (tPage === HOME ? "🏠" : "🌐")}</span>
              <span className="flex-1 truncate">{t.liveTitle || tabTitle(tPage)}</span>
              <button
                aria-label="Close tab"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                className="rounded p-0.5 opacity-60 hover:bg-slate-200 hover:opacity-100"
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
        <button
          aria-label="New tab"
          onClick={addTab}
          disabled={tabs.length >= MAX_TABS}
          className="mb-1 rounded-md p-1.5 text-slate-600 hover:bg-surface/70 disabled:opacity-30"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-surface px-2 py-1.5">
        <ToolButton label="Back" disabled={!canBack} onClick={back}>
          <ArrowLeft size={17} />
        </ToolButton>
        <ToolButton label="Forward" disabled={!canForward} onClick={forward}>
          <ArrowRight size={17} />
        </ToolButton>
        <ToolButton label="Reload" disabled={!isWeb} onClick={reload}>
          <RotateCw size={16} />
        </ToolButton>
        <ToolButton label="Home" onClick={() => navigate(HOME)}>
          <Home size={17} />
        </ToolButton>
        <form onSubmit={submit} className="ml-1 flex flex-1 items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-400">
          {isWeb ? <Lock size={13} className="shrink-0 text-emerald-600" /> : <Search size={14} className="shrink-0 text-slate-400" />}
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="Search Wikipedia or type an address"
            aria-label="Address"
            spellCheck={false}
            className="w-full min-w-0 bg-transparent text-sm outline-none select-text"
          />
        </form>
      </div>

      {/* Pages: every tab stays mounted so switching tabs keeps each website as it was. */}
      <div className="relative min-h-0 flex-1 bg-surface">
        {loading && <div className="browser-loading absolute inset-x-0 top-0 z-10 h-0.5 bg-blue-500" />}
        {tabs.map((t) => {
          const tPage = t.history[t.index];
          const active = t.id === tab.id;
          const layer = `absolute inset-0 ${active ? "" : "invisible"}`;
          const key = `${t.id}-${t.index}-${t.reloadKey}`;

          if (tPage === HOME) return <div key={key} className={layer}><HomePage desktop={desktop} onOpen={navigate} /></div>;
          if (tPage.startsWith(APP_ONLY)) return <div key={key} className={layer}><AppOnlyPage page={tPage} /></div>;
          if (tPage.startsWith(BLOCKED))
            return (
              <div key={key} className={layer}>
                <BlockedPage host={decodeURIComponent(tPage.slice(BLOCKED.length))} onHome={() => navigate(HOME)} />
              </div>
            );

          if (desktop)
            return (
              <Webview
                key={key}
                src={tPage}
                className={layer}
                register={(el) => (el ? webviews.current.set(t.id, el) : webviews.current.delete(t.id))}
                onLoading={(l) => active && setLoading(l)}
                onNavigate={(url) => {
                  updateTab(t.id, (x) => ({ ...x, liveUrl: url }));
                  rerender((n) => n + 1);
                }}
                onTitle={(title) => updateTab(t.id, (x) => ({ ...x, liveTitle: title }))}
              />
            );

          return (
            <iframe
              key={key}
              ref={(el) => {
                if (el) frames.current.set(t.id, el);
                else frames.current.delete(t.id);
              }}
              src={tPage}
              title={tabTitle(tPage)}
              onLoad={() => active && setLoading(false)}
              // No popups or top-level navigation, so a website can never take the child out of Dementa OS.
              sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
              allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              className={`${layer} h-full w-full border-0`}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Electron <webview>: a real browser view, used in the Windows app so any approved site works. */
function Webview(props: {
  src: string;
  className: string;
  register: (el: WebviewElement | null) => void;
  onLoading: (loading: boolean) => void;
  onNavigate: (url: string) => void;
  onTitle: (title: string) => void;
}) {
  const ref = useRef<WebviewElement>(null);
  const handlers = useRef(props);
  handlers.current = props;

  useEffect(() => {
    const el = ref.current!;
    handlers.current.register(el);
    const on = <E extends Event>(name: string, fn: (e: E) => void) => {
      el.addEventListener(name, fn as EventListener);
      return () => el.removeEventListener(name, fn as EventListener);
    };
    type NavEvent = Event & { url: string; isMainFrame?: boolean };
    const offs = [
      on("did-start-loading", () => handlers.current.onLoading(true)),
      on("did-stop-loading", () => handlers.current.onLoading(false)),
      on<NavEvent>("did-navigate", (e) => handlers.current.onNavigate(e.url)),
      on<NavEvent>("did-navigate-in-page", (e) => e.isMainFrame && handlers.current.onNavigate(e.url)),
      on<Event & { title: string }>("page-title-updated", (e) => handlers.current.onTitle(e.title)),
    ];
    return () => {
      offs.forEach((off) => off());
      handlers.current.register(null);
    };
  }, []);

  // Logins stay saved between sessions in their own storage partition, separate from Dementa OS.
  return createElement("webview", { ref, src: props.src, partition: "persist:dementa-browser", className: props.className });
}

function ToolButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-full p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function HomePage({ desktop, onOpen }: { desktop: boolean; onOpen: (page: string) => void }) {
  const [query, setQuery] = useState("");
  const categories = [...new Set(SITES.map((s) => s.category))];

  return (
    <div className="h-full overflow-auto bg-gradient-to-b from-sky-50 to-surface dark:from-surface">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-center text-2xl font-bold text-slate-800">Where shall we explore today?</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const target = resolveInput(query, desktop);
            if (target) onOpen(target);
          }}
          className="mx-auto mt-5 flex max-w-lg items-center gap-2 rounded-full border border-slate-200 bg-surface px-4 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-blue-400"
        >
          <Search size={18} className="text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Wikipedia…"
            aria-label="Search Wikipedia"
            className="w-full bg-transparent outline-none select-text"
          />
        </form>

        {categories.map((cat) => (
          <section key={cat} className="mt-7">
            <h2 className="mb-2.5 text-sm font-semibold tracking-wide text-slate-500 uppercase">{cat}</h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3">
              {SITES.filter((s) => s.category === cat).map((site) => {
                const unavailable = site.appOnly && !desktop;
                return (
                  <button
                    key={site.name}
                    onClick={() => onOpen(pageFor(site.url, desktop)!)}
                    title={unavailable ? "Works in the Dementa OS app" : undefined}
                    className="flex flex-col items-center gap-2 rounded-2xl p-3 transition hover:-translate-y-0.5 hover:bg-surface hover:shadow-md"
                  >
                    <span
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl text-3xl shadow-sm ${unavailable ? "opacity-50 grayscale" : ""}`}
                      style={{ background: site.color }}
                    >
                      {site.emoji}
                    </span>
                    <span className="text-center text-sm leading-tight font-medium text-slate-700">{site.name}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function BlockedPage({ host, onHome }: { host: string; onHome: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <ShieldAlert size={56} className="text-amber-500" />
      <h2 className="text-xl font-bold text-slate-800">This website isn&apos;t on the allowed list</h2>
      <p className="max-w-sm text-slate-600">
        <span className="font-mono font-medium">{host}</span> can&apos;t be opened in Dementa OS yet.
      </p>
      <button onClick={onHome} className="mt-2 rounded-full bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-700">
        Go to Home
      </button>
    </div>
  );
}

/** Web version only: the site refuses to be shown inside web pages, but works in the Windows app. */
function AppOnlyPage({ page }: { page: string }) {
  const site = siteFor(page);
  const name = site?.name ?? new URL(realUrl(page)).hostname;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <span
        className="flex h-20 w-20 items-center justify-center rounded-3xl text-5xl shadow-sm"
        style={{ background: site?.color ?? "#eef2f7" }}
      >
        {site?.emoji ?? "🌐"}
      </span>
      <h2 className="text-xl font-bold text-slate-800">{name} works in the Dementa OS app</h2>
      <p className="max-w-sm text-slate-600">
        {name} doesn&apos;t allow being shown inside a website. Open it in the Dementa OS app for Windows or Mac.
      </p>
      <span className="mt-1 flex items-center gap-2 rounded-full bg-slate-100 px-4 py-1.5 text-sm text-slate-600">
        <MonitorSmartphone size={16} /> Dementa OS app
      </span>
    </div>
  );
}
