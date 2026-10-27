// Shapes from the Insert tab, drawn the way Word draws them: at the size they are on the page, so the
// outline keeps its thickness and the corners and arrow heads keep their shape however a shape is
// stretched. A shape is a picture in the document (so saved files show it anywhere) that also keeps
// its settings (data-shape): fill, outline, the text typed into it, and so on.

import { escapeXml, FONT, svgUrl, wrap } from "./graphics";

export type ShapeKind =
  | "line"
  | "arrowLine"
  | "rectangle"
  | "rounded"
  | "textBox"
  | "oval"
  | "triangle"
  | "rightTriangle"
  | "parallelogram"
  | "trapezoid"
  | "diamond"
  | "pentagon"
  | "hexagon"
  | "octagon"
  | "plus"
  | "star"
  | "heart"
  | "rightArrow"
  | "leftArrow"
  | "upArrow"
  | "downArrow"
  | "callout";

export type Dash = "solid" | "dash" | "dot";

export interface Shape {
  kind: ShapeKind;
  /** null: No Fill. */
  fill: string | null;
  /** null: No Outline. */
  outline: string | null;
  /** Outline thickness in points, like Word's Weight menu. */
  weight: number;
  dash: Dash;
  text: string;
  textColour: string;
  /** Points. */
  fontSize: number;
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
  valign: "top" | "middle" | "bottom";
  flipH: boolean;
  flipV: boolean;
}

export const SHAPE_GROUPS: { name: string; shapes: { kind: ShapeKind; name: string }[] }[] = [
  {
    name: "Lines",
    shapes: [
      { kind: "line", name: "Line" },
      { kind: "arrowLine", name: "Line Arrow" },
    ],
  },
  {
    name: "Rectangles",
    shapes: [
      { kind: "rectangle", name: "Rectangle" },
      { kind: "rounded", name: "Rectangle: Rounded Corners" },
    ],
  },
  {
    name: "Basic Shapes",
    shapes: [
      { kind: "textBox", name: "Text Box" },
      { kind: "oval", name: "Oval" },
      { kind: "triangle", name: "Isosceles Triangle" },
      { kind: "rightTriangle", name: "Right Triangle" },
      { kind: "parallelogram", name: "Parallelogram" },
      { kind: "trapezoid", name: "Trapezoid" },
      { kind: "diamond", name: "Diamond" },
      { kind: "pentagon", name: "Regular Pentagon" },
      { kind: "hexagon", name: "Hexagon" },
      { kind: "octagon", name: "Octagon" },
      { kind: "plus", name: "Cross" },
      { kind: "heart", name: "Heart" },
    ],
  },
  {
    name: "Block Arrows",
    shapes: [
      { kind: "rightArrow", name: "Arrow: Right" },
      { kind: "leftArrow", name: "Arrow: Left" },
      { kind: "upArrow", name: "Arrow: Up" },
      { kind: "downArrow", name: "Arrow: Down" },
    ],
  },
  { name: "Stars and Banners", shapes: [{ kind: "star", name: "Star: 5 Points" }] },
  { name: "Callouts", shapes: [{ kind: "callout", name: "Speech Bubble: Rectangle with Corners Rounded" }] },
];

const KINDS = new Set(SHAPE_GROUPS.flatMap((g) => g.shapes.map((s) => s.kind)));

export const shapeName = (kind: ShapeKind) => SHAPE_GROUPS.flatMap((g) => g.shapes).find((s) => s.kind === kind)?.name ?? "Shape";

export const isLine = (kind: ShapeKind) => kind === "line" || kind === "arrowLine";

/** Screen pixels to a point. */
export const PX_PER_PT = 96 / 72;

/** Room around a line inside its box, so it can be grabbed and its ends aren't cut off. */
export const LINE_PAD = 8;

/** Word's own shape colours (Office theme, Accent 1). */
export const SHAPE_FILL = "#4472c4";
export const SHAPE_OUTLINE = "#2f528f";

