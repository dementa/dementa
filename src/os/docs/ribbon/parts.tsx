"use client";

// Building blocks shared by the ribbon tabs.

import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";

/** A Lucide icon, or a home-made one that takes a size the same way. */
export type IconType = LucideIcon | ComponentType<{ size?: number }>;

/** Keeps the cursor (and selection) in the document while clicking the ribbon. */
export const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

/** A small pop-up under a ribbon button; closes on Escape or a click elsewhere. */
export function Drop({ open, onClose, children, align = "left" }: { open: boolean; onClose: () => void; children: ReactNode; align?: "left" | "right" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: globalThis.MouseEvent) => {
      // Clicks on the button that opened it are handled by the button itself.
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    const key = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      // Tall menus scroll instead of running off the bottom of a small window.
      className={`menu-pop absolute top-full z-30 mt-1 max-h-[calc(100vh-12rem)] w-max overflow-y-auto rounded-lg bg-surface p-1.5 text-slate-800 shadow-xl ring-1 ring-black/10 ${
        align === "left" ? "left-0" : "right-0"
      }`}
    >
      {children}
    </div>
  );
}

/**
 * A set of related tools with its name underneath, like "Font" or "Paragraph". `more` is Word's
 * small ↘ button in the corner, which opens all of the group's settings at once.
 */
export function Group({ label, children, more }: { label: string; children: ReactNode; more?: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <div role="group" aria-label={label} className="relative flex shrink-0 flex-col items-center justify-between gap-1 px-1.5">
      <div className="flex flex-1 items-center gap-1">{children}</div>
      <span className="flex w-full items-center justify-center text-[11px] leading-none text-slate-500">
        {label}
        {more && (
          <button
            type="button"
            title={`${label} Settings`}
            aria-label={`${label} Settings`}
            aria-expanded={open}
            onMouseDown={keepFocus}
            onClick={() => setOpen((o) => !o)}
            className="absolute right-0 bottom-0 flex h-3.5 w-3.5 items-center justify-center rounded hover:bg-slate-200"
          >
            <svg aria-hidden width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M0.5 0.5h4M0.5 0.5v4M2 2l5.5 5.5M7.5 3.5v4h-4" />
            </svg>
          </button>
        )}
      </span>
      {more && (
        <Drop open={open} onClose={close} align="right">
          {more(close)}
        </Drop>
      )}
    </div>
  );
}

/** Tools stacked in rows inside a group. */
export const Stack = ({ children }: { children: ReactNode }) => <div className="flex flex-col gap-1">{children}</div>;

export const Row = ({ children }: { children: ReactNode }) => <div className="flex items-center gap-0.5">{children}</div>;

export const Divider = () => <span className="my-1 w-px shrink-0 self-stretch bg-slate-200" />;

const toolClass = (active?: boolean) =>
  `relative flex h-7 items-center justify-center rounded disabled:opacity-35 ${
    active ? "bg-blue-100 text-blue-800 ring-1 ring-blue-300" : "hover:bg-slate-200/70"
  }`;

interface ToolProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  /** Draws a colour bar under the icon (text colour, highlight, shading). */
  colour?: string;
}

/** Small icon button. */
export function Tool(p: ToolProps) {
  return (
    <button
      type="button"
      title={p.label}
      aria-label={p.label}
      aria-pressed={p.active}
      disabled={p.disabled}
      onMouseDown={keepFocus}
      onClick={p.onClick}
      className={`${toolClass(p.active)} w-7`}
    >
      <p.icon size={16} />
      {p.colour !== undefined && <ColourBar colour={p.colour} />}
    </button>
  );
}

const ColourBar = ({ colour }: { colour: string }) => (
  <span className="absolute right-1 bottom-0.5 left-1 h-[3px] rounded-sm" style={{ background: colour || "currentColor" }} />
);

/**
 * Button with a ▾ next to it: the button does the usual thing, the arrow opens a menu of
 * choices (like Word's bullets, highlight and colour buttons).
 */
