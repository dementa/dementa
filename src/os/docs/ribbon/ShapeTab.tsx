"use client";

// Word's Shape Format tab, while a shape is selected: drawing more shapes or changing this one,
// ready-made styles, fill and outline (colour, weight, dashes), the text in the shape, flipping,
// how it sits with the text, and its exact size.

import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  Baseline,
  Bold,
  ChevronDown,
  FlipHorizontal2,
  FlipVertical2,
  Italic,
  PaintBucket,
  PenLine,
  RotateCw,
  Shapes,
  TextCursorInput,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { drawShape } from "../drawShape";
import { isLine, newShape, readShape, SHAPE_GROUPS, shapeIcon, shapeName, type Dash, type Shape, type ShapeKind } from "../shapes";
import { ColourPicker } from "./ColourPicker";
import { SizeGroup, WrapTextButton } from "./PictureTab";
import { Big, Divider, Drop, Group, keepFocus, MenuButton, MenuItem, Row, Stack, Tool } from "./parts";
import { GroupButton } from "./ArrangeMore";

/** Every shape, in Word's groups. Picking one starts drawing it (or changes the selected shape). */
export function ShapeGallery({ onPick }: { onPick: (kind: ShapeKind) => void }) {
  return (
    <div className="flex w-64 flex-col gap-2 p-1">
      {SHAPE_GROUPS.map((g) => (
        <div key={g.name}>
          <p className="mb-1 text-xs font-medium text-slate-500">{g.name}</p>
          <div className="flex flex-wrap gap-1">
            {g.shapes.map((s) => (
              <ShapeButton key={s.kind} kind={s.kind} onPick={onPick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ShapeButton({ kind, onPick, small }: { kind: ShapeKind; onPick: (kind: ShapeKind) => void; small?: boolean }) {
  const name = shapeName(kind);
  return (
    <button
      type="button"
      title={name}
      aria-label={name}
      onMouseDown={keepFocus}
      onClick={() => onPick(kind)}
      className={`flex items-center justify-center rounded hover:bg-slate-200/70 ${small ? "h-6 w-6" : "h-8 w-8"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a drawing made here */}
      <img src={shapeIcon(kind)} alt="" className={small ? "max-h-4 max-w-4" : "max-h-6 max-w-6"} />
    </button>
  );
}

/** The shapes shown straight on the ribbon, like Word's small gallery. */
const QUICK_SHAPES: ShapeKind[] = ["textBox", "line", "arrowLine", "rectangle", "oval", "triangle", "rightArrow", "star"];

/** Word's theme colours that its shape styles are made from. */
const ACCENTS = ["#000000", "#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47"];

/** Mixes a colour towards white (amount > 0) or black (amount < 0). */
function mix(hex: string, amount: number) {
  const target = amount > 0 ? 255 : 0;
  const parts = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${parts.map((p) => Math.round(p + (target - p) * Math.abs(amount)).toString(16).padStart(2, "0")).join("")}`;
}

type Style = Pick<Shape, "fill" | "outline" | "textColour">;

/** Word's shape styles: coloured outline, coloured fill, and a light fill, in each theme colour. */
const STYLES: { name: string; make: (c: string) => Style }[] = [
  { name: "Coloured Outline", make: (c) => ({ fill: "#ffffff", outline: c, textColour: "#000000" }) },
  { name: "Coloured Fill", make: (c) => ({ fill: c, outline: mix(c, c === "#000000" ? 0.25 : -0.35), textColour: "#ffffff" }) },
  { name: "Subtle Effect", make: (c) => ({ fill: mix(c, 0.8), outline: c, textColour: "#000000" }) },
];

const WEIGHTS = [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6];
const DASHES: { id: Dash; name: string; css: string }[] = [
  { id: "solid", name: "Solid", css: "solid" },
  { id: "dash", name: "Dash", css: "dashed" },
  { id: "dot", name: "Round Dot", css: "dotted" },
];
const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];

const ptLabel = (pt: number) => `${String(pt).replace(".25", "¼").replace(".5", "½").replace(".75", "¾").replace(/^0(?=[¼½¾])/, "")} pt`;

export function ShapeTab({ editor }: { editor: Editor }) {
  const shape = readShape(editor.getAttributes("image").shape);
  if (!shape) return null;
  const line = isLine(shape.kind);
  const set = (patch: Partial<Shape>) => editor.chain().focus().updateAttributes("image", { shape: { ...shape, ...patch } }).run();

  /** Another shape in the same place; a line and a solid shape look different, so switching between them starts afresh. */
  const change = (kind: ShapeKind) =>
    set(isLine(kind) === line ? { kind } : { ...newShape(kind), text: shape.text });

  return (
    <>
      <Group label="Insert Shapes">
        <div className="flex items-start gap-1">
          <div className="grid w-[6.5rem] grid-cols-4 gap-0.5">
            {QUICK_SHAPES.map((kind) => (
              <ShapeButton key={kind} kind={kind} small onPick={(k) => drawShape(editor, k)} />
            ))}
          </div>
          <Stack>
            <MenuButton icon={Shapes} label="More shapes" menu={(close) => <ShapeGallery onPick={(k) => (close(), drawShape(editor, k))} />} />
            <MenuButton icon={PenLine} label="Edit Shape: change this shape" menu={(close) => <ShapeGallery onPick={(k) => (close(), change(k))} />} />
            <Tool icon={TextCursorInput} label="Draw Text Box" onClick={() => drawShape(editor, "textBox")} />
          </Stack>
        </div>
      </Group>
      <Divider />

      <Group label="Shape Styles">
        <div className="grid grid-cols-7 gap-1" role="list" aria-label="Shape styles">
          {STYLES.flatMap((style) =>
            ACCENTS.map((c) => {
              const look = style.make(c);
              const chosen = shape.fill === look.fill && shape.outline === look.outline;
              return (
                <button
                  key={`${style.name}${c}`}
                  type="button"
                  title={style.name}
                  aria-label={`${style.name}, ${c}`}
                  aria-pressed={chosen}
                  onMouseDown={keepFocus}
                  onClick={() => set(line ? { outline: c } : look)}
                  className={`flex h-[18px] w-7 items-center justify-center rounded-sm text-[9px] font-semibold ${chosen ? "ring-2 ring-blue-500" : "hover:ring-2 hover:ring-blue-300"}`}
                  style={line ? { borderBottom: `3px solid ${c}` } : { background: look.fill ?? "transparent", border: `1.5px solid ${look.outline}`, color: look.textColour }}
                >
                  {line ? "" : "Abc"}
                </button>
              );
            }),
          )}
        </div>
        <Stack>
          <TextMenu icon={PaintBucket} label="Shape Fill" colour={shape.fill} disabled={line}>
            {(close) => <ColourPicker current={shape.fill} noneLabel="No Fill" onPick={(c) => (close(), set({ fill: c }))} />}
          </TextMenu>
          <TextMenu icon={PenLine} label="Shape Outline" colour={shape.outline}>
            {(close) => (
              <div className="flex flex-col">
                <ColourPicker current={shape.outline} noneLabel="No Outline" onPick={(c) => (close(), set({ outline: c }))} />
                <Heading>Weight</Heading>
                {WEIGHTS.map((w) => (
                  <MenuItem
                    key={w}
                    checked={shape.weight === w}
                    label={
                      <span className="flex items-center gap-3">
                        <span className="w-10">{ptLabel(w)}</span>
                        <span className="w-20 bg-slate-800" style={{ height: Math.max(1, w * (96 / 72)) }} />
                      </span>
                    }
                    onClick={() => (close(), set({ weight: w, outline: shape.outline ?? "#000000" }))}
                  />
                ))}
                <Heading>Dashes</Heading>
                {DASHES.map((d) => (
                  <MenuItem
                    key={d.id}
                    checked={shape.dash === d.id}
                    label={
                      <span className="flex items-center gap-3">
                        <span className="w-20">{d.name}</span>
                        <span className="w-16" style={{ borderTop: `2px ${d.css} currentColor` }} />
                      </span>
                    }
                    onClick={() => (close(), set({ dash: d.id, outline: shape.outline ?? "#000000" }))}
                  />
                ))}
              </div>
            )}
          </TextMenu>
        </Stack>
      </Group>
      <Divider />

      <Group label="Text">
        <Stack>
          <Row>
            <select
              aria-label="Font size"
              title="Font size"
              value={shape.fontSize}
              disabled={line}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => set({ fontSize: Number(e.target.value) })}
              className="h-7 rounded border border-slate-300 bg-surface px-1 text-sm disabled:opacity-35"
            >
              {(FONT_SIZES.includes(shape.fontSize) ? FONT_SIZES : [...FONT_SIZES, shape.fontSize].sort((a, b) => a - b)).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Tool icon={Bold} label="Bold" active={shape.bold} disabled={line} onClick={() => set({ bold: !shape.bold })} />
            <Tool icon={Italic} label="Italic" active={shape.italic} disabled={line} onClick={() => set({ italic: !shape.italic })} />
          </Row>
          <Row>
            <Tool icon={AlignLeft} label="Align Left" active={shape.align === "left"} disabled={line} onClick={() => set({ align: "left" })} />
            <Tool icon={AlignCenter} label="Centre" active={shape.align === "center"} disabled={line} onClick={() => set({ align: "center" })} />
            <Tool icon={AlignRight} label="Align Right" active={shape.align === "right"} disabled={line} onClick={() => set({ align: "right" })} />
          </Row>
          <TextMenu icon={Baseline} label="Text Fill" colour={shape.textColour} disabled={line}>
            {(close) => <ColourPicker current={shape.textColour} noneLabel="Automatic" onPick={(c) => (close(), set({ textColour: c ?? "#000000" }))} />}
          </TextMenu>
        </Stack>
        <MenuButton
          big
          icon={AlignVerticalJustifyCenter}
          label={"Align\nText"}
          title="Align Text: top, middle or bottom of the shape"
          disabled={line}
          menu={(close) => (
            <>
              <MenuItem label="Top" checked={shape.valign === "top"} onClick={() => (close(), set({ valign: "top" }))} />
              <MenuItem label="Middle" checked={shape.valign === "middle"} onClick={() => (close(), set({ valign: "middle" }))} />
              <MenuItem label="Bottom" checked={shape.valign === "bottom"} onClick={() => (close(), set({ valign: "bottom" }))} />
            </>
          )}
        />
      </Group>
      <Divider />

      <Group label="Arrange">
        <WrapTextButton editor={editor} />
        <GroupButton editor={editor} />
        <MenuButton
          big
          icon={RotateCw}
          label={"Rotate\n"}
          title="Rotate"
          menu={(close) => (
            <>
              <MenuItem icon={FlipVertical2} label="Flip Vertical" onClick={() => (close(), set({ flipV: !shape.flipV }))} />
              <MenuItem icon={FlipHorizontal2} label="Flip Horizontal" onClick={() => (close(), set({ flipH: !shape.flipH }))} />
            </>
          )}
        />
      </Group>
      <Divider />

      <SizeGroup editor={editor} lockedAtFirst={false}>
        <Big icon={Trash2} label="Delete" danger onClick={() => editor.chain().focus().deleteSelection().run()} />
      </SizeGroup>
    </>
  );
}

const Heading = ({ children }: { children: ReactNode }) => <p className="mt-2 px-2 pb-1 text-xs font-semibold text-slate-500">{children}</p>;

/** Word's small ribbon buttons with their name beside the icon, like "Shape Fill ▾"; a colour bar shows the current colour. */
function TextMenu(p: { icon: LucideIcon; label: string; colour?: string | null; disabled?: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <span className="relative flex">
      <button
        type="button"
        aria-expanded={open}
        disabled={p.disabled}
        onMouseDown={keepFocus}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-7 items-center gap-1.5 rounded px-1.5 text-xs disabled:opacity-35 ${open ? "bg-blue-100 text-blue-800" : "hover:bg-slate-200/70"}`}
      >
        <span className="relative flex">
          <p.icon size={16} />
          {p.colour !== undefined && (
            <span
              className="absolute -right-0.5 -bottom-1 -left-0.5 h-[3px] rounded-sm ring-1 ring-black/10"
              style={{ background: p.colour ?? "transparent" }}
            />
          )}
        </span>
        {p.label}
        <ChevronDown size={11} />
      </button>
      <Drop open={open} onClose={close}>
        {p.children(close)}
      </Drop>
    </span>
  );
}