/** How a new shape looks, as in Word: blue with white text; text boxes white with black text. */
export function newShape(kind: ShapeKind): Shape {
  const shape: Shape = {
    kind,
    fill: SHAPE_FILL,
    outline: SHAPE_OUTLINE,
    weight: 1,
    dash: "solid",
    text: "",
    textColour: "#ffffff",
    fontSize: 11,
    bold: false,
    italic: false,
    align: "center",
    valign: "middle",
    flipH: false,
    flipV: false,
  };
  if (kind === "textBox") return { ...shape, fill: "#ffffff", outline: "#000000", weight: 0.75, textColour: "#000000", align: "left", valign: "top" };
  if (isLine(kind)) return { ...shape, fill: null, outline: SHAPE_FILL, weight: 1.5 };
  return shape;
}

const isColour = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** A shape's settings from a document, with anything missing or wrong put back to the usual. */
export function readShape(value: unknown): Shape | null {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (!KINDS.has(v.kind as ShapeKind)) return null;
  const base = newShape(v.kind as ShapeKind);
  const pick = <K extends keyof Shape>(key: K, ok: (x: unknown) => boolean): Shape[K] => (ok(v[key]) ? (v[key] as Shape[K]) : base[key]);
  const bool = (x: unknown) => typeof x === "boolean";
  return {
    kind: base.kind,
    fill: v.fill === null ? null : pick("fill", isColour),
    outline: v.outline === null ? null : pick("outline", isColour),
    weight: pick("weight", (x) => typeof x === "number" && x > 0 && x <= 20),
    dash: pick("dash", (x) => x === "solid" || x === "dash" || x === "dot"),
    text: pick("text", (x) => typeof x === "string").slice(0, 5000),
    textColour: pick("textColour", isColour),
    fontSize: pick("fontSize", (x) => typeof x === "number" && x >= 1 && x <= 400),
    bold: pick("bold", bool),
    italic: pick("italic", bool),
    align: pick("align", (x) => x === "left" || x === "center" || x === "right"),
    valign: pick("valign", (x) => x === "top" || x === "middle" || x === "bottom"),
    flipH: pick("flipH", bool),
    flipV: pick("flipV", bool),
  };
}

// ---- Drawing ----

const n = (x: number) => +x.toFixed(1);
const polygon = (points: [number, number][]) => `<polygon points="${points.map(([x, y]) => `${n(x)},${n(y)}`).join(" ")}"/>`;

/** Points given as fractions of the box. */
const scaled = (points: [number, number][], w: number, h: number) => polygon(points.map(([x, y]) => [x * w, y * h]));

