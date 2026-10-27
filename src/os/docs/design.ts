// The Design tab: how the whole document looks, as in Word. A theme gives it colours and fonts (each
// can be changed on its own), a style set says how titles and headings look, paragraph spacing sets
// the space between paragraphs and lines, and the page background has a watermark, a page colour
// and page borders. Text formatted by hand keeps its own look, as in Word.

export interface Palette {
  id: string;
  name: string;
  /** Word's Text/Background Dark 2 and Light 2. */
  dark2: string;
  light2: string;
  /** Accent 1 to 6. */
  accents: string[];
}

export interface FontPair {
  id: string;
  name: string;
  /** "" is Docs' usual font. */
  heading: string;
  body: string;
}

export interface Theme {
  id: string;
  name: string;
  colors: string;
  fonts: string;
}

export interface Watermark {
  text: string;
  font: string;
  color: string;
  diagonal: boolean;
  /** Word's "Semitransparent". */
  faint: boolean;
}

export type BorderStyle = "solid" | "double" | "dotted" | "dashed";

export interface PageBorder {
  style: BorderStyle;
  /** In points. */
  width: number;
  color: string;
}

export interface DocDesign {
  theme: string;
  /** Word's theme effects: shadows and glows on shapes. */
  effects: string;
  colors: string;
  fonts: string;
  styleSet: string;
  spacing: string;
  watermark: Watermark | null;
  pageColor: string | null;
  pageBorder: PageBorder | null;
}

const palette = (id: string, name: string, dark2: string, light2: string, accents: string) => ({
  id,
  name,
  dark2,
  light2,
  accents: accents.split(" ").map((c) => `#${c}`),
});

/** Word's Colors menu (and its themes' own colours). */
export const PALETTES: Palette[] = [
  palette("office", "Office", "#44546a", "#e7e6e6", "4472c4 ed7d31 a5a5a5 ffc000 5b9bd5 70ad47"),
  palette("office2007", "Office 2007 - 2010", "#1f497d", "#eeece1", "4f81bd c0504d 9bbb59 8064a2 4bacc6 f79646"),
  palette("grayscale", "Grayscale", "#000000", "#f8f8f8", "dddddd b2b2b2 969696 808080 5f5f5f 4d4d4d"),
  palette("blue-warm", "Blue Warm", "#242852", "#accbf9", "4a66ac 629dd1 297fd5 7f8fa9 5aa2ae 9d90a0"),
  palette("blue", "Blue", "#17406d", "#dbeff9", "0f6fc6 009dd9 0bd0d9 10cf9b 7cca62 a5c249"),
  palette("blue-ii", "Blue II", "#335b74", "#dfe3e5", "1cade4 2683c6 27ced7 42ba97 3e8853 62a39f"),
  palette("green", "Green", "#455f51", "#e3ded1", "549e39 8ab833 c0cf3a 029676 4ab5c4 0989b1"),
  palette("yellow", "Yellow", "#39302a", "#e5dedb", "ffca08 f8931d ce8d3e ec7016 e64823 9c6a6a"),
  palette("orange", "Orange", "#637052", "#ccddea", "e48312 bd582c 865640 9b8357 c2bc80 94a088"),
  palette("red", "Red", "#323232", "#e5c243", "a5300f d55816 e19825 b19c7d 7f5f52 b27d49"),
  palette("red-violet", "Red Violet", "#454551", "#d8d9dc", "e32d91 c830cc 4ea6dc 4775e7 8971e1 d54773"),
  palette("violet", "Violet", "#373545", "#dcd8dc", "ad84c6 8784c7 5d739a 6997af 84acb6 6f8183"),
  palette("paper", "Paper", "#444d26", "#fefac9", "a5b592 f3a447 e7bc29 d092a7 9c85c0 809ec2"),
  palette("marquee", "Marquee", "#5e5e5e", "#dddddd", "418ab3 a6b727 f69200 838383 fec306 df5327"),
  palette("facet", "Facet", "#2c3c43", "#ebebeb", "90c226 54a021 e6b91e e76618 c42f1a 918655"),
  palette("ion", "Ion", "#1e5155", "#ebebeb", "b01513 ea6312 e6b729 6aac90 5f9c9d 9e5e9b"),
  palette("slice", "Slice", "#146194", "#dfe3e5", "052f61 a50e82 14967c 6a9e1f e87d37 c62324"),
  palette("organic", "Organic", "#212121", "#dadada", "83992a 3c9770 44709d a23c33 d97828 deb340"),
  palette("wisp", "Wisp", "#4e3b30", "#fbeec9", "a53010 de7e18 9f8351 728653 92aa4c 6aac91"),
  palette("basis", "Basis", "#212745", "#b4dcfa", "a6b727 df5327 fe9e00 418ab3 d7d447 818183"),
  palette("gallery", "Gallery", "#454545", "#d9d9d9", "b71e42 de478e bc72f0 795faf 586ea6 6892a0"),
];

