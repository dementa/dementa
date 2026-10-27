"use client";

// Word's Design tab. Document Formatting: themes, the style set gallery, colours, fonts, paragraph
// spacing and Set as Default. Page Background: watermark, page colour and page borders. The look
// itself is in design.ts.

import { ChevronDown, ChevronsDown, ChevronUp, Droplet, FileText, PaintBucket, Sparkles, Square, Type, type LucideIcon } from "lucide-react";
import { useState } from "react";
import {
  DEFAULT_DESIGN,
  DEFAULT_WATERMARK,
  designCss,
  effectFilter,
  EFFECTS,
  tint,
  FONT_PAIRS,
  fontStack,
  PALETTES,
  setDefaultDesign,
  SPACINGS,
  STYLE_SETS,
  THEMES,
  WATERMARKS,
  type BorderStyle,
  type DocDesign,
  type PageBorder,
  type Palette,
  type Watermark,
} from "../design";
import type { PageLayout } from "../layout";
import { ColourPicker } from "./ColourPicker";
import { Choices, Form, Heading } from "./LayoutTab";
import { Drop, Group, keepFocus, MenuButton, MenuItem, Stack } from "./parts";

type OnDesign = (patch: Partial<DocDesign>) => void;

export function DesignTab({ layout, onLayout }: { layout: PageLayout; onLayout: (patch: Partial<PageLayout>) => void }) {
  const design = layout.design;
  const onDesign: OnDesign = (patch) => onLayout({ design: { ...design, ...patch } });
  const [saved, setSaved] = useState(false);
  return (
    <>
      <Group label="Document Formatting">
        <ThemesButton design={design} onDesign={onDesign} />
        <StyleSetGallery design={design} onDesign={onDesign} />
        <ColorsButton design={design} onDesign={onDesign} />
        <FontsButton design={design} onDesign={onDesign} />
        <Stack>
          <SpacingButton design={design} onDesign={onDesign} />
          <EffectsButton design={design} onDesign={onDesign} />
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={() => {
              setDefaultDesign(design);
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }}
            title="New documents start with this look"
            className="flex h-7 items-center gap-1 rounded px-1 text-xs hover:bg-slate-200/70"
          >
            <FileText size={16} /> {saved ? "Saved as default" : "Set as Default"}
          </button>
        </Stack>
      </Group>
      <Group label="Page Background">
        <WatermarkButton design={design} onDesign={onDesign} />
        <MenuButton
          big
          icon={PaintBucket}
          label={"Page\nColor"}
          menu={(close) => (
            <ColourPicker
              current={design.pageColor}
              noneLabel="No Color"
              onPick={(pageColor) => {
                close();
                onDesign({ pageColor });
              }}
            />
          )}
        />
        <PageBordersButton design={design} onDesign={onDesign} />
      </Group>
    </>
  );
}

// ---- Themes ----