/** A five-pointed star filling its box. */
function star(w: number, h: number) {
  const raw = Array.from({ length: 10 }, (_, i): [number, number] => {
    const a = (i / 10) * 2 * Math.PI - Math.PI / 2;
    const r = i % 2 ? 0.382 : 1;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return polygon(raw.map(([x, y]) => [((x - x0) / (x1 - x0)) * w, ((y - y0) / (y1 - y0)) * h]));
}

/** The outline of a shape that fills a w × h box. Sizes like corners and arrow heads follow the shorter side, as in Word. */
function geometry(kind: Exclude<ShapeKind, "line" | "arrowLine">, w: number, h: number): string {
  const ss = Math.min(w, h);
  switch (kind) {
    case "rectangle":
    case "textBox":
      return `<rect width="${n(w)}" height="${n(h)}"/>`;
    case "rounded":
      return `<rect width="${n(w)}" height="${n(h)}" rx="${n(ss * 0.1667)}"/>`;
    case "oval":
      return `<ellipse cx="${n(w / 2)}" cy="${n(h / 2)}" rx="${n(w / 2)}" ry="${n(h / 2)}"/>`;
    case "triangle":
      return polygon([[w / 2, 0], [w, h], [0, h]]);
    case "rightTriangle":
      return polygon([[0, 0], [w, h], [0, h]]);
    case "parallelogram": {
      const o = ss * 0.25;
      return polygon([[o, 0], [w, 0], [w - o, h], [0, h]]);
    }
    case "trapezoid": {
      const o = ss * 0.25;
      return polygon([[o, 0], [w - o, 0], [w, h], [0, h]]);
    }
    case "diamond":
      return polygon([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
    case "pentagon":
      return scaled([[0.5, 0], [1, 0.382], [0.809, 1], [0.191, 1], [0, 0.382]], w, h);
    case "hexagon": {
      const o = ss * 0.25;
      return polygon([[o, 0], [w - o, 0], [w, h / 2], [w - o, h], [o, h], [0, h / 2]]);
    }
    case "octagon": {
      const c = ss * 0.2929;
      return polygon([[c, 0], [w - c, 0], [w, c], [w, h - c], [w - c, h], [c, h], [0, h - c], [0, c]]);
    }
    case "plus": {
      const a = ss * 0.25;
      return polygon([[a, 0], [w - a, 0], [w - a, a], [w, a], [w, h - a], [w - a, h - a], [w - a, h], [a, h], [a, h - a], [0, h - a], [0, a], [a, a]]);
    }
    case "star":
      return star(w, h);
    case "heart": {
      const p = (x: number, y: number) => `${n(x * w)},${n(y * h)}`;
      return `<path d="M${p(0.5, 0.22)} C${p(0.5, 0.05)} ${p(0.32, 0)} ${p(0.2, 0.02)} C${p(0.05, 0.05)} ${p(0, 0.2)} ${p(0, 0.3)} C${p(0, 0.55)} ${p(0.25, 0.75)} ${p(0.5, 1)} C${p(0.75, 0.75)} ${p(1, 0.55)} ${p(1, 0.3)} C${p(1, 0.2)} ${p(0.95, 0.05)} ${p(0.8, 0.02)} C${p(0.68, 0)} ${p(0.5, 0.05)} ${p(0.5, 0.22)} Z"/>`;
    }
    case "rightArrow": {
      const hl = Math.min(w, ss * 0.5);
      return polygon([[0, h * 0.25], [w - hl, h * 0.25], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, h * 0.75], [0, h * 0.75]]);
    }
    case "leftArrow": {
      const hl = Math.min(w, ss * 0.5);
      return polygon([[w, h * 0.25], [hl, h * 0.25], [hl, 0], [0, h / 2], [hl, h], [hl, h * 0.75], [w, h * 0.75]]);
    }
    case "upArrow": {
      const hl = Math.min(h, ss * 0.5);
      return polygon([[w * 0.25, h], [w * 0.25, hl], [0, hl], [w / 2, 0], [w, hl], [w * 0.75, hl], [w * 0.75, h]]);
    }
    case "downArrow": {
      const hl = Math.min(h, ss * 0.5);
      return polygon([[w * 0.25, 0], [w * 0.25, h - hl], [0, h - hl], [w / 2, h], [w, h - hl], [w * 0.75, h - hl], [w * 0.75, 0]]);
    }
    case "callout": {
      const bh = h * 0.8;
      const r = Math.min(w, bh) * 0.15;
      return `<path d="M${n(r)} 0 H${n(w - r)} Q${n(w)} 0 ${n(w)} ${n(r)} V${n(bh - r)} Q${n(w)} ${n(bh)} ${n(w - r)} ${n(bh)} H${n(w * 0.42)} L${n(w * 0.2)} ${n(h)} L${n(w * 0.28)} ${n(bh)} H${n(r)} Q0 ${n(bh)} 0 ${n(bh - r)} V${n(r)} Q0 0 ${n(r)} 0 Z"/>`;
    }
  }
}

const dashArray = (dash: Dash, width: number) =>
  dash === "dash" ? ` stroke-dasharray="${n(Math.max(3, width * 4))} ${n(Math.max(2, width * 3))}"` : dash === "dot" ? ` stroke-dasharray="${n(Math.max(1, width))} ${n(Math.max(1.5, width))}"` : "";

/** Where a shape's text goes, as space kept clear inside each edge (Word's 0.1" and 0.05" margins). */
export function textInsets(shape: Shape, h: number) {
  return { top: 5, right: 10, bottom: 5 + (shape.kind === "callout" ? h * 0.2 : 0), left: 10 };
}

function svgText(shape: Shape, w: number, h: number) {
  const inset = textInsets(shape, h);
  const size = shape.fontSize * PX_PER_PT;
  const lineHeight = size * 1.2;
  const chars = Math.max(1, Math.floor((w - inset.left - inset.right) / (size * 0.55)));
  const room = Math.max(1, Math.floor((h - inset.top - inset.bottom) / lineHeight));
  const lines = shape.text
    .split("\n")
    .flatMap((para) => (para.trim() ? wrap(para, chars, 999) : [""]))
    .slice(0, room);
  const x = shape.align === "left" ? inset.left : shape.align === "right" ? w - inset.right : (inset.left + w - inset.right) / 2;
  const anchor = shape.align === "left" ? "start" : shape.align === "right" ? "end" : "middle";
  const first =
    shape.valign === "top"
      ? inset.top + lineHeight / 2
      : shape.valign === "bottom"
        ? h - inset.bottom - lineHeight / 2 - (lines.length - 1) * lineHeight
        : (inset.top + h - inset.bottom) / 2 - ((lines.length - 1) * lineHeight) / 2;
  const style = `${shape.bold ? ' font-weight="bold"' : ""}${shape.italic ? ' font-style="italic"' : ""}`;
  return lines
    .map(
      (line, i) =>
        `<text x="${n(x)}" y="${n(first + i * lineHeight)}" ${FONT} font-size="${n(size)}" fill="${shape.textColour}" text-anchor="${anchor}" dominant-baseline="central"${style} xml:space="preserve">${escapeXml(line)}</text>`,
    )
    .join("");
}

/** The shape drawn at w × h pixels; without its text for the editor, which shows the text itself so it can be typed in. */
export function shapeSvg(shape: Shape, w: number, h: number, withText = true): string {
  const width = shape.outline ? shape.weight * PX_PER_PT : 0;
  const stroke = shape.outline
    ? `stroke="${shape.outline}" stroke-width="${n(width)}"${dashArray(shape.dash, width)}`
    : `stroke="none"`;
  let body: string;
  if (isLine(shape.kind)) {
    // A line runs corner to corner of its box (less the padding); flipping picks which corners.
    let [x1, y1, x2, y2] = [LINE_PAD, LINE_PAD, w - LINE_PAD, h - LINE_PAD];
    if (shape.flipH) [x1, x2] = [x2, x1];
    if (shape.flipV) [y1, y2] = [y2, y1];
    let head = "";
    if (shape.kind === "arrowLine" && shape.outline) {
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len];
      const size = Math.min(len, Math.max(6, width * 3 + 4));
      const [bx, by] = [x2 - ux * size, y2 - uy * size];
      head = polygon([[x2, y2], [bx - uy * size * 0.5, by + ux * size * 0.5], [bx + uy * size * 0.5, by - ux * size * 0.5]]).replace(
        "<polygon",
        `<polygon fill="${shape.outline}" stroke="none"`,
      );
      [x2, y2] = [bx + ux * 0.5, by + uy * 0.5];
    }
    body = `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${stroke} stroke-linecap="${shape.dash === "dot" ? "round" : "butt"}"/>${head}`;
  } else {
    // The outline is centred on the edge, so the shape is drawn half its thickness in from the box.
    const inner = [Math.max(1, w - width), Math.max(1, h - width)] as const;
    const flip = `${shape.flipH ? ` translate(${n(inner[0])} 0) scale(-1 1)` : ""}${shape.flipV ? ` translate(0 ${n(inner[1])}) scale(1 -1)` : ""}`;
    body = `<g transform="translate(${n(width / 2)} ${n(width / 2)})${flip}" fill="${shape.fill ?? "none"}" ${stroke} stroke-linejoin="miter">${geometry(shape.kind as Exclude<ShapeKind, "line" | "arrowLine">, ...inner)}</g>`;
    if (withText && shape.text.trim()) body += svgText(shape, w, h);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}" overflow="visible">${body}</svg>`;
}

const pictures = new Map<string, string>();

/** The picture saved for a shape at its size (kept for a while, since it's asked for on every change to the document). */
export function shapePicture(shape: Shape, w: number, h: number): string {
  const key = `${w}x${h}${JSON.stringify(shape)}`;
  let url = pictures.get(key);
  if (!url) {
    url = svgUrl(shapeSvg(shape, w, h));
    if (pictures.size > 200) pictures.clear();
    pictures.set(key, url);
  }
  return url;
}

/** Small drawings for the Shapes menus. Lines go up to the right, like Word's. */
export function shapeIcon(kind: ShapeKind): string {
  const shape = { ...newShape(kind), weight: isLine(kind) ? 1.5 : 1, flipV: isLine(kind) };
  if (kind === "textBox") shape.text = "A";
  return shapePicture(shape, 28, isLine(kind) ? 28 : 22);
}

/** Default size when a shape is put in with a click instead of drawn: one inch, like Word. */
export const CLICK_SIZE = 96;

/** Asks a shape to start editing its text; the event's detail is the key typed (added to the text) or null. */
export const EDIT_SHAPE_TEXT = "docs-edit-shape-text";
