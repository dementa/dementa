"use client";

// The rest of Word's Arrange group: Position (a picture at one of nine places on its page), Align
// (to the margins), Group, and the Selection Pane (every picture and shape in the document).

import type { Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Group as GroupIcon,
  Layers,
  SquareDashed,
  Ungroup,
} from "lucide-react";
import { groupable, groupPictures, selectedGroup, ungroupPictures } from "../multiSelect";
import { pageBox, type PageLayout } from "../layout";
import { PAGE_GAP } from "../pagination";
import { readShape, SHAPE_GROUPS } from "../shapes";
import { keepFocus, MenuButton, MenuItem } from "./parts";
import { setPicture, shownSize } from "./PictureTab";
import { Heading } from "./LayoutTab";

/** Where on the page: 0 is the left (or top) margin, 0.5 the middle, 1 the right (or bottom) margin. */
interface Spot {
  x?: number;
  y?: number;
}

/**
 * Moves the selected picture, which floats over the text, to a spot between its page's margins.
 * Its position is kept from where it's anchored in the text, so that's measured first.
 */
function moveTo(editor: Editor, layout: PageLayout, spot: Spot) {
  const pos = editor.state.selection.from;
  const anchor = editor.view.nodeDOM(pos);
  const sheet = editor.view.dom.closest<HTMLElement>(".docs-sheet");
  if (!(anchor instanceof HTMLElement) || !sheet) return;
  const origin = sheet.getBoundingClientRect();
  const scale = origin.width / sheet.offsetWidth || 1;
  const at = anchor.getBoundingClientRect();
  const text = editor.view.dom.getBoundingClientRect();
  const ax = (at.left - origin.left) / scale;
  const ay = (at.top - origin.top) / scale;
  const left = (text.left - origin.left) / scale;
  const width = text.width / scale;
  const page = pageBox(layout).h;
  // While the text is in columns there's one long page; the picture goes on its first screenful.
  const index = layout.columns === 1 ? Math.floor(ay / (page + PAGE_GAP)) : 0;
  const top = index * (page + PAGE_GAP) + layout.margins.top;
  const height = page - layout.margins.top - layout.margins.bottom;
  const { w, h } = shownSize(editor);
  const { x, y } = editor.getAttributes("image");
  setPicture(editor, {
    x: spot.x === undefined ? x : Math.round(left + spot.x * (width - w) - ax),
    y: spot.y === undefined ? y : Math.round(top + spot.y * (height - h) - ay),
  });
}

/** Floats the selected picture in front of the text (if it's in the text's flow), then moves it. */
function place(editor: Editor, layout: PageLayout, spot: Spot) {
  const { wrap = "inline" } = editor.getAttributes("image");
  if (wrap === "front" || wrap === "behind") return moveTo(editor, layout, spot);
  const { w, h } = shownSize(editor);
  setPicture(editor, { wrap: "front", x: 0, y: 0, width: w, height: h });
  // Once it's floating, its anchor is where it was in the text.
  requestAnimationFrame(() => moveTo(editor, layout, spot));
}

const SPOTS: { name: string; x: number; y: number }[] = [0, 0.5, 1].flatMap((y) =>
  [0, 0.5, 1].map((x) => ({
    name: `${["Top", "Middle", "Bottom"][y * 2]} ${["Left", "Center", "Right"][x * 2]}`,
    x,
    y,
  })),
);

/** A small page with a picture at one of the nine spots. */
function SpotTile({ x, y, name, onClick }: { x: number; y: number; name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={`Position in ${name}`}
      onMouseDown={keepFocus}
      onClick={onClick}
      className="relative h-14 w-11 rounded-sm bg-white ring-1 ring-slate-300 hover:ring-2 hover:ring-blue-400"
    >
      {/* Lines of text */}
      <span className="absolute inset-x-1.5 top-1.5 bottom-1.5 bg-[repeating-linear-gradient(transparent_0_3px,#cbd5e1_3px_4px)]" />
      <span className="absolute h-3.5 w-3.5 bg-blue-500" style={{ left: `calc(6px + ${x} * (100% - 26px))`, top: `calc(6px + ${y} * (100% - 26px))` }} />
    </button>
  );
}

export function PositionButton({ editor, layout }: { editor: Editor; layout: PageLayout }) {
  const picture = editor.isActive("image");
  return (
    <MenuButton
      big
      icon={SquareDashed}
      label="Position"
      disabled={!picture}
      title={picture ? "Position" : "Position (select a picture or shape)"}
      menu={(close) => (
        <div className="w-44">
          <Heading>In Line with Text</Heading>
          <MenuItem label="In Line with Text" checked={editor.getAttributes("image").wrap === "inline"} onClick={() => (close(), setPicture(editor, { wrap: "inline", x: 0, y: 0, z: 0 }))} />
          <Heading>With Text Wrapping</Heading>
          <div className="grid grid-cols-3 gap-2 px-2 pb-2">
            {SPOTS.map((s) => (
              <SpotTile key={s.name} {...s} onClick={() => (close(), place(editor, layout, s))} />
            ))}
          </div>
        </div>
      )}
    />
  );
}