/** Word's theme tile: "Aa" in the theme's heading font over its first accents. */
function ThemeTile({ palette, font, name, selected, onClick }: { palette: Palette; font: string; name: string; selected?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={keepFocus}
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-[76px] flex-col items-center gap-1 rounded border p-1 text-[11px] ${selected ? "border-blue-500 bg-blue-50" : "border-transparent hover:bg-slate-100"}`}
    >
      <span className="flex h-12 w-full flex-col overflow-hidden rounded-sm bg-white ring-1 ring-slate-200">
        <span className="flex-1 pt-1 text-center text-lg leading-none text-slate-800" style={{ fontFamily: fontStack(font) || undefined }}>
          Aa
        </span>
        <span className="flex h-2">
          {palette.accents.slice(0, 4).map((c, i) => (
            <span key={i} className="flex-1" style={{ background: c }} />
          ))}
        </span>
      </span>
      <span className="w-full truncate text-center">{name}</span>
    </button>
  );
}

function ThemesButton({ design, onDesign }: { design: DocDesign; onDesign: OnDesign }) {
  return (
    <MenuButton
      big
      icon={ThemesIcon}
      label="Themes"
      menu={(close) => (
        <div className="w-[340px]">
          <Heading>Office</Heading>
          <div className="grid grid-cols-4 gap-1 px-1">
            {THEMES.map((t) => (
              <ThemeTile
                key={t.id}
                palette={PALETTES.find((p) => p.id === t.colors)!}
                font={FONT_PAIRS.find((f) => f.id === t.fonts)!.heading}
                name={t.name}
                selected={design.theme === t.id && design.colors === t.colors && design.fonts === t.fonts}
                onClick={() => {
                  close();
                  onDesign({ theme: t.id, colors: t.colors, fonts: t.fonts });
                }}
              />
            ))}
          </div>
          <div className="my-1 border-t border-slate-200" />
          <MenuItem
            label="Reset to Docs' Theme"
            onClick={() => {
              close();
              onDesign({ theme: DEFAULT_DESIGN.theme, colors: DEFAULT_DESIGN.colors, fonts: DEFAULT_DESIGN.fonts });
            }}
          />
        </div>
      )}
    />
  );
}

/** Word's Themes icon: "Aa" over colours. */
function ThemesIcon({ size = 24 }: { size?: number }) {
  return (
    <span aria-hidden className="relative flex flex-col items-center justify-end" style={{ width: size, height: size }}>
      <span className="font-serif leading-none" style={{ fontSize: size * 0.62 }}>
        Aa
      </span>
      <span className="flex h-[3px] w-full">
        {PALETTES[0].accents.slice(0, 4).map((c) => (
          <span key={c} className="flex-1" style={{ background: c }} />
        ))}
      </span>
    </span>
  );
}

// ---- Style sets ----

/** A small page showing how a style set looks: a title, a heading and some text. */
function StyleSetPreview({ design, id }: { design: DocDesign; id: string }) {
  const scope = `ds-preview-${id}`;
  return (
    <span className="block h-full w-full overflow-hidden bg-white">
      <style>{designCss({ ...design, styleSet: id }, `.${scope}`)}</style>
      {/* Drawn at full size, then shrunk, so it looks like the page */}
      <span className={`docs-page ${scope} block w-[300px] p-3 text-left text-slate-900`} style={{ zoom: 0.23, fontSize: 16 }}>
        <p data-style="title" style={{ margin: "0 0 0.2em" }}>
          Title
        </p>
        <h1 style={{ marginTop: 0 }}>Heading 1</h1>
        <p>On the Insert tab, the galleries include items that are designed to fit with the look of your document.</p>
      </span>
    </span>
  );
}

const SHOWN = 5;

function StyleSetGallery({ design, onDesign }: { design: DocDesign; onDesign: OnDesign }) {
  const [page, setPage] = useState(0);
  const [all, setAll] = useState(false);
  const pages = Math.ceil(STYLE_SETS.length / SHOWN);
  const tile = (id: string, name: string, close?: () => void) => (
    <button
      key={id}
      type="button"
      title={name}
      aria-pressed={design.styleSet === id}
      onMouseDown={keepFocus}
      onClick={() => {
        close?.();
        onDesign({ styleSet: id });
      }}
      className={`flex h-[60px] w-[58px] flex-col overflow-hidden rounded border ${design.styleSet === id ? "border-blue-500" : "border-slate-200 hover:border-slate-400"}`}
    >
      <span className="min-h-0 flex-1">
        <StyleSetPreview design={design} id={id} />
      </span>
      {close && <span className="truncate bg-slate-50 px-0.5 text-[9px] text-slate-600">{name}</span>}
    </button>
  );
  return (
    <div className="relative flex self-stretch rounded border border-slate-200 bg-slate-100">
      <div className="flex items-center gap-1 p-1">{STYLE_SETS.slice(page * SHOWN, page * SHOWN + SHOWN).map((s) => tile(s.id, s.name))}</div>
      <div className="flex flex-col border-l border-slate-200">
        <Arrow icon={ChevronUp} label="Previous style sets" disabled={page === 0} onClick={() => setPage((n) => n - 1)} />
        <Arrow icon={ChevronDown} label="More style sets" disabled={page >= pages - 1} onClick={() => setPage((n) => n + 1)} />
        <Arrow icon={ChevronsDown} label="All style sets" onClick={() => setAll((o) => !o)} />
      </div>
      <Drop open={all} onClose={() => setAll(false)}>
        <Heading>Built-In</Heading>
        <div className="grid grid-cols-5 gap-1.5 px-1 pb-1">{STYLE_SETS.map((s) => tile(s.id, s.name, () => setAll(false)))}</div>
        <div className="my-1 border-t border-slate-200" />
        <MenuItem
          label="Reset to the Default Style Set"
          onClick={() => {
            setAll(false);
            onDesign({ styleSet: DEFAULT_DESIGN.styleSet, spacing: DEFAULT_DESIGN.spacing });
          }}
        />
      </Drop>
    </div>
  );
}

function Arrow(p: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={p.label}
      aria-label={p.label}
      disabled={p.disabled}
      onMouseDown={keepFocus}
      onClick={p.onClick}
      className="flex w-4 flex-1 items-center justify-center hover:bg-slate-200 disabled:opacity-30"
    >
      <p.icon size={11} />
    </button>
  );
}

// ---- Colours, fonts, paragraph spacing ----

function ColorsButton({ design, onDesign }: { design: DocDesign; onDesign: OnDesign }) {
  return (
    <MenuButton
      big
      icon={Droplet}
      label="Colors"
      title="Colors: the document's theme colours"
      menu={(close) => (
        <div className="w-64">
          <Heading>Office</Heading>
          {PALETTES.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={keepFocus}
              onClick={() => {
                close();
                onDesign({ colors: p.id });
              }}
              className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-slate-100 ${design.colors === p.id ? "bg-blue-50" : ""}`}
            >
              <span className="flex shrink-0">
                {[p.dark2, p.light2, ...p.accents].map((c, i) => (
                  <span key={i} className="h-4 w-2.5 ring-1 ring-black/5" style={{ background: c }} />
                ))}
              </span>
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    />
  );
}

