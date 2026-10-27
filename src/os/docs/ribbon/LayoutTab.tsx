"use client";

// Word's Layout tab. Page Setup: margins, orientation, paper size, columns, breaks, line numbers and
// hyphenation. Paragraph: indents and spacing of the paragraphs where the cursor is. Arrange: how the
// selected picture or shape sits with the text, which is on top, and flipping shapes.

import type { Editor } from "@tiptap/react";
import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  BringToFront,
  ChevronDown,
  ChevronUp,
  Columns2,
  Columns3,
  File,
  FlipHorizontal2,
  FlipVertical2,
  ListOrdered,
  Minus,
  RectangleHorizontal,
  RectangleVertical,
  RotateCw,
  Scan,
  SendToBack,
  SeparatorHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { INDENT_PX } from "../extensions";
import {
  MARGIN_PRESETS,
  marginsOf,
  MAX_COLUMNS,
  measureUnit,
  PAGE_SIZES,
  pageBox,
  sizeOf,
  type PageLayout,
  type Sides,
} from "../layout";
import { readShape } from "../shapes";
import { AlignButton, GroupButton, PositionButton, SelectionPaneButton } from "./ArrangeMore";
import { WrapTextButton } from "./PictureTab";
import { Divider, Group, keepFocus, MenuButton, MenuItem, Stack } from "./parts";

type OnLayout = (patch: Partial<PageLayout>) => void;

const PX_PER_PT = 96 / 72;
/** Paragraphs can be indented up to 8 steps (4 inches), as the editor keeps them. */
const MAX_INDENT_PX = 8 * INDENT_PX;
const SIDES = ["top", "bottom", "left", "right"] as const;
const SIDE_NAMES: Record<keyof Sides, string> = { top: "Top", bottom: "Bottom", left: "Left", right: "Right" };

const round = (n: number, step = 0.01) => Math.round(n / step) * step;
/** A size in the unit people use here, e.g. "2.54 cm". */
const shown = (px: number) => {
  const unit = measureUnit();
  return `${+round(px / unit.px).toFixed(2)} ${unit.name}`;
};

export function LayoutTab({ editor, layout, onLayout }: { editor: Editor; layout: PageLayout; onLayout: OnLayout }) {
  return (
    <>
      <Group
        label="Page Setup"
        more={(close) => (
          <PageSetupForm
            layout={layout}
            onCancel={close}
            onApply={(patch) => {
              close();
              onLayout(patch);
            }}
          />
        )}
      >
        <MarginsButton layout={layout} onLayout={onLayout} />
        <OrientationButton layout={layout} onLayout={onLayout} />
        <SizeButton layout={layout} onLayout={onLayout} />
        <ColumnsButton layout={layout} onLayout={onLayout} />
        <Stack>
          <BreaksButton editor={editor} />
          <LineNumbersButton editor={editor} layout={layout} onLayout={onLayout} />
          <HyphenationButton layout={layout} onLayout={onLayout} />
        </Stack>
      </Group>
      <Divider />
      <ParagraphGroup editor={editor} />
      <Divider />
      <Group label="Arrange">
        <PositionButton editor={editor} layout={layout} />
        <ArrangeButtons editor={editor} />
        <SelectionPaneButton editor={editor} />
        <Stack>
          <AlignButton editor={editor} layout={layout} />
          <GroupButton editor={editor} />
        </Stack>
      </Group>
    </>
  );
}

// ---- Page Setup ----

function MarginsButton({ layout, onLayout }: { layout: PageLayout; onLayout: OnLayout }) {
  const current = marginsOf(layout);
  return (
    <MenuButton
      big
      icon={Scan}
      label="Margins"
      menu={(close) => (
        <Choices
          form={(back) => (
            <MarginsForm
              layout={layout}
              onCancel={back}
              onApply={(margins) => {
                close();
                onLayout({ margins });
              }}
            />
          )}
          more="Custom Margins…"
        >
          {MARGIN_PRESETS.map((m) => (
            <MenuItem
              key={m.id}
              checked={current?.id === m.id}
              label={<Described name={m.label} detail={SIDES.map((s) => `${SIDE_NAMES[s]}: ${shown(m.sides[s])}`).join("   ")} />}
              onClick={() => (close(), onLayout({ margins: m.sides }))}
            />
          ))}
          {!current && (
            <MenuItem
              checked
              label={<Described name="Custom" detail={SIDES.map((s) => `${SIDE_NAMES[s]}: ${shown(layout.margins[s])}`).join("   ")} />}
              onClick={close}
            />
          )}
        </Choices>
      )}
    />
  );
}

