// Shapes and SmartArt for the Insert tab (charts are in charts.ts), drawn as SVG pictures so saved documents show
// them anywhere. Pictures can't run code, so the drawings are safe whatever text they hold.

/** Word's default shape colours. */
export const FILL = "#4472c4";
const OUTLINE = "#2f528f";
export const FONT = "font-family='Segoe UI, system-ui, sans-serif'";

export const escapeXml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** An SVG drawing as a picture address the editor can show. */
export function svgUrl(svg: string) {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

export const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

/** Splits text into lines of at most `chars` letters (roughly), keeping whole words. */
export function wrap(text: string, chars: number, maxLines: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + word).length > chars) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(1, chars - 1))}…`;
  }
  return lines.map((l) => (l.length > chars ? `${l.slice(0, chars - 1)}…` : l));
}

/** Centred lines of text around (x, y). */
function label(lines: string[], x: number, y: number, size: number, colour = "#fff") {
  const top = y - ((lines.length - 1) * size * 1.2) / 2;
  return lines
    .map(
      (l, i) =>
        `<text x="${x}" y="${top + i * size * 1.2}" ${FONT} font-size="${size}" fill="${colour}" text-anchor="middle" dominant-baseline="central">${escapeXml(l)}</text>`,
    )
    .join("");
}

// ---- Shapes ----

export type ShapeKind =
  | "line"
  | "arrowLine"
  | "rectangle"
  | "rounded"
  | "oval"
  | "triangle"
  | "diamond"
  | "pentagon"
  | "hexagon"
  | "star"
  | "heart"
  | "rightArrow"
  | "leftArrow"
  | "upArrow"
  | "downArrow"
  | "callout";

export const SHAPE_GROUPS: { name: string; shapes: { kind: ShapeKind; name: string }[] }[] = [
  {
    name: "Lines",
    shapes: [
      { kind: "line", name: "Line" },
      { kind: "arrowLine", name: "Arrow" },
    ],
  },
  {
    name: "Rectangles",
    shapes: [
      { kind: "rectangle", name: "Rectangle" },
      { kind: "rounded", name: "Rounded rectangle" },
    ],
  },
  {
    name: "Basic shapes",
    shapes: [
      { kind: "oval", name: "Oval" },
      { kind: "triangle", name: "Triangle" },
      { kind: "diamond", name: "Diamond" },
      { kind: "pentagon", name: "Pentagon" },
      { kind: "hexagon", name: "Hexagon" },
      { kind: "star", name: "Star" },
      { kind: "heart", name: "Heart" },
    ],
  },
  {
    name: "Block arrows",
    shapes: [
      { kind: "rightArrow", name: "Right arrow" },
      { kind: "leftArrow", name: "Left arrow" },
      { kind: "upArrow", name: "Up arrow" },
      { kind: "downArrow", name: "Down arrow" },
    ],
  },
  { name: "Callouts", shapes: [{ kind: "callout", name: "Speech bubble" }] },
];

const polygon = (points: [number, number][]) => `<polygon points="${points.map((p) => p.join(",")).join(" ")}"/>`;

/** Points evenly around a circle, starting at the top. */
const around = (n: number, cx: number, cy: number, r: number, turn = 0) =>
  Array.from({ length: n }, (_, i): [number, number] => {
    const a = ((i + turn) / n) * 2 * Math.PI - Math.PI / 2;
    return [+(cx + r * Math.cos(a)).toFixed(1), +(cy + r * Math.sin(a)).toFixed(1)];
  });

/** A shape stretches to whatever size it's dragged to, unlike pictures, which keep their proportions inside. */
export const shapeSvg = (kind: ShapeKind) => drawShape(kind).replace("<svg ", '<svg preserveAspectRatio="none" ');

function drawShape(kind: ShapeKind) {
  const style = `fill="${FILL}" stroke="${OUTLINE}" stroke-width="2" stroke-linejoin="round"`;
  if (kind === "line" || kind === "arrowLine") {
    const head = kind === "arrowLine" ? `<polygon points="150,30 134,22 134,38" fill="${FILL}"/>` : "";
    return svg(160, 60, `<line x1="8" y1="30" x2="${kind === "arrowLine" ? 138 : 152}" y2="30" stroke="${FILL}" stroke-width="3"/>${head}`);
  }
  const body: Record<Exclude<ShapeKind, "line" | "arrowLine">, string> = {
    rectangle: `<rect x="2" y="2" width="156" height="96"/>`,
    rounded: `<rect x="2" y="2" width="156" height="96" rx="16"/>`,
    oval: `<ellipse cx="80" cy="50" rx="78" ry="48"/>`,
    triangle: polygon([[80, 2], [158, 98], [2, 98]]),
    diamond: polygon([[80, 2], [158, 50], [80, 98], [2, 50]]),
    pentagon: polygon(around(5, 80, 54, 50)),
    hexagon: polygon([[40, 2], [120, 2], [158, 50], [120, 98], [40, 98], [2, 50]]),
    star: polygon(around(10, 80, 54, 50).map((p, i): [number, number] => (i % 2 ? [80 + (p[0] - 80) * 0.42, 54 + (p[1] - 54) * 0.42] : p))),
    heart: `<path d="M80 96 C20 60 2 38 22 16 C40 -2 70 6 80 26 C90 6 120 -2 138 16 C158 38 140 60 80 96 Z"/>`,
    rightArrow: polygon([[2, 30], [100, 30], [100, 4], [158, 50], [100, 96], [100, 70], [2, 70]]),
    leftArrow: polygon([[158, 30], [60, 30], [60, 4], [2, 50], [60, 96], [60, 70], [158, 70]]),
    upArrow: polygon([[60, 98], [60, 44], [34, 44], [80, 2], [126, 44], [100, 44], [100, 98]]),
    downArrow: polygon([[60, 2], [60, 56], [34, 56], [80, 98], [126, 56], [100, 56], [100, 2]]),
    callout: `<path d="M14 2 H146 Q158 2 158 14 V62 Q158 74 146 74 H62 L34 98 L40 74 H14 Q2 74 2 62 V14 Q2 2 14 2 Z"/>`,
  };
  return svg(160, 100, `<g ${style}>${body[kind]}</g>`);
}

// ---- SmartArt ----

export type SmartArtLayout = "process" | "list" | "cycle" | "hierarchy";

export const SMARTART_LAYOUTS: { id: SmartArtLayout; name: string; hint: string }[] = [
  { id: "process", name: "Process", hint: "Steps in order, left to right" },
  { id: "list", name: "List", hint: "Points one under another" },
  { id: "cycle", name: "Cycle", hint: "Steps that go round and repeat" },
  { id: "hierarchy", name: "Hierarchy", hint: "The first line on top, the rest under it" },
];

export const MAX_SMARTART_ITEMS = 8;

export function smartArtSvg(layout: SmartArtLayout, items: string[]) {
  const n = items.length;
  if (layout === "process") {
    const gap = 28;
    const w = Math.min(150, (600 - gap * (n - 1)) / n);
    const width = n * w + (n - 1) * gap;
    const body = items
      .map((item, i) => {
        const x = i * (w + gap);
        const box = `<rect x="${x}" y="10" width="${w}" height="80" rx="8" fill="${FILL}"/>${label(wrap(item, Math.floor(w / 8), 3), x + w / 2, 50, 13)}`;
        const arrow = i < n - 1 ? polygon([[x + w + 6, 42], [x + w + 14, 42], [x + w + 14, 36], [x + w + 23, 50], [x + w + 14, 64], [x + w + 14, 58], [x + w + 6, 58]]) : "";
        return box + arrow.replace("<polygon", `<polygon fill="#a5a5a5"`);
      })
      .join("");
    return svg(width, 100, body);
  }
  if (layout === "list") {
    const body = items
      .map((item, i) => {
        const y = i * 52;
        return `<rect x="0" y="${y}" width="480" height="44" rx="6" fill="#dbe5f5"/><rect x="0" y="${y}" width="10" height="44" rx="3" fill="${FILL}"/>${label(wrap(item, 52, 1), 245, y + 22, 15, "#1f3864")}`;
      })
      .join("");
    return svg(480, n * 52 - 8, body);
  }
  if (layout === "cycle") {
    const r = n <= 4 ? 100 : 130;
    const size = 2 * r + 120;
    const c = size / 2;
    const ring = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#a5a5a5" stroke-width="4"/>`;
    // Arrowheads half-way between the steps show which way round to go.
    const heads = around(n, c, c, r, 0.5)
      .map(([x, y], i) => {
        const deg = ((i + 0.5) / n) * 360;
        return `<polygon points="-8,-9 8,0 -8,9" fill="#a5a5a5" transform="translate(${x} ${y}) rotate(${deg})"/>`;
      })
      .join("");
    const nodes = around(n, c, c, r)
      .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="50" fill="${FILL}"/>${label(wrap(items[i], 11, 3), x, y, 12)}`)
      .join("");
    return svg(size, size, ring + heads + nodes);
  }
  // Hierarchy: one box on top, the others in a row under it.
  const [top, ...rest] = items;
  const w = 120;
  const gap = 16;
  const width = Math.max(w, rest.length * w + (rest.length - 1) * gap);
  const mid = width / 2;
  let body = `<rect x="${mid - w / 2}" y="0" width="${w}" height="60" rx="6" fill="${FILL}"/>${label(wrap(top, 14, 3), mid, 30, 13)}`;
  if (rest.length) {
    body += `<g stroke="#a5a5a5" stroke-width="2" fill="none"><path d="M${mid} 60 V80"/>`;
    const centres = rest.map((_, i) => i * (w + gap) + w / 2);
    body += `<path d="M${centres[0]} 80 H${centres[centres.length - 1]}"/>`;
    body += centres.map((x) => `<path d="M${x} 80 V100"/>`).join("") + "</g>";
    body += rest
      .map((item, i) => `<rect x="${i * (w + gap)}" y="100" width="${w}" height="60" rx="6" fill="#5b9bd5"/>${label(wrap(item, 14, 3), centres[i], 130, 13)}`)
      .join("");
  }
  return svg(width, rest.length ? 160 : 60, body);
}
