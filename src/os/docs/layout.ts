// Page setup (the Layout tab): paper size, orientation and margins, saved with each document.

export type PageSize = "a4" | "letter";
export type Orientation = "portrait" | "landscape";
export type Margins = "narrow" | "normal" | "wide";

export interface PageLayout {
  size: PageSize;
  orientation: Orientation;
  margins: Margins;
}

export const DEFAULT_LAYOUT: PageLayout = { size: "a4", orientation: "portrait", margins: "normal" };

/** Paper sizes in screen pixels (96 per inch), portrait. */
export const PAGE_SIZES: Record<PageSize, { label: string; css: string; w: number; h: number }> = {
  a4: { label: "A4", css: "A4", w: 794, h: 1123 },
  letter: { label: "Letter", css: "letter", w: 816, h: 1056 },
};

export const MARGINS: Record<Margins, { label: string; px: number; css: string }> = {
  narrow: { label: "Narrow", px: 48, css: "0.5in" },
  normal: { label: "Normal", px: 96, css: "1in" },
  wide: { label: "Wide", px: 144, css: "1.5in" },
};

/** Width and minimum height of the page on screen. */
export function pageBox(layout: PageLayout) {
  const { w, h } = PAGE_SIZES[layout.size];
  return layout.orientation === "portrait" ? { w, h } : { w: h, h: w };
}

/** "a4 portrait normal" (how layouts are written into saved documents) → a layout, with defaults for anything unknown. */
export function parseLayout(value: unknown): PageLayout {
  const words = typeof value === "string" ? value.split(/\s+/) : [];
  const pick = <T extends string>(options: readonly T[], fallback: T) => (words.find((w) => options.includes(w as T)) as T) ?? fallback;
  return {
    size: pick(Object.keys(PAGE_SIZES) as PageSize[], DEFAULT_LAYOUT.size),
    orientation: pick(["portrait", "landscape"] as const, DEFAULT_LAYOUT.orientation),
    margins: pick(Object.keys(MARGINS) as Margins[], DEFAULT_LAYOUT.margins),
  };
}

export const layoutText = (l: PageLayout) => `${l.size} ${l.orientation} ${l.margins}`;

