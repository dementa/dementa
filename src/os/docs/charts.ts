// Charts for Docs, drawn with D3 as SVG pictures. D3 works out the scales, ticks, curves and
// pie slices; the result is a plain picture, so saved documents show it anywhere. The chart's
// settings travel with the picture (data-chart), so it can be opened and changed later.

import {
  arc,
  area,
  curveMonotoneX,
  format,
  line,
  max,
  min,
  pie,
  scaleBand,
  scaleLinear,
  scalePoint,
  sum,
  type PieArcDatum,
  type ScaleLinear,
} from "d3";
import { escapeXml, FILL, FONT, svg, wrap } from "./graphics";

export type ChartType = "column" | "bar" | "line" | "area" | "pie" | "doughnut";

export const CHART_TYPES: { id: ChartType; name: string }[] = [
  { id: "column", name: "Column" },
  { id: "bar", name: "Bar" },
  { id: "line", name: "Line" },
  { id: "area", name: "Area" },
  { id: "pie", name: "Pie" },
  { id: "doughnut", name: "Doughnut" },
];

/** Everything needed to draw a chart again. Kept on the picture so the chart stays editable. */
export interface ChartSpec {
  type: ChartType;
  title: string;
  /** "Apples, 12" lines, as typed. */
  data: string;
  /** Numbers written on the bars, points or slices. */
  labels: boolean;
}

export const NEW_CHART: ChartSpec = {
  type: "column",
  title: "Chart Title",
  data: "Apples, 12\nBananas, 8\nOranges, 15\nPears, 5",
  labels: false,
};

export interface Point {
  name: string;
  value: number;
}

export const MAX_CHART_POINTS = 12;

/** Word's chart colours, in order. */
const SERIES = ["#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47", "#264478", "#9e480e", "#636363", "#997300", "#255e91", "#43682b"];
const TEXT = "#404040";
const MUTED = "#595959";
const GRID = "#d9d9d9";
const W = 560;
const H = 340;

const isRound = (type: ChartType) => type === "pie" || type === "doughnut";

/** "Apples, 12" lines → points. Returns the number of the first line it can't read instead. */
export function parseChartData(text: string): Point[] | { badLine: number } {
  const points: Point[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const row = lines[i].trim();
    if (!row) continue;
    const m = /^(.*?)[\s,:;\t]+(-?\d+(?:\.\d+)?)$/.exec(row);
    if (!m || !m[1].trim()) return { badLine: i + 1 };
    points.push({ name: m[1].trim(), value: Number(m[2]) });
  }
  return points;
}

/** The chart's points, or what's wrong with the data in words for the person typing it. */
export function readChart(spec: ChartSpec): { points: Point[] } | { problem: string } {
  const parsed = parseChartData(spec.data);
  if (!Array.isArray(parsed)) return { problem: `Line ${parsed.badLine} needs a name and a number, like “Apples, 12”.` };
  if (!parsed.length) return { problem: "Type at least one line, like “Apples, 12”." };
  if (parsed.length > MAX_CHART_POINTS) return { problem: `A chart can show up to ${MAX_CHART_POINTS} lines.` };
  if (isRound(spec.type)) {
    if (parsed.some((p) => p.value < 0)) return { problem: "Pie and doughnut charts can't show numbers below zero." };
    if (!sum(parsed, (p) => p.value)) return { problem: "Pie and doughnut charts need at least one number above zero." };
  }
  return { points: parsed };
}

/** A chart's settings from a saved picture, or null if it isn't a chart. */
export function parseSpec(json: unknown): ChartSpec | null {
  if (typeof json !== "string") return null;
  try {
    const s = JSON.parse(json);
    if (!CHART_TYPES.some((t) => t.id === s.type) || typeof s.data !== "string") return null;
    return { type: s.type, title: typeof s.title === "string" ? s.title : "", data: s.data, labels: !!s.labels };
  } catch {
    return null;
  }
}

/** 12 → "12", 4.25 → "4.25", 15000 → "15,000". */
const value = format(",~r");

const text = (x: number, y: number, content: string, attrs = "", size = 12, colour = TEXT) =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" ${FONT} font-size="${size}" fill="${colour}" ${attrs}>${escapeXml(content)}</text>`;

