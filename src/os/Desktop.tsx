"use client";

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { type AppDef, type AppId, type OSStyle } from "./apps";
import { AppTile } from "./common";

const PAD = 12;

export type IconSize = "small" | "medium" | "large";
export type IconSort = "default" | "name" | "type";

export interface DesktopView {
  iconSize: IconSize;
  /** Keep icons packed in sorted order; dragging can't leave gaps. */
  autoArrange: boolean;
  showIcons: boolean;
  sortBy: IconSort;
}

export const DEFAULT_DESKTOP_VIEW: DesktopView = { iconSize: "medium", autoArrange: false, showIcons: true, sortBy: "default" };

/** Grid space and icon picture size for each View option. */
const SIZES: Record<IconSize, { cellW: number; cellH: number; tile: number; text: string; width: string }> = {
  small: { cellW: 84, cellH: 76, tile: 36, text: "text-xs", width: "w-20" },
  medium: { cellW: 100, cellH: 96, tile: 52, text: "text-sm", width: "w-24" },
  large: { cellW: 128, cellH: 124, tile: 76, text: "text-sm", width: "w-[120px]" },
};

const KIND_ORDER = ["System", "Internet", "Office", "Tools"];

function sortApps(apps: AppDef[], by: IconSort): AppDef[] {
  const byName = (a: AppDef, b: AppDef) => a.name.localeCompare(b.name);
  if (by === "name") return [...apps].sort(byName);
  if (by === "type") return [...apps].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || byName(a, b));
  return apps;
}
/** How far the pointer must move before a press becomes a drag (so clicks still work). */
const DRAG_START = 5;

const STORAGE_KEY = "dementa-os:desktop-icons";

type Cell = { col: number; row: number };
type Layout = Partial<Record<AppId, Cell>>;

interface Props {
  apps: AppDef[];
  style: OSStyle;
  view: DesktopView;
  insets: { top: number; bottom: number };
  onOpen: (id: AppId) => void;
  /** Right-click on an icon (app) or on empty desktop (null). */
  onMenu: (e: MouseEvent, app: AppDef | null) => void;
}

// Positions are remembered per theme, because deMac lays icons out from the right.
function loadLayout(style: OSStyle): Layout {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")[style] ?? {};
  } catch {
    return {};
  }
}

function saveLayout(style: OSStyle, layout: Layout) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...all, [style]: layout }));
  } catch {
    // Storage blocked: icons still move, they just won't be remembered.
  }
}

/** Forgets moved icons so they go back to the default order (desktop menu → Arrange icons). */
export function resetDesktopLayout(style: OSStyle) {
  saveLayout(style, {});
}

/**
 * Gives every app a grid space: its saved one if it's still on screen and free, otherwise the
 * first free space, filling columns top to bottom (like a new desktop).
 */
function arrange(apps: AppDef[], saved: Layout, rows: number, cols: number): Record<AppId, Cell> {
  const taken = new Set<string>();
  const result = {} as Record<AppId, Cell>;
  const key = (c: Cell) => `${c.col}:${c.row}`;

  for (const app of apps) {
    const cell = saved[app.id];
    if (cell && cell.row < rows && cell.col < cols && !taken.has(key(cell))) {
      result[app.id] = cell;
      taken.add(key(cell));
    }
  }
  let next = 0;
  for (const app of apps) {
    if (result[app.id]) continue;
    let cell: Cell;
    do {
      cell = { col: Math.floor(next / rows), row: next % rows };
      next++;
    } while (taken.has(key(cell)));
    result[app.id] = cell;
    taken.add(key(cell));
  }
  return result;
}

