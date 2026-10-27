"use client";

// Word's View tab (Views, Immersive, Show, Zoom, dark mode), and the tabs that show with Outline
// view (Outlining) and Immersive Reader.

import type { Editor } from "@tiptap/react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  Focus,
  Globe,
  Grid3x3,
  ListTree,
  Minus,
  Moon,
  NotebookText,
  PanelLeft,
  Rows3,
  Ruler as RulerIcon,
  Search,
  ScanLine,
  Sun,
  Volume2,
  X,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { BODY_LEVEL, collapseAll, demote, demoteToBody, move, outlineOf, promote, promoteToTop, setOutline } from "../view/outline";
import type { ColumnWidth, PageTint } from "../view/ViewParts";
import { Form, Heading } from "./LayoutTab";
import { Big, Group, keepFocus, MenuButton, MenuItem, Stack } from "./parts";

export type ViewMode = "print" | "web" | "outline" | "draft" | "read";

/** What the Docs window keeps for the View tab. */
export interface ViewControls {
  mode: ViewMode;
  onMode: (m: ViewMode) => void;
  focus: boolean;
  onFocus: (on: boolean) => void;
  immersive: boolean;
  onImmersive: (on: boolean) => void;
  ruler: boolean;
  onRuler: (on: boolean) => void;
  gridlines: boolean;
  onGridlines: (on: boolean) => void;
  nav: boolean;
  onNav: (on: boolean) => void;
  dark: boolean;
  onDark: (on: boolean) => void;
  zoom: number;
  onZoom: (z: number) => void;
  /** Zoom so a whole page shows, or the page's width fills the window. */
  onFit: (fit: "page" | "width" | "text") => void;
  column: ColumnWidth;
  onColumn: (c: ColumnWidth) => void;
  tint: PageTint;
  onTint: (t: PageTint) => void;
  lineFocus: number;
  onLineFocus: (n: number) => void;
  spacing: boolean;
  onSpacing: (on: boolean) => void;
  readAloud: boolean;
  onReadAloud: (on: boolean) => void;
}

function Small(p: { icon: LucideIcon; label: string; title?: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={p.title ?? p.label}
      aria-pressed={p.active}
      disabled={p.disabled}
      onMouseDown={keepFocus}
      onClick={p.onClick}
      className={`flex h-7 items-center gap-1 rounded px-1 text-xs disabled:opacity-35 ${p.active ? "bg-blue-100 text-blue-800" : "hover:bg-slate-200/70"}`}
    >
      <p.icon size={16} /> {p.label}
    </button>
  );
}

const Check = (p: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex h-7 items-center gap-1.5 px-1 text-xs" onMouseDown={keepFocus}>
    <input type="checkbox" checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} /> {p.label}
  </label>
);

export function ViewTab({ v }: { v: ViewControls }) {
  return (
    <>
      <Group label="Views">
        <Big icon={BookOpen} label={"Read\nMode"} active={v.mode === "read"} onClick={() => v.onMode("read")} />
        <Big icon={FileText} label={"Print\nLayout"} active={v.mode === "print"} onClick={() => v.onMode("print")} />
        <Big icon={Globe} label={"Web\nLayout"} active={v.mode === "web"} onClick={() => v.onMode("web")} />
        <Stack>
          <Small icon={ListTree} label="Outline" active={v.mode === "outline"} onClick={() => v.onMode("outline")} />
          <Small icon={Rows3} label="Draft" active={v.mode === "draft"} onClick={() => v.onMode("draft")} />
        </Stack>
      </Group>
      <Group label="Immersive">
        <Big icon={Focus} label="Focus" title="Focus: only the page (Esc to come back)" onClick={() => v.onFocus(true)} />
        <Big icon={ScanLine} label={"Immersive\nReader"} active={v.immersive} onClick={() => v.onImmersive(!v.immersive)} />
      </Group>
      <Group label="Show">
        <Stack>
          <Check label="Ruler" checked={v.ruler} onChange={v.onRuler} />
          <Check label="Gridlines" checked={v.gridlines} onChange={v.onGridlines} />
          <Check label="Navigation Pane" checked={v.nav} onChange={v.onNav} />
        </Stack>
      </Group>
      <Group label="Zoom">
        <MenuButton big arrow={false} icon={ZoomIn} label="Zoom" menu={(close) => <ZoomForm v={v} onDone={close} />} />
        <Big icon={Search} label="100%" onClick={() => v.onZoom(100)} />
        <Stack>
          <Small icon={NotebookText} label="One Page" onClick={() => v.onFit("page")} />
          <Small icon={ChevronsLeft} label="Page Width" onClick={() => v.onFit("width")} />
        </Stack>
      </Group>
      <Group label="Dark Mode">
        <Big icon={v.dark ? Sun : Moon} label={"Switch\nModes"} title={v.dark ? "Show a light page" : "Show a dark page (Dark Mode)"} active={v.dark} onClick={() => v.onDark(!v.dark)} />
      </Group>
    </>
  );
}