export function Split(p: ToolProps & { menu: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <span className="relative flex">
      <button
        type="button"
        title={p.label}
        aria-label={p.label}
        aria-pressed={p.active}
        disabled={p.disabled}
        onMouseDown={keepFocus}
        onClick={p.onClick}
        className={`${toolClass(p.active)} w-7 rounded-r-none`}
      >
        <p.icon size={16} />
        {p.colour !== undefined && <ColourBar colour={p.colour} />}
      </button>
      <button
        type="button"
        title={`${p.label} options`}
        aria-label={`${p.label} options`}
        aria-expanded={open}
        disabled={p.disabled}
        onMouseDown={keepFocus}
        onClick={() => setOpen((o) => !o)}
        className={`${toolClass(open)} w-3.5 rounded-l-none`}
      >
        <ChevronDown size={11} />
      </button>
      <Drop open={open} onClose={close}>
        {p.menu(close)}
      </Drop>
    </span>
  );
}

/** Button that only opens a menu (Change case, Line spacing, Editing…), or a small form. */
export function MenuButton(p: {
  icon: IconType;
  /** Big buttons can split their name over two lines with "\n", like Word's "Cover\nPage". */
  label: string;
  big?: boolean;
  /** Shows ▾ (the default). Word leaves it off buttons that open a form instead of a list. */
  arrow?: boolean;
  disabled?: boolean;
  /** Tooltip, when it should say more than the name. */
  title?: string;
  /** A small button with its name beside the icon, like Word's "Breaks ▾". */
  showLabel?: boolean;
  align?: "left" | "right";
  menu: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const arrow = p.arrow ?? true;
  return (
    <span className="relative flex">
      <button
        type="button"
        title={p.title ?? p.label.replace("\n", " ")}
        aria-label={p.big ? undefined : p.label}
        aria-expanded={open}
        disabled={p.disabled}
        onMouseDown={keepFocus}
        onClick={() => setOpen((o) => !o)}
        className={
          p.big
            ? `${bigClass(open)}`
            : `${toolClass(open)} gap-0.5 px-1`
        }
      >
        <p.icon size={p.big ? 24 : 16} />
        {p.big ? (
          <span className="whitespace-pre-line">
            {p.label}
            {arrow && <ChevronDown size={11} className="ml-0.5 inline-block align-middle" />}
          </span>
        ) : (
          <>
            {p.showLabel && <span className="pl-0.5 text-xs">{p.label}</span>}
            {arrow && <ChevronDown size={11} />}
          </>
        )}
      </button>
      <Drop open={open} onClose={close} align={p.align}>
        {p.menu(close)}
      </Drop>
    </span>
  );
}

const bigClass = (active?: boolean, danger?: boolean) =>
  `flex min-w-[52px] flex-col items-center justify-start gap-0.5 self-stretch rounded px-1.5 py-1 text-center text-xs leading-tight disabled:opacity-35 ${
    active ? "bg-blue-100 text-blue-800" : danger ? "text-red-600 hover:bg-red-50" : "hover:bg-slate-200/70"
  }`;

/** Larger button with its name underneath ("\n" splits the name over two lines). */
export function Big(p: { icon: IconType; label: string; onClick: () => void; active?: boolean; disabled?: boolean; danger?: boolean; title?: string }) {
  return (
    <button
      type="button"
      title={p.title}
      aria-pressed={p.active}
      disabled={p.disabled}
      onMouseDown={keepFocus}
      onClick={p.onClick}
      className={bigClass(p.active, p.danger)}
    >
      <p.icon size={22} />
      <span className="whitespace-pre-line">{p.label}</span>
    </button>
  );
}

/** A line in a drop-down menu. */
export function MenuItem(p: { label: ReactNode; onClick: () => void; checked?: boolean; icon?: LucideIcon; hint?: string }) {
  return (
    <button
      type="button"
      onMouseDown={keepFocus}
      onClick={p.onClick}
      className="flex w-full min-w-40 items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
    >
      <span className="flex w-4 shrink-0 justify-center text-blue-700">{p.checked ? <Check size={14} /> : p.icon && <p.icon size={14} className="text-slate-600" />}</span>
      <span className="flex-1">{p.label}</span>
      {p.hint && <span className="text-xs text-slate-400">{p.hint}</span>}
    </button>
  );
}

export interface Swatch {
  name: string;
  value: string;
}