export function AlignButton({ editor, layout }: { editor: Editor; layout: PageLayout }) {
  const { wrap = "inline" } = editor.isActive("image") ? editor.getAttributes("image") : {};
  const floating = editor.isActive("image") && wrap !== "inline";
  // Text flows around it: it can only go to a side (or, on its own line, the middle).
  const flows = wrap === "square" || wrap === "topBottom";
  const align = (close: () => void, spot: Spot) => () => {
    close();
    if (!flows) return moveTo(editor, layout, spot);
    if (spot.x !== undefined) setPicture(editor, { side: spot.x === 0 ? "left" : spot.x === 1 ? "right" : "center" });
  };
  return (
    <MenuButton
      icon={AlignStartVertical}
      label="Align"
      showLabel
      disabled={!floating}
      title={floating ? "Align" : "Align (select a picture or shape that isn't in line with the text)"}
      menu={(close) => (
        <>
          <MenuItem icon={AlignStartVertical} label="Align Left" onClick={align(close, { x: 0 })} />
          <MenuItem icon={AlignCenterVertical} label="Align Center" onClick={align(close, { x: 0.5 })} />
          <MenuItem icon={AlignEndVertical} label="Align Right" onClick={align(close, { x: 1 })} />
          <div className="my-1 border-t border-slate-200" />
          <MenuItem icon={AlignStartHorizontal} label="Align Top" onClick={align(close, { y: 0 })} />
          <MenuItem icon={AlignCenterHorizontal} label="Align Middle" onClick={align(close, { y: 0.5 })} />
          <MenuItem icon={AlignEndHorizontal} label="Align Bottom" onClick={align(close, { y: 1 })} />
          <div className="my-1 border-t border-slate-200" />
          <MenuItem label="Align to Margin" checked onClick={close} />
        </>
      )}
    />
  );
}

/** Group: joins pictures in front of or behind the text (selected with Shift+click) so they move as one. */
export function GroupButton({ editor }: { editor: Editor }) {
  const canGroup = groupable(editor.state).length >= 2;
  const group = selectedGroup(editor.state);
  return (
    <MenuButton
      icon={GroupIcon}
      label="Group"
      showLabel
      disabled={!canGroup && !group}
      title={
        canGroup || group
          ? "Group"
          : "Group: Shift+click two or more pictures or shapes in front of or behind the text"
      }
      menu={(close) => (
        <>
          {canGroup && <MenuItem icon={GroupIcon} label="Group" onClick={() => (close(), groupPictures(editor))} />}
          {group && <MenuItem icon={Ungroup} label="Ungroup" onClick={() => (close(), ungroupPictures(editor))} />}
        </>
      )}
    />
  );
}

const SHAPE_NAMES = new Map(SHAPE_GROUPS.flatMap((g) => g.shapes.map((s) => [s.kind, s.name] as const)));

/** What the Selection Pane calls a picture: its kind and a number, as Word names them. */
function nameOf(attrs: Record<string, unknown>, counts: Map<string, number>) {
  const shape = readShape(attrs.shape);
  const kind = shape ? (SHAPE_NAMES.get(shape.kind) ?? "Shape") : attrs.chart ? "Chart" : "Picture";
  const n = (counts.get(kind) ?? 0) + 1;
  counts.set(kind, n);
  return `${kind} ${n}`;
}

export function SelectionPaneButton({ editor }: { editor: Editor }) {
  return (
    <MenuButton
      big
      arrow={false}
      icon={Layers}
      label={"Selection\nPane"}
      align="right"
      menu={(close) => {
        const items: { pos: number; name: string; wrap: string }[] = [];
        const counts = new Map<string, number>();
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === "image") items.push({ pos, name: nameOf(node.attrs, counts), wrap: node.attrs.wrap });
        });
        const selected = editor.state.selection instanceof NodeSelection ? editor.state.selection.from : -1;
        return (
          <div className="w-60">
            <Heading>Selection</Heading>
            {items.length === 0 && <p className="px-2 pb-2 text-sm text-slate-500">There are no pictures or shapes in this document.</p>}
            {items.map((item) => (
              <MenuItem
                key={item.pos}
                label={item.name}
                hint={item.wrap === "inline" ? "In line" : item.wrap === "behind" ? "Behind text" : "In front"}
                checked={item.pos === selected}
                onClick={() => {
                  close();
                  editor.chain().focus().setNodeSelection(item.pos).scrollIntoView().run();
                }}
              />
            ))}
          </div>
        );
      }}
    />
  );
}