function FontsButton({ design, onDesign }: { design: DocDesign; onDesign: OnDesign }) {
  return (
    <MenuButton
      big
      icon={Type}
      label="Fonts"
      title="Fonts: the document's heading and body fonts"
      menu={(close) => (
        <div className="w-64">
          <Heading>Office</Heading>
          {FONT_PAIRS.map((f) => (
            <button
              key={f.id}
              type="button"
              onMouseDown={keepFocus}
              onClick={() => {
                close();
                onDesign({ fonts: f.id });
              }}
              className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-slate-100 ${design.fonts === f.id ? "bg-blue-50" : ""}`}
            >
              <span className="w-8 shrink-0 text-xl leading-none" style={{ fontFamily: fontStack(f.heading) || undefined }}>
                Aa
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-xs text-slate-500">{f.name}</span>
                <span className="block truncate text-sm" style={{ fontFamily: fontStack(f.heading) || undefined }}>
                  {f.heading || "Docs' usual font"}
                </span>
                {f.body !== f.heading && (
                  <span className="block truncate text-xs" style={{ fontFamily: fontStack(f.body) || undefined }}>
                    {f.body}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    />
  );
}

function SpacingButton({ design, onDesign }: { design: DocDesign; onDesign: OnDesign }) {
  return (
    <MenuButton
      icon={SpacingIcon}
      label="Paragraph Spacing"
      showLabel
      menu={(close) => (
        <div className="w-60">
          <MenuItem
            label="Default"
            hint="Style set"
            checked={design.spacing === "default"}
            onClick={() => (close(), onDesign({ spacing: "default" }))}
          />
          <Heading>Built-In</Heading>
          {SPACINGS.slice(1).map((s) => (
            <MenuItem
              key={s.id}
              label={s.name}
              hint={`${s.line} lines, ${s.after}pt after`}
              checked={design.spacing === s.id}
              onClick={() => (close(), onDesign({ spacing: s.id }))}
            />
          ))}
        </div>
      )}
    />
  );
}

function EffectsButton({ design, onDesign }: { design: DocDesign; onDesign: OnDesign }) {
  const palette = PALETTES.find((p) => p.id === design.colors) ?? PALETTES[0];
  return (
    <MenuButton
      icon={Sparkles}
      label="Effects"
      showLabel
      title="Effects: shadows and glows on the document's shapes"
      menu={(close) => (
        <div className="w-64">
          <Heading>Office</Heading>
          <div className="grid grid-cols-3 gap-2 px-2 pb-2">
            {EFFECTS.map((e) => (
              <button
                key={e.id}
                type="button"
                title={e.name}
                aria-pressed={design.effects === e.id}
                onMouseDown={keepFocus}
                onClick={() => (close(), onDesign({ effects: e.id }))}
                className={`flex flex-col items-center gap-1 rounded border p-1 text-[11px] ${design.effects === e.id ? "border-blue-500 bg-blue-50" : "border-transparent hover:bg-slate-100"}`}
              >
                {/* A small shape, drawn with the effect */}
                <svg width="44" height="34" viewBox="-6 -6 56 46" aria-hidden>
                  <defs dangerouslySetInnerHTML={{ __html: effectFilter(e.id, palette, `fx-${e.id}`) }} />
                  <g filter={e.id === "office" ? undefined : `url(#fx-${e.id})`}>
                    <rect x="2" y="2" width="40" height="30" rx="4" fill={palette.accents[0]} stroke={tint(palette.accents[0], -0.25)} />
                  </g>
                </svg>
                <span className="w-full truncate text-center">{e.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    />
  );
}

function SpacingIcon({ size = 16 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M6 3h8M6 6h8M6 10h8M6 13h8M2.5 4v8M1 5.5l1.5-1.5L4 5.5M1 10.5L2.5 12 4 10.5" />
    </svg>
  );
}

// ---- Watermark ----

/** A tiny page with the watermark across it. */
function WatermarkTile({ mark, onClick }: { mark: Watermark; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={keepFocus}
      onClick={onClick}
      title={mark.text}
      className="flex h-[84px] w-[60px] items-center justify-center overflow-hidden rounded-sm bg-white ring-1 ring-slate-300 hover:ring-2 hover:ring-blue-400"
    >
      <span
        className="whitespace-nowrap"
        style={{
          fontFamily: `"${mark.font}", sans-serif`,
          // Across the tile, corner to corner when diagonal.
          fontSize: Math.min(14, (mark.diagonal ? 84 : 54) / (mark.text.length * 0.62)),
          color: mark.color,
          opacity: mark.faint ? 0.6 : 1,
          transform: mark.diagonal ? "rotate(-45deg)" : undefined,
        }}
      >
        {mark.text}
      </span>
    </button>
  );
}

function WatermarkButton({ design, onDesign }: { design: DocDesign; onDesign: OnDesign }) {
  return (
    <MenuButton
      big
      icon={WatermarkIcon}
      label="Watermark"
      menu={(close) => (
        <Choices
          more="Custom Watermark…"
          form={(back) => (
            <WatermarkForm
              mark={design.watermark ?? DEFAULT_WATERMARK}
              onCancel={back}
              onApply={(watermark) => {
                close();
                onDesign({ watermark });
              }}
            />
          )}
        >
          <div className="w-[290px]">
            {[...new Set(WATERMARKS.map((w) => w.group))].map((group) => (
              <div key={group}>
                <Heading>{group}</Heading>
                <div className="flex flex-wrap gap-2 px-2 pb-1">
                  {WATERMARKS.filter((w) => w.group === group).flatMap((w) =>
                    [true, false].map((diagonal) => {
                      const mark = { ...DEFAULT_WATERMARK, text: w.text, diagonal };
                      return (
                        <WatermarkTile
                          key={`${w.text}-${diagonal}`}
                          mark={mark}
                          onClick={() => {
                            close();
                            onDesign({ watermark: mark });
                          }}
                        />
                      );
                    }),
                  )}
                </div>
              </div>
            ))}
            <div className="my-1 border-t border-slate-200" />
            <MenuItem label="Remove Watermark" onClick={() => (close(), onDesign({ watermark: null }))} />
          </div>
        </Choices>
      )}
    />
  );
}

function WatermarkIcon({ size = 24 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5 2.5h10l4 4v15H5z" />
      <path d="M8 17l8-8" strokeWidth="2.5" opacity="0.45" />
    </svg>
  );
}

const WATERMARK_FONTS = ["Calibri", "Arial", "Times New Roman", "Georgia", "Verdana", "Courier New", "Segoe UI"];

function WatermarkForm({ mark, onApply, onCancel }: { mark: Watermark; onApply: (w: Watermark) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(mark);
  const set = (patch: Partial<Watermark>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <Form title="Text Watermark" ok={draft.text.trim().length > 0} problem="Type the watermark's text." onCancel={onCancel} onApply={() => onApply({ ...draft, text: draft.text.trim() })}>
      <label className="flex flex-col gap-1 text-sm">
        Text
        <input
          autoFocus
          value={draft.text}
          maxLength={60}
          onChange={(e) => set({ text: e.target.value })}
          className="rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <label className="flex items-center justify-between gap-2 text-sm">
        Font
        <select value={draft.font} onChange={(e) => set({ font: e.target.value })} className="rounded border border-slate-300 px-1 py-0.5">
          {WATERMARK_FONTS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2 text-sm">
        Color
        <input type="color" value={draft.color} onChange={(e) => set({ color: e.target.value })} className="h-7 w-12 rounded border border-slate-300" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.faint} onChange={(e) => set({ faint: e.target.checked })} /> Semitransparent
      </label>
      <fieldset className="flex items-center gap-3 text-sm">
        <legend className="sr-only">Layout</legend>
        <label className="flex items-center gap-1">
          <input type="radio" checked={draft.diagonal} onChange={() => set({ diagonal: true })} /> Diagonal
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={!draft.diagonal} onChange={() => set({ diagonal: false })} /> Horizontal
        </label>
      </fieldset>
    </Form>
  );
}

// ---- Page borders ----

const BORDER_STYLES: { style: BorderStyle; label: string }[] = [
  { style: "solid", label: "Single" },
  { style: "double", label: "Double" },
  { style: "dotted", label: "Dotted" },
  { style: "dashed", label: "Dashed" },
];

/** Word's border widths, in points. */
const BORDER_WIDTHS = [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6];

function PageBordersButton({ design, onDesign }: { design: DocDesign; onDesign: OnDesign }) {
  return (
    <MenuButton
      big
      arrow={false}
      icon={Square}
      label={"Page\nBorders"}
      align="right"
      menu={(close) => (
        <PageBordersForm
          border={design.pageBorder}
          onCancel={close}
          onApply={(pageBorder) => {
            close();
            onDesign({ pageBorder });
          }}
        />
      )}
    />
  );
}

function PageBordersForm({ border, onApply, onCancel }: { border: PageBorder | null; onApply: (b: PageBorder | null) => void; onCancel: () => void }) {
  const [on, setOn] = useState(border !== null);
  const [draft, setDraft] = useState<PageBorder>(border ?? { style: "solid", width: 1, color: "#000000" });
  const set = (patch: Partial<PageBorder>) => {
    setOn(true);
    setDraft((d) => ({ ...d, ...patch }));
  };
  return (
    <Form title="Page Borders" ok onCancel={onCancel} onApply={() => onApply(on ? draft : null)}>
      <div className="flex gap-3">
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-slate-500">Setting</span>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={!on} onChange={() => setOn(false)} /> None
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={on} onChange={() => setOn(true)} /> Box
          </label>
        </div>
        {/* Preview */}
        <div className="flex h-24 flex-1 items-center justify-center rounded bg-slate-100">
          <div className="relative h-20 w-14 bg-white shadow-sm">
            {on && <div className="absolute inset-1.5" style={{ border: `${Math.max(1, draft.width * 0.6)}px ${draft.style} ${draft.color}` }} />}
          </div>
        </div>
      </div>
      <label className="flex items-center justify-between gap-2 text-sm">
        Style
        <select value={draft.style} onChange={(e) => set({ style: e.target.value as BorderStyle })} className="rounded border border-slate-300 px-1 py-0.5">
          {BORDER_STYLES.map((b) => (
            <option key={b.style} value={b.style}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2 text-sm">
        Color
        <input type="color" value={draft.color} onChange={(e) => set({ color: e.target.value })} className="h-7 w-12 rounded border border-slate-300" />
      </label>
      <label className="flex items-center justify-between gap-2 text-sm">
        Width
        <select value={draft.width} onChange={(e) => set({ width: Number(e.target.value) })} className="rounded border border-slate-300 px-1 py-0.5">
          {BORDER_WIDTHS.map((w) => (
            <option key={w} value={w}>
              {w} pt
            </option>
          ))}
        </select>
      </label>
    </Form>
  );
}