/** Word's Fonts menu. */
export const FONT_PAIRS: FontPair[] = [
  { id: "docs", name: "Docs", heading: "", body: "" },
  { id: "office", name: "Office", heading: "Calibri Light", body: "Calibri" },
  { id: "office2007", name: "Office 2007 - 2010", heading: "Cambria", body: "Calibri" },
  { id: "calibri", name: "Calibri", heading: "Calibri", body: "Calibri" },
  { id: "arial", name: "Arial", heading: "Arial", body: "Arial" },
  { id: "corbel", name: "Corbel", heading: "Corbel", body: "Corbel" },
  { id: "candara", name: "Candara", heading: "Candara", body: "Candara" },
  { id: "franklin", name: "Franklin Gothic", heading: "Franklin Gothic Medium", body: "Franklin Gothic Book" },
  { id: "century-gothic", name: "Century Gothic", heading: "Century Gothic", body: "Century Gothic" },
  { id: "tw-cen", name: "Tw Cen MT", heading: "Tw Cen MT", body: "Tw Cen MT" },
  { id: "gill-sans", name: "Gill Sans MT", heading: "Gill Sans MT", body: "Gill Sans MT" },
  { id: "cambria", name: "Cambria", heading: "Cambria", body: "Cambria" },
  { id: "garamond", name: "Garamond", heading: "Garamond", body: "Garamond" },
  { id: "georgia", name: "Georgia", heading: "Georgia", body: "Georgia" },
  { id: "times", name: "Times New Roman", heading: "Times New Roman", body: "Times New Roman" },
  { id: "trebuchet", name: "Trebuchet MS", heading: "Trebuchet MS", body: "Trebuchet MS" },
  { id: "verdana", name: "Verdana", heading: "Verdana", body: "Verdana" },
];

/** Word's Themes menu: each is a set of colours and fonts. */
export const THEMES: Theme[] = [
  { id: "office", name: "Office", colors: "office", fonts: "office" },
  { id: "office2007", name: "Office 2007", colors: "office2007", fonts: "office2007" },
  { id: "basis", name: "Basis", colors: "basis", fonts: "corbel" },
  { id: "facet", name: "Facet", colors: "facet", fonts: "trebuchet" },
  { id: "gallery", name: "Gallery", colors: "gallery", fonts: "gill-sans" },
  { id: "integral", name: "Integral", colors: "blue-ii", fonts: "tw-cen" },
  { id: "ion", name: "Ion", colors: "ion", fonts: "century-gothic" },
  { id: "organic", name: "Organic", colors: "organic", fonts: "garamond" },
  { id: "retrospect", name: "Retrospect", colors: "orange", fonts: "office" },
  { id: "slice", name: "Slice", colors: "slice", fonts: "century-gothic" },
  { id: "wisp", name: "Wisp", colors: "wisp", fonts: "century-gothic" },
  { id: "paper", name: "Paper", colors: "paper", fonts: "georgia" },
];

/** Where a heading's colour comes from. */
export type Tone = "text" | "heading" | "dark" | "accent" | "accent2" | "muted" | "white" | "light";

/** How one kind of heading looks. Sizes are in ems of the body text. */
export interface Look {
  size: number;
  weight?: number;
  tone?: Tone;
  caps?: boolean;
  /** Letter spacing, in ems. */
  tracking?: number;
  italic?: boolean;
  center?: boolean;
  /** A line under it, or above and under it. */
  rule?: { at: "below" | "around"; width: number; tone: Tone };
  /** Shading behind it. */
  fill?: Tone;
}

export interface StyleSet {
  id: string;
  name: string;
  title: Look;
  subtitle: Look;
  h1: Look;
  h2: Look;
  h3: Look;
  /** Line spacing (a multiple) and space after paragraphs (points). */
  line: number;
  after: number;
}