/** One short line for a name under or beside the chart. */
const short = (name: string, chars: number) => wrap(name, Math.max(3, chars), 1)[0] ?? "";

/** The number scale: always includes 0, rounded out to tidy numbers by D3. */
function valueScale(points: Point[], range: [number, number]) {
  const lo = Math.min(0, min(points, (p) => p.value)!);
  const hi = Math.max(0, max(points, (p) => p.value)!);
  return scaleLinear()
    .domain(lo === hi ? [0, 1] : [lo, hi])
    .range(range)
    .nice(5);
}

/** Labels for the scale; big numbers are shortened (15k, 2M). */
function tickLabels(scale: ScaleLinear<number, number>) {
  const big = Math.max(...scale.domain().map(Math.abs)) >= 10000;
  const label = scale.tickFormat(5, big ? "~s" : ",~r");
  // "~s" would write nought as "0k".
  return { ticks: scale.ticks(5), label: (t: number) => (t === 0 ? "0" : label(t)) };
}

export function chartSvg(spec: ChartSpec, points: Point[]) {
  const title = spec.title.trim();
  const top = title ? 48 : 20;
  let body = `<rect width="${W}" height="${H}" fill="#fff"/>`;
  if (title) body += text(W / 2, 28, title, `text-anchor="middle" font-weight="600"`, 16);
  body += isRound(spec.type) ? roundChart(spec, points, top) : spec.type === "bar" ? barChart(spec, points, top) : uprightChart(spec, points, top);
  return svg(W, H, body);
}

/** Column, line and area: names along the bottom, numbers up the left. */
function uprightChart(spec: ChartSpec, points: Point[], top: number) {
  const bottom = H - 36;
  const right = W - 20;
  const y = valueScale(points, [bottom, top]);
  const { ticks, label } = tickLabels(y);
  // Room on the left for the longest number on the scale.
  const left = 16 + 7 * Math.max(...ticks.map((t) => label(t).length));
  const names = points.map((p) => p.name);

  let out = ticks
    .map((t) => `<line x1="${left}" x2="${right}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 0 ? "#a6a6a6" : GRID}"/>` + text(left - 8, y(t), label(t), `text-anchor="end" dominant-baseline="central"`, 11, MUTED))
    .join("");

  if (spec.type === "column") {
    const x = scaleBand(names, [left, right]).padding(0.35);
    const chars = Math.floor((x.step() - 4) / 7);
    out += points
      .map((p) => {
        const y0 = y(Math.max(0, p.value));
        const h = Math.abs(y(p.value) - y(0));
        const tag = spec.labels ? text(x(p.name)! + x.bandwidth() / 2, p.value < 0 ? y0 + h + 14 : y0 - 6, value(p.value), `text-anchor="middle"`, 11) : "";
        return `<rect x="${x(p.name)}" y="${y0}" width="${x.bandwidth()}" height="${h}" fill="${FILL}"/>` + tag;
      })
      .join("");
    out += points.map((p) => text(x(p.name)! + x.bandwidth() / 2, bottom + 20, short(p.name, chars), `text-anchor="middle"`)).join("");
    return out;
  }

  const x = scalePoint(names, [left, right]).padding(0.5);
  const chars = Math.floor((x.step() - 4) / 7);
  if (spec.type === "area") {
    const shape = area<Point>()
      .x((p) => x(p.name)!)
      .y0(y(0))
      .y1((p) => y(p.value))
      .curve(curveMonotoneX);
    out += `<path d="${shape(points)}" fill="${FILL}" fill-opacity="0.35"/>`;
  }
  const path = line<Point>()
    .x((p) => x(p.name)!)
    .y((p) => y(p.value))
    .curve(curveMonotoneX);
  out += `<path d="${path(points)}" fill="none" stroke="${FILL}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
  out += points
    .map((p) => {
      const cx = x(p.name)!;
      const cy = y(p.value);
      const dot = `<circle cx="${cx}" cy="${cy}" r="4.5" fill="#fff" stroke="${FILL}" stroke-width="2.5"/>`;
      return dot + (spec.labels ? text(cx, cy - 12, value(p.value), `text-anchor="middle"`, 11) : "");
    })
    .join("");
  out += points.map((p) => text(x(p.name)!, bottom + 20, short(p.name, chars), `text-anchor="middle"`)).join("");
  return out;
}

/** Bar: names down the left, bars going right. */
function barChart(spec: ChartSpec, points: Point[], top: number) {
  const bottom = H - 30;
  const longest = Math.min(16, Math.max(...points.map((p) => p.name.length)));
  const left = 16 + 7 * longest;
  const right = W - (spec.labels ? 50 : 24);
  const x = valueScale(points, [left, right]);
  const { ticks, label } = tickLabels(x);
  const y = scaleBand(
    points.map((p) => p.name),
    [top, bottom],
  ).padding(0.3);

  let out = ticks
    .map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${bottom}" stroke="${t === 0 ? "#a6a6a6" : GRID}"/>` + text(x(t), bottom + 16, label(t), `text-anchor="middle"`, 11, MUTED))
    .join("");
  out += points
    .map((p) => {
      const x0 = x(Math.min(0, p.value));
      const w = Math.abs(x(p.value) - x(0));
      const mid = y(p.name)! + y.bandwidth() / 2;
      const tag = spec.labels
        ? text(p.value < 0 ? x0 - 6 : x0 + w + 6, mid, value(p.value), `text-anchor="${p.value < 0 ? "end" : "start"}" dominant-baseline="central"`, 11)
        : "";
      return (
        `<rect x="${x0}" y="${y(p.name)}" width="${w}" height="${y.bandwidth()}" fill="${FILL}"/>` +
        tag +
        text(Math.min(left, x(0)) - 8, mid, short(p.name, longest), `text-anchor="end" dominant-baseline="central"`)
      );
    })
    .join("");
  return out;
}