function ZoomForm({ v, onDone }: { v: ViewControls; onDone: () => void }) {
  const [percent, setPercent] = useState(v.zoom);
  const [fit, setFit] = useState<"page" | "width" | "text" | null>(null);
  return (
    <Form
      title="Zoom"
      ok={percent >= 10 && percent <= 500}
      problem="Zoom goes from 10% to 500%."
      cancel="Cancel"
      onCancel={onDone}
      onApply={() => {
        onDone();
        if (fit) v.onFit(fit);
        else v.onZoom(Math.round(percent));
      }}
    >
      <Heading>Zoom to</Heading>
      <div className="grid grid-cols-2 gap-1.5 text-sm">
        {[200, 100, 75].map((z) => (
          <label key={z} className="flex items-center gap-1.5">
            <input type="radio" checked={!fit && percent === z} onChange={() => (setFit(null), setPercent(z))} /> {z}%
          </label>
        ))}
        {(
          [
            ["width", "Page width"],
            ["text", "Text width"],
            ["page", "Whole page"],
          ] as const
        ).map(([id, name]) => (
          <label key={id} className="flex items-center gap-1.5">
            <input type="radio" checked={fit === id} onChange={() => setFit(id)} /> {name}
          </label>
        ))}
      </div>
      <label className="flex items-center justify-between gap-2 text-sm">
        Percent
        <span className="flex items-center gap-1">
          <input type="number" min={10} max={500} value={percent} onChange={(e) => (setFit(null), setPercent(Number(e.target.value)))} className="w-20 rounded border border-slate-300 px-1.5 py-0.5" />%
        </span>
      </label>
    </Form>
  );
}

// ---- Outlining (Outline view) ----

