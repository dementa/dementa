"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export interface PropertiesInfo {
  /** Name shown in the title bar ("Files Properties") and next to the icon. */
  name: string;
  icon: ReactNode;
  /** Label/value pairs; "divider" draws a line between groups, like other operating systems. */
  rows: ([string, ReactNode] | "divider")[];
  /** Optional main action, e.g. Open. */
  action?: { label: string; onClick: () => void };
}

/** A "Properties" window: icon, name and details, closed with OK, × or Escape. */
export function PropertiesDialog({ info, onClose }: { info: PropertiesInfo; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9400] flex items-center justify-center bg-black/20 p-4" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-label={`${info.name} Properties`}
        className="menu-pop flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-lg bg-surface text-slate-800 shadow-2xl ring-1 ring-black/20 dark:ring-white/15"
        onPointerDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className="flex h-10 shrink-0 items-center border-b border-black/10 pl-4 text-xs dark:border-white/10">
          <span className="flex-1 truncate">{info.name} Properties</span>
          <button aria-label="Close" onClick={onClose} className="flex h-full w-12 items-center justify-center hover:bg-red-600 hover:text-white">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          <div className="mb-4 flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center">{info.icon}</span>
            <span className="min-w-0 flex-1 truncate rounded border border-slate-200 px-2 py-1 text-sm select-text">{info.name}</span>
          </div>
          <dl className="space-y-2 text-sm">
            {info.rows.map((row, i) =>
              row === "divider" ? (
                <hr key={i} className="border-slate-200" />
              ) : (
                <div key={i} className="flex gap-3">
                  <dt className="w-28 shrink-0 text-slate-500">{row[0]}:</dt>
                  <dd className="min-w-0 flex-1 break-words select-text">{row[1]}</dd>
                </div>
              ),
            )}
          </dl>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
          {info.action && (
            <button
              onClick={() => {
                onClose();
                info.action!.onClick();
              }}
              className="rounded-md border border-slate-200 bg-surface px-4 py-1.5 text-sm hover:bg-slate-100"
            >
              {info.action.label}
            </button>
          )}
          <button autoFocus onClick={onClose} className="rounded-md bg-blue-600 px-5 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
