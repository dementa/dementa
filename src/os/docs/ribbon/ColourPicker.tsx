"use client";

// Word's colour menu: theme colours with their lighter and darker shades, standard colours, recent
// colours, and More Colours… for any colour at all (a colour square, a hex code and an eyedropper).

import { ArrowLeft, Pipette } from "lucide-react";
import { useState } from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { currentPalette, tint } from "../design";
import { keepFocus, type Swatch } from "./parts";

/** The document's theme colours (Design › Colors), as Word lists them. */
function themeColours(): Swatch[] {
  const p = currentPalette();
  return [
    { name: "White, Background 1", value: "#ffffff" },
    { name: "Black, Text 1", value: "#000000" },
    { name: "Background 2", value: p.light2 },
    { name: "Text 2", value: p.dark2 },
    ...p.accents.map((value, i) => ({ name: `Accent ${i + 1}`, value })),
  ];
}

const STANDARD: Swatch[] = [
  { name: "Dark red", value: "#c00000" },
  { name: "Red", value: "#ff0000" },
  { name: "Orange", value: "#ffc000" },
  { name: "Yellow", value: "#ffff00" },
  { name: "Light green", value: "#92d050" },
  { name: "Green", value: "#00b050" },
  { name: "Light blue", value: "#00b0f0" },
  { name: "Blue", value: "#0070c0" },
  { name: "Dark blue", value: "#002060" },
  { name: "Purple", value: "#7030a0" },
];

const RECENT_KEY = "dementa-os:recent-colours";
const MAX_RECENT = 10;

/** "#abc", "rgb(1, 2, 3)" or "#AABBCC" → "#aabbcc"; null when it isn't a colour we can read. */
export function toHex(colour: string | null | undefined): string | null {
  if (!colour) return null;
  const c = colour.trim().toLowerCase();
  const short = c.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  const rgb = c.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgb) return `#${rgb.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("")}`;
  return null;
}

/** Word's five shades under each theme colour (white only gets darker, black only lighter). */
function shades(base: Swatch): Swatch[] {
  const steps =
    base.value === "#ffffff"
      ? [-0.05, -0.15, -0.25, -0.35, -0.5]
      : base.value === "#000000"
        ? [0.5, 0.35, 0.25, 0.15, 0.05]
        : [0.8, 0.6, 0.4, -0.25, -0.5];
  return steps.map((s) => ({
    name: `${base.name}, ${s > 0 ? "lighter" : "darker"} ${Math.round(Math.abs(s) * 100)}%`,
    value: tint(base.value, s),
  }));
}

function readRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((c) => typeof c === "string" && toHex(c)).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function remember(colour: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([colour, ...readRecent().filter((c) => c !== colour)].slice(0, MAX_RECENT)));
  } catch {
    // Storage can be blocked; recent colours just aren't kept.
  }
}

interface EyeDropperResult {
  sRGBHex: string;
}
declare global {
  interface Window {
    EyeDropper?: new () => { open: () => Promise<EyeDropperResult> };
  }
}