export function OutliningTab({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const outline = outlineOf(editor.state);
  const level = editor.isActive("heading") ? (editor.getAttributes("heading").level as number) : BODY_LEVEL;
  return (
    <>
      <Group label="Outline Tools">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-0.5">
            <Nav icon={ChevronsLeft} label="Promote to Heading 1" onClick={() => promoteToTop(editor)} />
            <Nav icon={ChevronLeft} label="Promote (Alt+Shift+Left)" onClick={() => promote(editor)} />
            <select
              aria-label="Outline level"
              value={level}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n === BODY_LEVEL) editor.chain().focus().setParagraph().run();
                else editor.chain().focus().setHeading({ level: n as 1 | 2 | 3 }).run();
              }}
              className="h-6 rounded border border-slate-300 bg-surface px-1 text-xs"
            >
              <option value={1}>Level 1</option>
              <option value={2}>Level 2</option>
              <option value={3}>Level 3</option>
              <option value={BODY_LEVEL}>Body Text</option>
            </select>
            <Nav icon={ChevronRight} label="Demote (Alt+Shift+Right)" onClick={() => demote(editor)} />
            <Nav icon={ChevronsRight} label="Demote to Body Text" onClick={() => demoteToBody(editor)} />
          </div>
          <div className="flex items-center gap-0.5">
            <Nav icon={ArrowUp} label="Move Up (Alt+Shift+Up)" onClick={() => move(editor, true)} />
            <Nav icon={ArrowDown} label="Move Down (Alt+Shift+Down)" onClick={() => move(editor, false)} />
            <Nav icon={PlusIcon} label="Expand All" onClick={() => collapseAll(editor, false)} />
            <Nav icon={Minus} label="Collapse All" onClick={() => collapseAll(editor, true)} />
          </div>
        </div>
        <Stack>
          <label className="flex h-7 items-center gap-1 px-1 text-xs">
            Show Level:
            <select
              value={outline.level}
              onChange={(e) => setOutline(editor, { level: Number(e.target.value) })}
              className="rounded border border-slate-300 bg-surface px-1 py-0.5 text-xs"
            >
              <option value={1}>Level 1</option>
              <option value={2}>Level 2</option>
              <option value={3}>Level 3</option>
              <option value={BODY_LEVEL}>All Levels</option>
            </select>
          </label>
          <Check label="Show First Line Only" checked={outline.firstLineOnly} onChange={(firstLineOnly) => setOutline(editor, { firstLineOnly })} />
        </Stack>
      </Group>
      <Group label="Close">
        <Big icon={X} label={"Close\nOutline View"} danger onClick={onClose} />
      </Group>
    </>
  );
}

const PlusIcon = ({ size = 16 }: { size?: number }) => (
  <svg aria-hidden width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M8 3v10M3 8h10" />
  </svg>
);

const Nav = (p: { icon: LucideIcon | typeof PlusIcon; label: string; onClick: () => void }) => (
  <button type="button" title={p.label} aria-label={p.label} onMouseDown={keepFocus} onClick={p.onClick} className="flex h-6 w-6 items-center justify-center rounded hover:bg-slate-200/70">
    <p.icon size={15} />
  </button>
);

// ---- Immersive Reader ----

export function ImmersiveTab({ v }: { v: ViewControls }) {
  return (
    <>
      <Group label="Immersive Reader">
        <MenuButton
          big
          icon={PanelLeft}
          label={"Column\nWidth"}
          menu={(close) => (
            <>
              {(
                [
                  ["narrow", "Very Narrow"],
                  ["moderate", "Moderate"],
                  ["wide", "Wide"],
                  ["full", "Very Wide"],
                ] as [ColumnWidth, string][]
              ).map(([c, name]) => (
                <MenuItem key={c} label={name} checked={v.column === c} onClick={() => (close(), v.onColumn(c))} />
              ))}
            </>
          )}
        />
        <MenuButton
          big
          icon={Grid3x3}
          label={"Page\nColor"}
          menu={(close) => (
            <>
              {(
                [
                  ["none", "None"],
                  ["sepia", "Sepia"],
                  ["inverse", "Inverse"],
                ] as [PageTint, string][]
              ).map(([t, name]) => (
                <MenuItem key={t} label={name} checked={v.tint === t} onClick={() => (close(), v.onTint(t))} />
              ))}
            </>
          )}
        />
        <MenuButton
          big
          icon={RulerIcon}
          label={"Line\nFocus"}
          menu={(close) => (
            <>
              {[0, 1, 3, 5].map((n) => (
                <MenuItem key={n} label={n ? `${n === 1 ? "One" : n === 3 ? "Three" : "Five"} Line${n > 1 ? "s" : ""}` : "None"} checked={v.lineFocus === n} onClick={() => (close(), v.onLineFocus(n))} />
              ))}
            </>
          )}
        />
        <Big icon={Rows3} label={"Text\nSpacing"} active={v.spacing} onClick={() => v.onSpacing(!v.spacing)} />
        <Big icon={Volume2} label={"Read\nAloud"} active={v.readAloud} onClick={() => v.onReadAloud(!v.readAloud)} />
      </Group>
      <Group label="Close">
        <Big icon={X} label={"Close Immersive\nReader"} danger onClick={() => v.onImmersive(false)} />
      </Group>
    </>
  );
}