const DOCS_HEADINGS = { h1: { size: 2, weight: 700 }, h2: { size: 1.5, weight: 700 }, h3: { size: 1.2, weight: 600 } };

/** Word's Document Formatting gallery. */
export const STYLE_SETS: StyleSet[] = [
  {
    id: "docs",
    name: "Docs",
    title: { size: 2.6, weight: 300 },
    subtitle: { size: 1.3, tone: "muted" },
    ...DOCS_HEADINGS,
    line: 1.6,
    after: 7.2,
  },
  {
    id: "word",
    name: "Word",
    title: { size: 2.33, weight: 300 },
    subtitle: { size: 0.92, tone: "muted", tracking: 0.04 },
    h1: { size: 1.33, weight: 400, tone: "heading" },
    h2: { size: 1.08, weight: 400, tone: "heading" },
    h3: { size: 1, weight: 400, tone: "dark" },
    line: 1.08,
    after: 8,
  },
  {
    id: "basic-elegant",
    name: "Basic (Elegant)",
    title: { size: 2.2, weight: 300, caps: true, tracking: 0.12, center: true },
    subtitle: { size: 1, caps: true, tracking: 0.12, tone: "muted", center: true },
    h1: { size: 1.2, weight: 400, caps: true, tracking: 0.1, tone: "heading" },
    h2: { size: 1, weight: 400, caps: true, tracking: 0.08 },
    h3: { size: 1, weight: 600, tracking: 0.05, tone: "muted" },
    line: 1.15,
    after: 10,
  },
  {
    id: "basic-simple",
    name: "Basic (Simple)",
    title: { size: 2.4, weight: 400, tone: "accent" },
    subtitle: { size: 1.1, tone: "muted" },
    h1: { size: 1.4, weight: 400, tone: "accent" },
    h2: { size: 1.15, weight: 400, tone: "accent" },
    h3: { size: 1, weight: 700, tone: "accent" },
    line: 1.15,
    after: 8,
  },
  {
    id: "basic-stylish",
    name: "Basic (Stylish)",
    title: { size: 2.4, weight: 700, rule: { at: "below", width: 3, tone: "accent" } },
    subtitle: { size: 1.1, italic: true, tone: "accent" },
    h1: { size: 1.4, weight: 700, tone: "accent" },
    h2: { size: 1.15, weight: 700 },
    h3: { size: 1, weight: 700, italic: true, tone: "muted" },
    line: 1.15,
    after: 8,
  },
  {
    id: "bw-capitalized",
    name: "Black & White (Capitalized)",
    title: { size: 2.2, weight: 700, caps: true, tone: "text" },
    subtitle: { size: 1.1, caps: true, tracking: 0.06, tone: "text" },
    h1: { size: 1.3, weight: 700, caps: true, tone: "text" },
    h2: { size: 1.1, weight: 700, caps: true, tone: "text" },
    h3: { size: 1, weight: 700, tone: "text" },
    line: 1.15,
    after: 8,
  },
  {
    id: "bw-classic",
    name: "Black & White (Classic)",
    title: { size: 2.4, weight: 700, center: true, tone: "text" },
    subtitle: { size: 1.2, italic: true, center: true, tone: "text" },
    h1: { size: 1.4, weight: 700, tone: "text" },
    h2: { size: 1.15, weight: 700, italic: true, tone: "text" },
    h3: { size: 1, weight: 700, tone: "text" },
    line: 1.15,
    after: 8,
  },
  {
    id: "casual",
    name: "Casual",
    title: { size: 2.6, weight: 700, tone: "accent2" },
    subtitle: { size: 1.2, tone: "accent" },
    h1: { size: 1.5, weight: 700, tone: "accent2" },
    h2: { size: 1.2, weight: 700, tone: "accent" },
    h3: { size: 1.05, weight: 700, tone: "dark" },
    line: 1.2,
    after: 10,
  },
  {
    id: "centered",
    name: "Centered",
    title: { size: 2.4, weight: 300, center: true, tone: "heading" },
    subtitle: { size: 1.1, center: true, tone: "muted" },
    h1: { size: 1.35, weight: 400, center: true, tone: "heading" },
    h2: { size: 1.1, weight: 400, center: true, tone: "heading" },
    h3: { size: 1, weight: 700, center: true },
    line: 1.15,
    after: 8,
  },
  {
    id: "lines-distinctive",
    name: "Lines (Distinctive)",
    title: { size: 2.4, weight: 400, rule: { at: "around", width: 3, tone: "accent" } },
    subtitle: { size: 1.1, tone: "muted" },
    h1: { size: 1.35, weight: 700, rule: { at: "below", width: 2, tone: "accent" } },
    h2: { size: 1.1, weight: 700, tone: "accent" },
    h3: { size: 1, weight: 700 },
    line: 1.15,
    after: 8,
  },
  {
    id: "lines-simple",
    name: "Lines (Simple)",
    title: { size: 2.33, weight: 300, rule: { at: "below", width: 1, tone: "heading" } },
    subtitle: { size: 1, tone: "muted" },
    h1: { size: 1.33, weight: 400, tone: "heading", rule: { at: "below", width: 1, tone: "heading" } },
    h2: { size: 1.08, weight: 400, tone: "heading" },
    h3: { size: 1, weight: 400, tone: "dark" },
    line: 1.08,
    after: 8,
  },
  {
    id: "minimalist",
    name: "Minimalist",
    title: { size: 2.2, weight: 200, tracking: 0.05, tone: "dark" },
    subtitle: { size: 1, weight: 300, tone: "muted" },
    h1: { size: 1.25, weight: 300, tracking: 0.03, tone: "dark" },
    h2: { size: 1.05, weight: 400, tone: "dark" },
    h3: { size: 1, weight: 400, italic: true, tone: "muted" },
    line: 1.3,
    after: 10,
  },
  {
    id: "shaded",
    name: "Shaded",
    title: { size: 2.4, weight: 700, tone: "heading" },
    subtitle: { size: 1.1, tone: "muted" },
    h1: { size: 1.3, weight: 700, tone: "white", fill: "accent" },
    h2: { size: 1.1, weight: 700, tone: "heading", fill: "light" },
    h3: { size: 1, weight: 700, tone: "heading" },
    line: 1.15,
    after: 8,
  },
];