export function ColourPicker(p: {
  current?: string | null;
  /** "Automatic" for text, "No colour" for highlight and shading. */
  noneLabel: string;
  /** A row of suggested colours above the theme, e.g. the highlighter pens. */
  featured?: { title: string; colours: Swatch[] };
  onPick: (value: string | null) => void;
}) {
  const current = toHex(p.current);
  const [more, setMore] = useState(false);
  const [custom, setCustom] = useState(current ?? "#4472c4");
  const [recent] = useState(readRecent);
  const theme = themeColours();

  function pick(value: string) {
    remember(value);
    p.onPick(value);
  }

  async function eyedropper() {
    if (!window.EyeDropper) return;
    try {
      const result = await new window.EyeDropper().open();
      setCustom(toHex(result.sRGBHex) ?? custom);
    } catch {
      // Pressing Escape cancels the eyedropper.
    }
  }

  if (more) {
    return (
      <div className="flex w-56 flex-col gap-2 p-1">
        <button
          onMouseDown={keepFocus}
          onClick={() => setMore(false)}
          className="flex items-center gap-1 self-start rounded px-1 py-0.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          <ArrowLeft size={14} /> Colours
        </button>
        <HexColorPicker color={custom} onChange={setCustom} className="docs-colour-picker" />
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center rounded-md border border-slate-300 px-2 py-1 text-sm focus-within:border-blue-500">
            <span className="text-slate-400">#</span>
            <HexColorInput color={custom} onChange={setCustom} aria-label="Hex colour code" className="w-full min-w-0 bg-transparent uppercase outline-none select-text" />
          </label>
          {typeof window !== "undefined" && window.EyeDropper && (
            <button
              title="Pick a colour from the screen"
              aria-label="Pick a colour from the screen"
              onMouseDown={keepFocus}
              onClick={eyedropper}
              className="rounded-md border border-slate-300 p-1.5 hover:bg-slate-100"
            >
              <Pipette size={15} />
            </button>
          )}
        </div>
        <div className="flex overflow-hidden rounded-md text-center text-[11px] ring-1 ring-black/10">
          <span className="flex-1 py-2" style={{ background: custom, color: readableOn(custom) }}>
            New
          </span>
          <span className="flex-1 py-2" style={{ background: current ?? "transparent", color: current ? readableOn(current) : undefined }}>
            Current
          </span>
        </div>
        <button
          onMouseDown={keepFocus}
          onClick={() => pick(custom)}
          className="rounded-lg bg-blue-600 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          OK
        </button>
      </div>
    );
  }

  const row = (colours: Swatch[]) => (
    <div className="grid grid-cols-[repeat(10,1.125rem)] gap-1">
      {colours.map((c, i) => (
        <SwatchButton key={`${c.value}-${i}`} swatch={c} selected={current === c.value} onPick={pick} />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5 p-1">
      <button
        onMouseDown={keepFocus}
        onClick={() => p.onPick(null)}
        className="rounded px-2 py-1 text-left text-sm hover:bg-slate-100"
      >
        {p.noneLabel}
      </button>
      {p.featured && (
        <>
          <Heading>{p.featured.title}</Heading>
          {row(p.featured.colours)}
        </>
      )}
      <Heading>Theme Colours</Heading>
      {row(theme)}
      {/* The shades go in columns under their colour, as in Word. */}
      <div className="grid grid-cols-[repeat(10,1.125rem)] gap-x-1">
        {theme.map((base, i) => (
          <div key={i} className="flex flex-col">
            {shades(base).map((s) => (
              <SwatchButton key={s.value} swatch={s} selected={current === s.value} onPick={pick} flat />
            ))}
          </div>
        ))}
      </div>
      <Heading>Standard Colours</Heading>
      {row(STANDARD)}
      {recent.length > 0 && (
        <>
          <Heading>Recent Colours</Heading>
          {row(recent.map((value) => ({ name: value.toUpperCase(), value })))}
        </>
      )}
      <span className="my-0.5 h-px bg-slate-200" />
      <button
        onMouseDown={keepFocus}
        onClick={() => setMore(true)}
        className="flex items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-slate-100"
      >
        <span className="h-3.5 w-3.5 rounded-full" style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }} />
        More Colours…
      </button>
    </div>
  );
}

function Heading({ children }: { children: string }) {
  return <p className="px-0.5 pt-0.5 text-[11px] font-semibold text-slate-500">{children}</p>;
}

function SwatchButton({ swatch, selected, onPick, flat }: { swatch: Swatch; selected: boolean; onPick: (v: string) => void; flat?: boolean }) {
  return (
    <button
      title={swatch.name}
      aria-label={swatch.name}
      onMouseDown={keepFocus}
      onClick={() => onPick(swatch.value)}
      className={`h-[1.125rem] w-[1.125rem] ring-inset hover:z-10 hover:ring-2 hover:ring-orange-400 ${
        flat ? "" : "ring-1 ring-black/15"
      } ${selected ? "z-10 ring-2 ring-blue-600" : ""}`}
      style={{ background: swatch.value }}
    />
  );
}

/** Black or white, whichever is easier to read on this colour. */
function readableOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#000" : "#fff";
}