function MarginsForm({ layout, onApply, onCancel }: { layout: PageLayout; onApply: (m: Sides) => void; onCancel: () => void }) {
  const [sides, setSides] = useState(layout.margins);
  const page = pageBox(layout);
  // Leave at least an inch to write in.
  const fits = sides.left + sides.right <= page.w - 96 && sides.top + sides.bottom <= page.h - 96;
  return (
    <Form title="Custom Margins" onCancel={onCancel} onApply={() => onApply(sides)} ok={fits} problem="The margins leave no room for the text.">
      <div className="flex flex-col gap-1.5">
        {SIDES.map((s) => (
          <LengthField key={s} label={SIDE_NAMES[s]} px={sides[s]} min={0} max={10 * 96} onChange={(v) => setSides({ ...sides, [s]: v })} />
        ))}
      </div>
    </Form>
  );
}

/** Page Setup's corner button: margins, orientation and paper size together, as in Word's dialog. */
function PageSetupForm({ layout, onApply, onCancel }: { layout: PageLayout; onApply: (patch: Partial<PageLayout>) => void; onCancel: () => void }) {
  const [sides, setSides] = useState(layout.margins);
  const [orientation, setOrientation] = useState(layout.orientation);
  const [size, setSize] = useState({ width: layout.width, height: layout.height });
  const named = PAGE_SIZES.find((p) => Math.abs(p.w - size.width) < 1 && Math.abs(p.h - size.height) < 1);
  const page = orientation === "portrait" ? { w: size.width, h: size.height } : { w: size.height, h: size.width };
  const fits = sides.left + sides.right <= page.w - 96 && sides.top + sides.bottom <= page.h - 96;
  return (
    <Form
      title="Page Setup"
      cancel="Cancel"
      ok={fits}
      problem="The margins leave no room for the text."
      onCancel={onCancel}
      onApply={() => onApply({ margins: sides, orientation, ...size })}
    >
      <Heading>Margins</Heading>
      <div className="flex flex-col gap-1.5 px-2">
        {SIDES.map((s) => (
          <LengthField key={s} label={SIDE_NAMES[s]} px={sides[s]} min={0} max={10 * 96} onChange={(v) => setSides({ ...sides, [s]: v })} />
        ))}
      </div>
      <Heading>Orientation</Heading>
      <div className="flex gap-4 px-2 text-sm">
        {(["portrait", "landscape"] as const).map((o) => (
          <label key={o} className="flex items-center gap-1.5 capitalize">
            <input type="radio" checked={orientation === o} onChange={() => setOrientation(o)} /> {o}
          </label>
        ))}
      </div>
      <Heading>Paper</Heading>
      <label className="flex items-center justify-between gap-2 px-2 text-sm">
        Paper size
        <select
          value={named?.id ?? "custom"}
          onChange={(e) => {
            const p = PAGE_SIZES.find((x) => x.id === e.target.value);
            if (p) setSize({ width: p.w, height: p.h });
          }}
          className="rounded border border-slate-300 bg-surface px-1.5 py-0.5"
        >
          {PAGE_SIZES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          {!named && <option value="custom">Custom size</option>}
        </select>
      </label>
      <div className="flex flex-col gap-1.5 px-2">
        <LengthField label="Width" px={size.width} min={96} max={22 * 96} onChange={(width) => setSize({ ...size, width })} />
        <LengthField label="Height" px={size.height} min={96} max={22 * 96} onChange={(height) => setSize({ ...size, height })} />
      </div>
    </Form>
  );
}

function OrientationButton({ layout, onLayout }: { layout: PageLayout; onLayout: OnLayout }) {
  return (
    <MenuButton
      big
      icon={layout.orientation === "portrait" ? RectangleVertical : RectangleHorizontal}
      label="Orientation"
      menu={(close) => (
        <>
          <MenuItem icon={RectangleVertical} label="Portrait" checked={layout.orientation === "portrait"} onClick={() => (close(), onLayout({ orientation: "portrait" }))} />
          <MenuItem icon={RectangleHorizontal} label="Landscape" checked={layout.orientation === "landscape"} onClick={() => (close(), onLayout({ orientation: "landscape" }))} />
        </>
      )}
    />
  );
}

function SizeButton({ layout, onLayout }: { layout: PageLayout; onLayout: OnLayout }) {
  const current = sizeOf(layout);
  return (
    <MenuButton
      big
      icon={File}
      label="Size"
      menu={(close) => (
        <Choices
          more="More Paper Sizes…"
          form={(back) => (
            <SizeForm
              layout={layout}
              onCancel={back}
              onApply={(size) => {
                close();
                onLayout(size);
              }}
            />
          )}
        >
          {PAGE_SIZES.map((s) => (
            <MenuItem
              key={s.id}
              checked={current?.id === s.id}
              label={<Described name={s.label} detail={`${shown(s.w)} × ${shown(s.h)}`} />}
              onClick={() => (close(), onLayout({ width: s.w, height: s.h }))}
            />
          ))}
          {!current && <MenuItem checked label={<Described name="Custom size" detail={`${shown(layout.width)} × ${shown(layout.height)}`} />} onClick={close} />}
        </Choices>
      )}
    />
  );
}

function SizeForm({ layout, onApply, onCancel }: { layout: PageLayout; onApply: (size: { width: number; height: number }) => void; onCancel: () => void }) {
  const [size, setSize] = useState({ width: layout.width, height: layout.height });
  const fits = size.width - layout.margins.left - layout.margins.right >= 96 && size.height - layout.margins.top - layout.margins.bottom >= 96;
  return (
    <Form title="Paper Size" onCancel={onCancel} onApply={() => onApply(size)} ok={fits} problem="The paper is too small for its margins.">
      <div className="flex flex-col gap-1.5">
        <LengthField label="Width" px={size.width} min={96} max={22 * 96} onChange={(width) => setSize({ ...size, width })} />
        <LengthField label="Height" px={size.height} min={96} max={22 * 96} onChange={(height) => setSize({ ...size, height })} />
      </div>
    </Form>
  );
}

function ColumnsButton({ layout, onLayout }: { layout: PageLayout; onLayout: OnLayout }) {
  const presets: { n: number; label: string; icon: LucideIcon }[] = [
    { n: 1, label: "One", icon: RectangleVertical },
    { n: 2, label: "Two", icon: Columns2 },
    { n: 3, label: "Three", icon: Columns3 },
  ];
  return (
    <MenuButton
      big
      icon={Columns2}
      label="Columns"
      menu={(close) => (
        <Choices
          more="More Columns…"
          form={(back) => (
            <ColumnsForm
              layout={layout}
              onCancel={back}
              onApply={(patch) => {
                close();
                onLayout(patch);
              }}
            />
          )}
        >
          {presets.map((p) => (
            <MenuItem key={p.n} icon={p.icon} label={p.label} checked={layout.columns === p.n} onClick={() => (close(), onLayout({ columns: p.n }))} />
          ))}
          {layout.columns > 3 && <MenuItem checked label={`${layout.columns} columns`} onClick={close} />}
        </Choices>
      )}
    />
  );
}

function ColumnsForm({ layout, onApply, onCancel }: { layout: PageLayout; onApply: (patch: Partial<PageLayout>) => void; onCancel: () => void }) {
  const [columns, setColumns] = useState(layout.columns);
  const [gap, setGap] = useState(layout.columnGap);
  const [line, setLine] = useState(layout.columnLine);
  const width = pageBox(layout).w - layout.margins.left - layout.margins.right;
  // Each column should be at least half an inch wide.
  const fits = (width - (columns - 1) * gap) / columns >= 48;
  return (
    <Form
      title="Columns"
      onCancel={onCancel}
      onApply={() => onApply({ columns, columnGap: gap, columnLine: line })}
      ok={fits}
      problem="The columns are too narrow for this page."
    >
      <label className="flex items-center justify-between gap-3 text-sm">
        Number of columns
        <select
          value={columns}
          onChange={(e) => setColumns(Number(e.target.value))}
          className="rounded border border-slate-300 bg-surface px-1.5 py-0.5"
        >
          {Array.from({ length: MAX_COLUMNS }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <LengthField label="Spacing" px={gap} min={0} max={4 * 96} onChange={setGap} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={line} onChange={(e) => setLine(e.target.checked)} /> Line between
      </label>
    </Form>
  );
}

function BreaksButton({ editor }: { editor: Editor }) {
  return (
    <MenuButton
      icon={SeparatorHorizontal}
      label="Breaks"
      showLabel
      title="Breaks"
      menu={(close) => (
        <>
          <Heading>Page Breaks</Heading>
          <MenuItem
            label={<Described name="Page" detail="Start the next page here." />}
            hint="Ctrl+Enter"
            onClick={() => (close(), editor.chain().focus().setPageBreak().run())}
          />
          <MenuItem
            label={<Described name="Column" detail="Text after this starts in the next column." />}
            hint="Ctrl+Shift+Enter"
            onClick={() => (close(), editor.chain().focus().setColumnBreak().run())}
          />
          <MenuItem
            label={<Described name="Text Wrapping" detail="Start a new line in the same paragraph." />}
            hint="Shift+Enter"
            onClick={() => (close(), editor.chain().focus().setHardBreak().run())}
          />
        </>
      )}
    />
  );
}

function LineNumbersButton({ editor, layout, onLayout }: { editor: Editor; layout: PageLayout; onLayout: OnLayout }) {
  const suppressed = Boolean(editor.state.selection.$from.parent.attrs.noLineNumbers);
  return (
    <MenuButton
      icon={ListOrdered}
      label="Line Numbers"
      showLabel
      title="Line Numbers"
      menu={(close) => (
        <Choices
          more="Line Numbering Options…"
          form={(back) => (
            <LineNumbersForm
              layout={layout}
              onCancel={back}
              onApply={(lineNumbers) => {
                close();
                onLayout({ lineNumbers });
              }}
            />
          )}
        >
          <MenuItem label="None" checked={!layout.lineNumbers} onClick={() => (close(), onLayout({ lineNumbers: null }))} />
          <MenuItem
            label="Continuous"
            checked={Boolean(layout.lineNumbers) && !layout.lineNumbers?.perPage}
            onClick={() => (close(), onLayout({ lineNumbers: { start: 1, countBy: 1, ...layout.lineNumbers, perPage: false } }))}
          />
          <MenuItem
            label="Restart Each Page"
            checked={Boolean(layout.lineNumbers?.perPage)}
            onClick={() => (close(), onLayout({ lineNumbers: { start: 1, countBy: 1, ...layout.lineNumbers, perPage: true } }))}
          />
          <MenuItem
            label="Suppress for Current Paragraph"
            checked={suppressed}
            onClick={() => (close(), editor.chain().focus().setParagraphFormat({ noLineNumbers: !suppressed }).run())}
          />
        </Choices>
      )}
    />
  );
}

function LineNumbersForm({ layout, onApply, onCancel }: { layout: PageLayout; onApply: (n: PageLayout["lineNumbers"]) => void; onCancel: () => void }) {
  const [on, setOn] = useState(true);
  const [start, setStart] = useState(layout.lineNumbers?.start ?? 1);
  const [countBy, setCountBy] = useState(layout.lineNumbers?.countBy ?? 1);
  const [perPage, setPerPage] = useState(layout.lineNumbers?.perPage ?? false);
  return (
    <Form title="Line Numbers" onCancel={onCancel} onApply={() => onApply(on ? { start, countBy, perPage } : null)} ok>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> Add line numbering
      </label>
      <NumberField label="Start at" value={start} min={1} max={32767} step={1} disabled={!on} onChange={setStart} />
      <NumberField label="Count by" value={countBy} min={1} max={100} step={1} disabled={!on} onChange={setCountBy} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={perPage} disabled={!on} onChange={(e) => setPerPage(e.target.checked)} /> Restart each page
      </label>
    </Form>
  );
}

function HyphenationButton({ layout, onLayout }: { layout: PageLayout; onLayout: OnLayout }) {
  return (
    <MenuButton
      icon={Minus}
      label="Hyphenation"
      showLabel
      title="Hyphenation: split long words at the end of a line"
      menu={(close) => (
        <>
          <MenuItem label="None" checked={!layout.hyphenate} onClick={() => (close(), onLayout({ hyphenate: false }))} />
          <MenuItem label="Automatic" checked={layout.hyphenate} onClick={() => (close(), onLayout({ hyphenate: true }))} />
        </>
      )}
    />
  );
}

// ---- Paragraph ----

/** Indents (in cm or inches) and spacing (in points) of the paragraph the cursor is in, as Word shows them. */
function ParagraphGroup({ editor }: { editor: Editor }) {
  const { $from } = editor.state.selection;
  const block = $from.parent;
  const isBlock = block.type.name === "paragraph" || block.type.name === "heading";
  // Spacing that hasn't been set is Docs' usual, which depends on the kind of paragraph: read it off the page.
  const dom = isBlock && $from.depth > 0 ? (editor.view.nodeDOM($from.before()) as HTMLElement | null) : null;
  const css = dom instanceof HTMLElement ? getComputedStyle(dom) : null;
  const before = block.attrs.spaceBefore ?? (css ? parseFloat(css.marginTop) : 0);
  const after = block.attrs.spaceAfter ?? (css ? parseFloat(css.marginBottom) : 0);
  const unit = measureUnit();
  const set = (attrs: Parameters<Editor["commands"]["setParagraphFormat"]>[0]) => editor.chain().focus().setParagraphFormat(attrs).run();

  return (
    <Group label="Paragraph" more={(close) => <ParagraphForm editor={editor} onDone={close} />}>
      <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
        <span className="text-xs font-medium text-slate-600">Indent</span>
        <span className="text-xs font-medium text-slate-600">Spacing</span>
        <Spin
          icon={ArrowRightToLine}
          label="Left"
          value={round(((block.attrs.indent ?? 0) * INDENT_PX) / unit.px)}
          unit={unit.name}
          step={unit.step}
          max={round(MAX_INDENT_PX / unit.px)}
          disabled={!isBlock}
          onSet={(v) => set({ indent: round((v * unit.px) / INDENT_PX) })}
        />
        <Spin
          icon={ArrowUpToLine}
          label="Before"
          value={round(before / PX_PER_PT, 0.5)}
          unit="pt"
          step={6}
          max={1584}
          disabled={!isBlock}
          onSet={(v) => set({ spaceBefore: round(v * PX_PER_PT) })}
        />
        <Spin
          icon={ArrowLeftToLine}
          label="Right"
          value={round((block.attrs.indentRight ?? 0) / unit.px)}
          unit={unit.name}
          step={unit.step}
          max={round(MAX_INDENT_PX / unit.px)}
          disabled={!isBlock}
          onSet={(v) => set({ indentRight: v ? round(v * unit.px) : null })}
        />
        <Spin
          icon={ArrowDownToLine}
          label="After"
          value={round(after / PX_PER_PT, 0.5)}
          unit="pt"
          step={6}
          max={1584}
          disabled={!isBlock}
          onSet={(v) => set({ spaceAfter: round(v * PX_PER_PT) })}
        />
      </div>
    </Group>
  );
}

const LINE_SPACINGS = [
  { value: "1", label: "Single" },
  { value: "1.15", label: "1.15" },
  { value: "1.5", label: "1.5 lines" },
  { value: "2", label: "Double" },
];

/** Paragraph's corner button: alignment, indents, spacing and line spacing, as in Word's dialog. */
function ParagraphForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const { $from } = editor.state.selection;
  const attrs = $from.parent.attrs;
  const dom = $from.depth > 0 ? editor.view.nodeDOM($from.before()) : null;
  const css = dom instanceof HTMLElement ? getComputedStyle(dom) : null;
  const [align, setAlign] = useState<string>(attrs.textAlign ?? "left");
  const [left, setLeft] = useState((attrs.indent ?? 0) * INDENT_PX);
  const [right, setRight] = useState(attrs.indentRight ?? 0);
  const [special, setSpecial] = useState<"none" | "first" | "hanging">(!attrs.firstLine ? "none" : attrs.firstLine > 0 ? "first" : "hanging");
  const [by, setBy] = useState(Math.abs(attrs.firstLine ?? 48));
  const [before, setBefore] = useState(round((attrs.spaceBefore ?? (css ? parseFloat(css.marginTop) : 0)) / PX_PER_PT, 0.5));
  const [after, setAfter] = useState(round((attrs.spaceAfter ?? (css ? parseFloat(css.marginBottom) : 0)) / PX_PER_PT, 0.5));
  const [line, setLine] = useState<string>(attrs.lineHeight ?? "");
  const preset = LINE_SPACINGS.some((l) => l.value === line) ? line : line ? "multiple" : "";
  return (
    <Form
      title="Paragraph"
      cancel="Cancel"
      ok
      onCancel={onDone}
      onApply={() => {
        onDone();
        const chain = editor.chain().focus();
        if (align === "left") chain.unsetTextAlign();
        else chain.setTextAlign(align);
        chain
          .setParagraphFormat({
            indent: round(left / INDENT_PX),
            indentRight: right ? round(right) : null,
            firstLine: special === "none" ? null : special === "first" ? round(by) : -round(by),
            spaceBefore: round(before * PX_PER_PT),
            spaceAfter: round(after * PX_PER_PT),
            lineHeight: line || null,
          })
          .run();
      }}
    >
      <label className="flex items-center justify-between gap-2 text-sm">
        Alignment
        <select value={align} onChange={(e) => setAlign(e.target.value)} className="rounded border border-slate-300 bg-surface px-1.5 py-0.5">
          <option value="left">Left</option>
          <option value="center">Centered</option>
          <option value="right">Right</option>
          <option value="justify">Justified</option>
        </select>
      </label>
      <Heading>Indentation</Heading>
      <div className="flex flex-col gap-1.5 px-2">
        <LengthField label="Left" px={left} min={0} max={MAX_INDENT_PX} onChange={setLeft} />
        <LengthField label="Right" px={right} min={0} max={MAX_INDENT_PX} onChange={setRight} />
        <label className="flex items-center justify-between gap-2 text-sm">
          Special
          <select value={special} onChange={(e) => setSpecial(e.target.value as typeof special)} className="rounded border border-slate-300 bg-surface px-1.5 py-0.5">
            <option value="none">(none)</option>
            <option value="first">First line</option>
            <option value="hanging">Hanging</option>
          </select>
        </label>
        {special !== "none" && <LengthField label="By" px={by} min={0} max={MAX_INDENT_PX} onChange={setBy} />}
      </div>
      <Heading>Spacing</Heading>
      <div className="flex flex-col gap-1.5 px-2">
        <NumberField label="Before" suffix="pt" value={before} min={0} max={1584} step={6} onChange={setBefore} />
        <NumberField label="After" suffix="pt" value={after} min={0} max={1584} step={6} onChange={setAfter} />
        <label className="flex items-center justify-between gap-2 text-sm">
          Line spacing
          <select
            value={preset}
            onChange={(e) => setLine(e.target.value === "multiple" ? "3" : e.target.value)}
            className="rounded border border-slate-300 bg-surface px-1.5 py-0.5"
          >
            <option value="">Document&apos;s usual</option>
            {LINE_SPACINGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
            <option value="multiple">Multiple</option>
          </select>
        </label>
        {preset === "multiple" && (
          <NumberField label="At" value={Number(line) || 3} min={0.5} max={10} step={0.25} onChange={(v) => setLine(String(v))} />
        )}
      </div>
    </Form>
  );
}

/** A number box with ▲▼ beside it, like Word's; the change is made on Enter, on leaving the box, or on each click of an arrow. */
function Spin(p: { icon: LucideIcon; label: string; value: number; unit: string; step: number; max: number; disabled?: boolean; onSet: (v: number) => void }) {
  const text = String(+p.value.toFixed(2));
  // The key starts the box afresh whenever the value changes elsewhere (the cursor moved, say).
  return <SpinBox key={`${p.label}${text}`} {...p} text={text} />;
}

function SpinBox(p: Parameters<typeof Spin>[0] & { text: string }) {
  const [text, setText] = useState(p.text);
  const clampTo = (v: number) => Math.min(p.max, Math.max(0, Math.round(v * 100) / 100));
  const commit = (v = parseFloat(text)) => {
    if (Number.isFinite(v) && clampTo(v) !== p.value) p.onSet(clampTo(v));
    else setText(p.text);
  };
  const nudge = (dir: 1 | -1) => commit(Math.round(p.value / p.step) * p.step + dir * p.step);
  return (
    <label className="flex items-center gap-1 text-xs" title={`${p.label} (${p.unit})`}>
      <p.icon size={14} className="text-slate-600" />
      <span className="w-9 text-slate-600">{p.label}:</span>
      <span className="flex items-stretch rounded border border-slate-300 bg-surface">
        <input
          inputMode="decimal"
          value={text}
          disabled={p.disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            const step = { Enter: 0, ArrowUp: 1, ArrowDown: -1 }[e.key];
            if (step === undefined) return;
            e.preventDefault();
            if (step) nudge(step as 1 | -1);
            else commit();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label={`${p.label} in ${p.unit === "pt" ? "points" : p.unit === "cm" ? "centimetres" : "inches"}`}
          className="w-11 bg-transparent px-1 py-0.5 text-right select-text disabled:opacity-40"
        />
        <span className="flex items-center pr-1 text-slate-500">{p.unit}</span>
        <span className="flex flex-col border-l border-slate-300">
          <SpinArrow icon={ChevronUp} label={`More ${p.label.toLowerCase()}`} disabled={p.disabled} onClick={() => nudge(1)} />
          <SpinArrow icon={ChevronDown} label={`Less ${p.label.toLowerCase()}`} disabled={p.disabled} onClick={() => nudge(-1)} />
        </span>
      </span>
    </label>
  );
}

const SpinArrow = (p: { icon: LucideIcon; label: string; disabled?: boolean; onClick: () => void }) => (
  <button
    type="button"
    aria-label={p.label}
    tabIndex={-1}
    disabled={p.disabled}
    onMouseDown={keepFocus}
    onClick={p.onClick}
    className="flex h-[11px] w-4 items-center justify-center hover:bg-slate-200 disabled:opacity-40"
  >
    <p.icon size={10} />
  </button>
);

// ---- Arrange ----

export type Restack = "forward" | "front" | "inFront" | "backward" | "back" | "behind";

/** Moves the selected picture up or down the pile of pictures that aren't in line with the text. */
export function restack(editor: Editor, how: Restack) {
  const { wrap, z = 0 } = editor.getAttributes("image");
  if (how === "inFront" || how === "behind") {
    editor.chain().focus().updateAttributes("image", { wrap: how === "inFront" ? "front" : "behind" }).run();
    return;
  }
  const others: number[] = [];
  const selected = editor.state.selection.from;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "image" && node.attrs.wrap === wrap && pos !== selected) others.push(node.attrs.z ?? 0);
  });
  const next =
    how === "forward" ? z + 1 : how === "backward" ? z - 1 : how === "front" ? Math.max(z, ...others) + 1 : Math.min(z, ...others) - 1;
  editor.chain().focus().updateAttributes("image", { z: next }).run();
}

/** Wrap Text, Bring Forward, Send Backward and Rotate, for whichever picture or shape is selected. */
export function ArrangeButtons({ editor }: { editor: Editor }) {
  const picture = editor.isActive("image");
  const { wrap = "inline", shape: shapeAttr } = picture ? editor.getAttributes("image") : {};
  const floating = picture && wrap !== "inline";
  const shape = picture ? readShape(shapeAttr) : null;
  const pick = (close: () => void, how: Restack) => () => (close(), restack(editor, how));
  return (
    <>
      <WrapTextButton editor={editor} disabled={!picture} />
      <MenuButton
        big
        icon={BringToFront}
        label={"Bring\nForward"}
        title="Bring Forward"
        disabled={!floating}
        menu={(close) => (
          <>
            <MenuItem label="Bring Forward" onClick={pick(close, "forward")} />
            <MenuItem label="Bring to Front" onClick={pick(close, "front")} />
            {wrap === "behind" && <MenuItem label="Bring in Front of Text" onClick={pick(close, "inFront")} />}
          </>
        )}
      />
      <MenuButton
        big
        icon={SendToBack}
        label={"Send\nBackward"}
        title="Send Backward"
        disabled={!floating}
        menu={(close) => (
          <>
            <MenuItem label="Send Backward" onClick={pick(close, "backward")} />
            <MenuItem label="Send to Back" onClick={pick(close, "back")} />
            {wrap === "front" && <MenuItem label="Send Behind Text" onClick={pick(close, "behind")} />}
          </>
        )}
      />
      <MenuButton
        big
        icon={RotateCw}
        label={"Rotate\n"}
        title={shape ? "Rotate" : "Rotate (select a shape)"}
        disabled={!shape}
        menu={(close) => {
          const flip = (patch: { flipV?: boolean; flipH?: boolean }) => {
            close();
            editor.chain().focus().updateAttributes("image", { shape: { ...shape, ...patch } }).run();
          };
          return (
            <>
              <MenuItem icon={FlipVertical2} label="Flip Vertical" onClick={() => flip({ flipV: !shape?.flipV })} />
              <MenuItem icon={FlipHorizontal2} label="Flip Horizontal" onClick={() => flip({ flipH: !shape?.flipH })} />
            </>
          );
        }}
      />
    </>
  );
}

// ---- Small parts of the menus ----

export const Heading = ({ children }: { children: ReactNode }) => <p className="px-2 pt-1 pb-1 text-xs font-semibold text-slate-500">{children}</p>;

/** A menu choice's name, with what it means underneath in small type. */
const Described = ({ name, detail }: { name: string; detail: string }) => (
  <span className="flex flex-col">
    <span className="font-medium">{name}</span>
    <span className="text-xs whitespace-pre text-slate-500">{detail}</span>
  </span>
);

/** A list of choices that ends in "More…", which swaps the list for a small form. */
export function Choices({ children, more, form }: { children: ReactNode; more: string; form: (back: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  if (open) return form(() => setOpen(false));
  return (
    <>
      {children}
      <div className="my-1 border-t border-slate-200" />
      <MenuItem label={more} onClick={() => setOpen(true)} />
    </>
  );
}

export function Form(p: { title: string; children: ReactNode; ok: boolean; problem?: string; cancel?: string; onApply: () => void; onCancel: () => void }) {
  return (
    <form
      // The forms check their own values: the browser's checks would quietly refuse, say, 7pt in a box that steps by 6.
      noValidate
      className="flex w-64 flex-col gap-2 p-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (p.ok) p.onApply();
      }}
    >
      <h3 className="text-sm font-semibold">{p.title}</h3>
      {p.children}
      {!p.ok && p.problem && <p className="text-xs text-red-600">{p.problem}</p>}
      <div className="mt-1 flex justify-end gap-2">
        <button type="button" onClick={p.onCancel} className="rounded px-3 py-1 text-sm hover:bg-slate-100">
          {p.cancel ?? "Back"}
        </button>
        <button type="submit" disabled={!p.ok} className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
          OK
        </button>
      </div>
    </form>
  );
}

/** A length in cm or inches; `px` is what it stands for on the page. */
function LengthField(p: { label: string; px: number; min: number; max: number; onChange: (px: number) => void }) {
  const unit = measureUnit();
  return (
    <NumberField
      label={p.label}
      suffix={unit.name}
      value={+round(p.px / unit.px).toFixed(2)}
      min={round(p.min / unit.px)}
      max={round(p.max / unit.px)}
      step={unit.step}
      onChange={(v) => p.onChange(v * unit.px)}
    />
  );
}

function NumberField(p: { label: string; value: number; min: number; max: number; step: number; suffix?: string; disabled?: boolean; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(p.value));
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      {p.label}
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={text}
          min={p.min}
          max={p.max}
          step={p.step}
          disabled={p.disabled}
          onChange={(e) => {
            setText(e.target.value);
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) p.onChange(Math.min(p.max, Math.max(p.min, v)));
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-20 rounded border border-slate-300 bg-surface px-1.5 py-0.5 select-text disabled:opacity-40"
        />
        {p.suffix && <span className="w-5 text-xs text-slate-500">{p.suffix}</span>}
      </span>
    </label>
  );
}

/** For Backstage: "A4, portrait, normal margins, two columns". */
export function describeLayout(layout: PageLayout) {
  const size = sizeOf(layout)?.label ?? `${shown(layout.width)} × ${shown(layout.height)}`;
  const margins = marginsOf(layout)?.label.toLowerCase() ?? "custom";
  const columns = layout.columns > 1 ? `, ${["", "", "two", "three", "four"][layout.columns]} columns` : "";
  return `${size}, ${layout.orientation}, ${margins} margins${columns}`;
}