export function DesktopIcons({ apps: allApps, style, view, insets, onOpen, onMenu }: Props) {
  const { cellW: CELL_W, cellH: CELL_H } = SIZES[view.iconSize];
  const apps = sortApps(allApps, view.sortBy);
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [saved, setSaved] = useState<Layout>({});
  const [selected, setSelected] = useState<AppId | null>(null);
  const [drag, setDrag] = useState<{ id: AppId; x: number; y: number } | null>(null);

  useEffect(() => setSaved(loadLayout(style)), [style]);

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rows = Math.max(1, Math.floor((size.height - PAD * 2) / CELL_H));
  const cols = Math.max(1, Math.floor((size.width - PAD * 2) / CELL_W));
  // With auto arrange on, icons always sit packed in sorted order.
  const layout = arrange(apps, view.autoArrange ? {} : saved, rows, cols);

  // deWindows fills from the left edge, deMac from the right edge.
  const xOf = (col: number) => (style === "mac" ? size.width - PAD - (col + 1) * CELL_W : PAD + col * CELL_W);
  const yOf = (row: number) => PAD + row * CELL_H;
  const cellAt = (x: number, y: number): Cell => {
    const col = style === "mac" ? (size.width - PAD - CELL_W - x) / CELL_W : (x - PAD) / CELL_W;
    return {
      col: Math.min(cols - 1, Math.max(0, Math.round(col))),
      row: Math.min(rows - 1, Math.max(0, Math.round((y - PAD) / CELL_H))),
    };
  };

  /** Drops an icon into a space; if another icon is there, the two swap. */
  function drop(id: AppId, target: Cell) {
    if (view.autoArrange) return; // snaps back into order
    const from = layout[id];
    const next: Layout = { ...layout };
    const other = (Object.keys(layout) as AppId[]).find(
      (k) => k !== id && layout[k].col === target.col && layout[k].row === target.row,
    );
    if (other) next[other] = from;
    next[id] = target;
    setSaved(next);
    saveLayout(style, next);
  }

  const target = drag ? cellAt(drag.x, drag.y) : null;

  return (
    <div
      ref={area}
      className="absolute inset-x-0"
      style={{ top: insets.top, bottom: insets.bottom }}
      onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}
      onContextMenu={(e) => onMenu(e, null)}
    >
      {size.width > 0 && view.showIcons && (
        <>
          {target && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute rounded-lg border-2 border-dashed border-white/50 bg-white/10"
              style={{ left: xOf(target.col), top: yOf(target.row), width: CELL_W - 4, height: CELL_H - 4 }}
            />
          )}
          {apps.map((app) => {
            const cell = layout[app.id];
            const dragging = drag?.id === app.id;
            return (
              <DesktopIcon
                key={app.id}
                app={app}
                size={view.iconSize}
                selected={selected === app.id}
                x={dragging ? drag.x : xOf(cell.col)}
                y={dragging ? drag.y : yOf(cell.row)}
                dragging={dragging}
                onSelect={() => setSelected(app.id)}
                onOpen={() => onOpen(app.id)}
                onMenu={(e) => {
                  setSelected(app.id);
                  onMenu(e, app);
                }}
                onDragMove={(x, y) => setDrag({ id: app.id, x, y })}
                onDragEnd={(x, y) => {
                  drop(app.id, cellAt(x, y));
                  setDrag(null);
                  setSelected(app.id);
                }}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

function DesktopIcon(props: {
  app: AppDef;
  size: IconSize;
  selected: boolean;
  x: number;
  y: number;
  dragging: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onMenu: (e: MouseEvent) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
}) {
  // Mouse users double-click like on a real computer; touch and pen users open with a single tap.
  const pointerType = useRef("mouse");
  const press = useRef<{ startX: number; startY: number; offX: number; offY: number; moved: boolean } | null>(null);
  /** A drag just ended: ignore the click the browser sends after it. */
  const justDragged = useRef(false);

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    pointerType.current = e.pointerType;
    if (e.button !== 0) return;
    press.current = { startX: e.clientX, startY: e.clientY, offX: e.clientX - props.x, offY: e.clientY - props.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    const p = press.current;
    if (!p) return;
    if (!p.moved && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < DRAG_START) return;
    p.moved = true;
    props.onDragMove(e.clientX - p.offX, e.clientY - p.offY);
  }

  function onPointerUp(e: PointerEvent<HTMLButtonElement>) {
    const p = press.current;
    press.current = null;
    if (p?.moved) {
      justDragged.current = true;
      props.onDragEnd(e.clientX - p.offX, e.clientY - p.offY);
    }
  }

  return (
    <button
      className={`absolute flex ${SIZES[props.size].width} touch-none flex-col items-center gap-1.5 rounded-lg p-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-white ${
        props.dragging ? "z-10 opacity-80" : "transition-[left,top] duration-150"
      } ${props.selected ? "bg-white/25 ring-1 ring-white/40" : "hover:bg-white/10"}`}
      style={{ left: props.x, top: props.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (press.current = null)}
      onClick={() => {
        if (justDragged.current) {
          justDragged.current = false;
          return;
        }
        if (pointerType.current === "mouse") props.onSelect();
        else props.onOpen();
      }}
      onDoubleClick={props.onOpen}
      onContextMenu={props.onMenu}
      onKeyDown={(e) => e.key === "Enter" && props.onOpen()}
    >
      <AppTile app={props.app} size={SIZES[props.size].tile} />
      <span className={`text-center ${SIZES[props.size].text} leading-tight font-medium [text-shadow:0_1px_3px_rgba(0,0,0,.8)]`}>{props.app.name}</span>
    </button>
  );
}
