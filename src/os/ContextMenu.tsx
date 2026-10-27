"use client";

import { Check, ChevronRight, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";

export type MenuEntry =
  | {
      label: string;
      icon?: LucideIcon;
      onSelect: () => void;
      disabled?: boolean;
      danger?: boolean;
      /** Shown on the right, e.g. "Alt+F4". */
      hint?: string;
      /** Shows a tick: the current choice (e.g. "Medium icons"). */
      checked?: boolean;
    }
  | {
      label: string;
      icon?: LucideIcon;
      /** Opens a second menu to the side (e.g. View ▸, Sort by ▸). */
      submenu: MenuEntry[];
      disabled?: boolean;
    }
  | "divider";

export interface OpenMenu {
  x: number;
  y: number;
  items: MenuEntry[];
}

const SUBMENU_WIDTH = 216;

/** Turns a right-click into an open menu at the pointer (and stops the browser's own menu). */
export function menuAt(e: MouseEvent, items: MenuEntry[]): OpenMenu {
  e.preventDefault();
  e.stopPropagation();
  return { x: e.clientX, y: e.clientY, items };
}

/** The right-click menu used across Dementa OS. Closes on choosing, clicking elsewhere or Escape. */
export function ContextMenu({ menu, onClose }: { menu: OpenMenu; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y });
  const [subOnLeft, setSubOnLeft] = useState(false);

  // Keep the whole menu on screen (open up/left when near the bottom/right edge).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = menu.x + width > window.innerWidth - 4 ? Math.max(4, menu.x - width) : menu.x;
    setPos({ left, top: menu.y + height > window.innerHeight - 4 ? Math.max(4, menu.y - height) : menu.y });
    setSubOnLeft(left + width + SUBMENU_WIDTH > window.innerWidth - 4);
  }, [menu]);

  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "pointerdown" && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="fixed z-[9500]" style={pos} onContextMenu={(e) => e.preventDefault()}>
      <MenuPanel items={menu.items} onClose={onClose} subOnLeft={subOnLeft} />
    </div>
  );
}

function MenuPanel({ items, onClose, subOnLeft }: { items: MenuEntry[]; onClose: () => void; subOnLeft: boolean }) {
  const [openSub, setOpenSub] = useState<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [subTop, setSubTop] = useState(0);

  return (
    <div
      ref={panel}
      role="menu"
      className="menu-pop relative min-w-52 rounded-lg border border-black/10 bg-surface/95 p-1 text-[13px] text-slate-800 shadow-2xl backdrop-blur-xl dark:border-white/10"
    >
      {items.map((item, i) => {
        if (item === "divider") return <hr key={i} className="my-1 border-black/10 dark:border-white/10" />;
        const hasSub = "submenu" in item;
        const checked = !hasSub && item.checked;
        const Icon = checked ? Check : item.icon;
        return (
          <button
            key={i}
            role="menuitem"
            aria-haspopup={hasSub || undefined}
            aria-expanded={hasSub ? openSub === i : undefined}
            disabled={item.disabled}
            onMouseEnter={(e) => {
              if (!hasSub) return setOpenSub(null);
              const box = panel.current!.getBoundingClientRect();
              setSubTop(e.currentTarget.getBoundingClientRect().top - box.top - 4);
              setOpenSub(i);
            }}
            onClick={() => {
              // Hovering has usually opened it already: a click keeps it open.
              if (hasSub) return setOpenSub(i);
              onClose();
              item.onSelect();
            }}
            className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left disabled:text-slate-400 disabled:hover:bg-transparent ${
              !hasSub && item.danger ? "hover:bg-red-600 hover:text-white" : "hover:bg-blue-600 hover:text-white"
            } ${hasSub && openSub === i ? "bg-blue-600 text-white" : ""}`}
          >
            {Icon ? <Icon size={15} className={`shrink-0 ${checked ? "" : "opacity-80"}`} /> : <span className="w-[15px] shrink-0" />}
            <span className="flex-1">{item.label}</span>
            {hasSub ? <ChevronRight size={14} className="opacity-70" /> : item.hint && <span className="text-xs opacity-60">{item.hint}</span>}
          </button>
        );
      })}
      {openSub !== null && items[openSub] !== "divider" && "submenu" in (items[openSub] as object) && (
        <div className="absolute" style={{ top: subTop, ...(subOnLeft ? { right: "100%" } : { left: "100%" }), width: SUBMENU_WIDTH }}>
          <MenuPanel items={(items[openSub] as { submenu: MenuEntry[] }).submenu} onClose={onClose} subOnLeft={subOnLeft} />
        </div>
      )}
    </div>
  );
}