/** Word's Effects menu: how shapes are shaded. */
export const EFFECTS: { id: string; name: string }[] = [
  { id: "office", name: "Office" },
  { id: "subtle", name: "Subtle Shadow" },
  { id: "top", name: "Top Shadow" },
  { id: "extreme", name: "Extreme Shadow" },
  { id: "glow", name: "Glow Edge" },
  { id: "inset", name: "Inset" },
  { id: "soft", name: "Soft Edges" },
];

/** A shadow under the shape's outline: how far it's moved, how blurred, and its colour. */
const shadow = (dx: number, dy: number, blur: number, colour: string, opacity: number) =>
  `<feGaussianBlur in="SourceAlpha" stdDeviation="${blur}"/><feOffset dx="${dx}" dy="${dy}" result="s"/><feFlood flood-color="${colour}" flood-opacity="${opacity}"/><feComposite in2="s" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>`;

/** An SVG filter that draws a theme effect, with id `id`; "" for none. Shapes in Docs and in Word files use the same one. */
export function effectFilter(effect: string, p: Palette, id: string) {
  const inner = {
    subtle: shadow(0, 2, 2, "#000", 0.3),
    top: shadow(0, -3, 2.5, "#000", 0.3),
    extreme: shadow(6, 6, 4, "#000", 0.45),
    glow: shadow(0, 0, 4, p.accents[0], 0.75),
    inset:
      '<feComponentTransfer in="SourceAlpha"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer><feGaussianBlur stdDeviation="3"/><feOffset dx="2" dy="2" result="s"/><feFlood flood-color="#000" flood-opacity="0.5"/><feComposite in2="s" operator="in"/><feComposite in2="SourceAlpha" operator="in"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode/></feMerge>',
    soft: '<feGaussianBlur in="SourceGraphic" stdDeviation="1.5"/>',
  }[effect];
  return inner ? `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">${inner}</filter>` : "";
}

/** A shape's SVG with the design's effect drawn into it. */
export function withEffect(svg: string, d: DocDesign) {
  const filter = effectFilter(d.effects, paletteOf(d), "fx");
  if (!filter) return svg;
  return svg.replace(/^(<svg[^>]*>)/, `$1<defs>${filter}</defs><g filter="url(#fx)">`).replace(/<\/svg>$/, "</g></svg>");
}