/** Pie and doughnut, with a legend on the right. */
function roundChart(spec: ChartSpec, points: Point[], top: number) {
  const total = sum(points, (p) => p.value);
  const r = Math.min(130, (H - top - 16) / 2);
  const cx = 30 + r;
  const cy = top + (H - top) / 2 - 4;
  const inner = spec.type === "doughnut" ? r * 0.55 : 0;
  const slices = pie<Point>()
    .sort(null)
    .value((p) => p.value)(points);
  const shape = arc<PieArcDatum<Point>>().innerRadius(inner).outerRadius(r);
  // Where the percentages go: the middle of each slice's ring.
  const labelArc = arc<PieArcDatum<Point>>()
    .innerRadius(inner ? (inner + r) / 2 : r * 0.62)
    .outerRadius(inner ? (inner + r) / 2 : r * 0.62);
  const percent = (p: Point) => `${Math.round((p.value / total) * 100)}%`;

  let out = `<g transform="translate(${cx} ${cy})">`;
  out += slices
    .filter((s) => s.value > 0)
    .map((s) => `<path d="${shape(s)}" fill="${SERIES[s.index % SERIES.length]}" stroke="#fff" stroke-width="2"/>`)
    .join("");
  if (spec.labels) {
    out += slices
      // Slices too thin for a number are left bare.
      .filter((s) => s.endAngle - s.startAngle > 0.3)
      .map((s) => {
        const [lx, ly] = labelArc.centroid(s);
        return text(lx, ly, percent(s.data), `text-anchor="middle" dominant-baseline="central" font-weight="600"`, 12, "#fff");
      })
      .join("");
  }
  if (inner) {
    out += text(0, -8, value(total), `text-anchor="middle" dominant-baseline="central" font-weight="600"`, 20);
    out += text(0, 14, "Total", `text-anchor="middle" dominant-baseline="central"`, 11, MUTED);
  }
  out += "</g>";

  const legendX = cx + r + 40;
  const rowH = Math.min(24, (H - top - 10) / points.length);
  const legendTop = cy - (rowH * points.length) / 2 + rowH / 2;
  out += points
    .map((p, i) => {
      const ly = legendTop + i * rowH;
      return (
        `<rect x="${legendX}" y="${ly - 6}" width="12" height="12" rx="2" fill="${SERIES[i % SERIES.length]}"/>` +
        text(legendX + 20, ly, `${short(p.name, 18)} (${percent(p)})`, `dominant-baseline="central"`, 13)
      );
    })
    .join("");
  return out;
}