/** Word's Paragraph Spacing menu: line spacing (a multiple) and space after paragraphs (points). */
export const SPACINGS: { id: string; name: string; line?: number; after?: number }[] = [
  { id: "default", name: "Default" },
  { id: "none", name: "No Paragraph Space", line: 1, after: 0 },
  { id: "compact", name: "Compact", line: 1, after: 4 },
  { id: "tight", name: "Tight", line: 1.15, after: 6 },
  { id: "open", name: "Open", line: 1.15, after: 10 },
  { id: "relaxed", name: "Relaxed", line: 1.5, after: 6 },
  { id: "double", name: "Double", line: 2, after: 8 },
];

export const WATERMARKS: { group: string; text: string }[] = [
  { group: "Confidential", text: "CONFIDENTIAL" },
  { group: "Confidential", text: "DO NOT COPY" },
  { group: "Disclaimers", text: "DRAFT" },
  { group: "Disclaimers", text: "SAMPLE" },
  { group: "Urgent", text: "URGENT" },
  { group: "Urgent", text: "ASAP" },
];

export const DEFAULT_WATERMARK: Watermark = { text: "DRAFT", font: "Calibri", color: "#c0c0c0", diagonal: true, faint: true };

/** Docs' own look: the Office colours, its usual font, and plain headings. */
export const DEFAULT_DESIGN: DocDesign = {
  theme: "office",
  effects: "office",
  colors: "office",
  fonts: "docs",
  styleSet: "docs",
  spacing: "default",
  watermark: null,
  pageColor: null,
  pageBorder: null,
};

const byId = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id) ?? list[0];
export const paletteOf = (d: DocDesign) => byId(PALETTES, d.colors);
export const fontsOf = (d: DocDesign) => byId(FONT_PAIRS, d.fonts);
export const styleSetOf = (d: DocDesign) => byId(STYLE_SETS, d.styleSet);

/** Mixes a colour towards white (amount > 0) or black (amount < 0). */
export function tint(hex: string, amount: number) {
  const target = amount > 0 ? 255 : 0;
  const parts = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${parts.map((p) => Math.round(p + (target - p) * Math.abs(amount)).toString(16).padStart(2, "0")).join("")}`;
}

/** The colour a tone stands for in a palette. Word's headings are Accent 1, a quarter darker. */
export function toneColour(tone: Tone, p: Palette): string {
  switch (tone) {
    case "heading":
      return tint(p.accents[0], -0.25);
    case "dark":
      return p.dark2;
    case "accent":
      return p.accents[0];
    case "accent2":
      return p.accents[1];
    case "muted":
      return "#595959";
    case "white":
      return "#ffffff";
    case "light":
      return tint(p.accents[0], 0.8);
    case "text":
      return "#000000";
  }
}

const SERIF = /cambria|garamond|georgia|times|bookman/i;

/** A font name as CSS, with something close when it isn't on this computer. */
export const fontStack = (name: string) => (name ? `"${name}", ${SERIF.test(name) ? "serif" : "sans-serif"}` : "");

/** The line spacing and space after paragraphs in use. */
export function spacingOf(d: DocDesign) {
  const set = styleSetOf(d);
  const chosen = byId(SPACINGS, d.spacing);
  return { line: chosen.line ?? set.line, after: chosen.after ?? set.after };
}

/** The CSS for a look, for the elements `selector` picks out. */
function lookCss(selector: string, look: Look, p: Palette, font: string) {
  const css: string[] = [`font-size:${look.size}em`];
  if (font) css.push(`font-family:${font}`);
  if (look.weight) css.push(`font-weight:${look.weight}`);
  const colour = look.tone ? toneColour(look.tone, p) : null;
  if (colour) css.push(`color:${colour}`);
  if (look.caps) css.push("text-transform:uppercase");
  if (look.tracking) css.push(`letter-spacing:${look.tracking}em`);
  if (look.italic) css.push("font-style:italic");
  if (look.center) css.push("text-align:center");
  if (look.rule) {
    const line = `${look.rule.width}px solid ${toneColour(look.rule.tone, p)}`;
    css.push(`border-bottom:${line}`, "padding-bottom:0.15em");
    if (look.rule.at === "around") css.push(`border-top:${line}`, "padding-top:0.15em");
  }
  if (look.fill) css.push(`background:${toneColour(look.fill, p)}`, "padding:0.1em 0.3em");
  return `${selector}{${css.join(";")}}`;
}

/**
 * The document's look as CSS, for the text inside `scope`: in the editor, in a saved page, or in
 * a small preview. Docs' own font and spacing add nothing.
 */
export function designCss(d: DocDesign, scope: string) {
  const p = paletteOf(d);
  const fonts = fontsOf(d);
  const set = styleSetOf(d);
  const heading = fontStack(fonts.heading);
  const rules: string[] = [];
  const body: string[] = [];
  if (fonts.body) body.push(`font-family:${fontStack(fonts.body)}`);
  const { line, after } = spacingOf(d);
  const plain = set.id === "docs" && d.spacing === "default";
  if (!plain) body.push(`line-height:${line}`);
  if (body.length) rules.push(`${scope}{${body.join(";")}}`);
  if (!plain) rules.push(`${scope} p{margin-bottom:${after}pt}`);
  // Theme effects on shapes, drawn by the filter the page carries (DocsApp).
  if (effectFilter(d.effects, p, "x")) rules.push(`${scope} .docs-shape-drawing > svg{filter:url(#docs-effect)}`);
  rules.push(
    lookCss(`${scope} p[data-style="title"]`, set.title, p, heading),
    lookCss(`${scope} p[data-style="subtitle"]`, set.subtitle, p, ""),
    lookCss(`${scope} h1`, set.h1, p, heading),
    lookCss(`${scope} h2`, set.h2, p, heading),
    lookCss(`${scope} h3`, set.h3, p, heading),
  );
  return rules.join("\n");
}

const clean = (v: unknown, fallback: string, list?: { id: string }[]) =>
  typeof v === "string" && (!list || list.some((x) => x.id === v)) ? v : fallback;
const colour = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);

/** Anything read back from a document → a design. */
export function parseDesign(value: unknown): DocDesign {
  if (!value || typeof value !== "object") return DEFAULT_DESIGN;
  const v = value as Record<string, unknown>;
  const w = v.watermark as Record<string, unknown> | null | undefined;
  const b = v.pageBorder as Record<string, unknown> | null | undefined;
  return {
    theme: clean(v.theme, DEFAULT_DESIGN.theme, THEMES),
    effects: clean(v.effects, DEFAULT_DESIGN.effects, EFFECTS),
    colors: clean(v.colors, DEFAULT_DESIGN.colors, PALETTES),
    fonts: clean(v.fonts, DEFAULT_DESIGN.fonts, FONT_PAIRS),
    styleSet: clean(v.styleSet, DEFAULT_DESIGN.styleSet, STYLE_SETS),
    spacing: clean(v.spacing, DEFAULT_DESIGN.spacing, SPACINGS),
    watermark:
      w && typeof w === "object" && typeof w.text === "string" && w.text.trim()
        ? {
            text: w.text.slice(0, 60),
            font: clean(w.font, DEFAULT_WATERMARK.font),
            color: colour(w.color) ?? DEFAULT_WATERMARK.color,
            diagonal: w.diagonal !== false,
            faint: w.faint !== false,
          }
        : null,
    pageColor: colour(v.pageColor),
    pageBorder:
      b && typeof b === "object"
        ? {
            style: (["solid", "double", "dotted", "dashed"] as const).find((s) => s === b.style) ?? "solid",
            width: typeof b.width === "number" ? Math.min(6, Math.max(0.25, b.width)) : 1,
            color: colour(b.color) ?? "#000000",
          }
        : null,
  };
}

const DEFAULT_KEY = "dementa-os:docs-design";

/** Design › Set as Default: the look new documents start with. */
export function defaultDesign(): DocDesign {
  try {
    const saved = localStorage.getItem(DEFAULT_KEY);
    return saved ? { ...parseDesign(JSON.parse(saved)), watermark: null, pageColor: null, pageBorder: null } : DEFAULT_DESIGN;
  } catch {
    return DEFAULT_DESIGN;
  }
}

export function setDefaultDesign(d: DocDesign) {
  try {
    localStorage.setItem(DEFAULT_KEY, JSON.stringify(d));
  } catch {
    // Storage can be blocked; new documents keep Docs' own look.
  }
}

/** The colour picker's theme colours, which follow the document's colours as in Word. */
let themeSwatches: Palette = PALETTES[0];
export const setThemeSwatches = (p: Palette) => (themeSwatches = p);
export const currentPalette = () => themeSwatches;
