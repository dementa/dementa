"use client";

// Word's Picture Format tab, while a picture, SmartArt or chart is selected: how it sits with the
// text, its exact size, and deleting it. Shapes have their own Shape Format tab, which shares these.

import type { Editor } from "@tiptap/react";
import { ArrowLeftRight, ArrowUpDown, Lock, RotateCcw, Trash2, WrapText } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Wrap } from "../insertNodes";
import { MIN_PICTURE } from "../PictureView";
import { Big, Divider, Group, MenuButton, MenuItem, Stack } from "./parts";
import { GroupButton } from "./ArrangeMore";

const PX_PER_CM = 96 / 2.54;

/** The selected picture's size on the page, whether it was given one or not. */
export function shownSize(editor: Editor) {
  const { width, height } = editor.getAttributes("image");
  if (width && height) return { w: width as number, h: height as number };
  const dom = editor.view.nodeDOM(editor.state.selection.from) as HTMLElement | null;
  const img = dom?.querySelector("img");
  return { w: img?.offsetWidth || 1, h: img?.offsetHeight || 1 };
}

export function PictureTab({ editor }: { editor: Editor }) {
  return (
    <>
      <Group label="Arrange">
        <WrapTextButton editor={editor} />
        <GroupButton editor={editor} />
      </Group>
      <Divider />
      <SizeGroup editor={editor} lockedAtFirst>
        <Big icon={RotateCcw} label={"Reset\nSize"} title="Back to the picture's own size" onClick={() => setPicture(editor, { width: null, height: null })} />
      </SizeGroup>
      <Divider />
      <Group label="Picture">
        <Big icon={Trash2} label="Delete" danger onClick={() => editor.chain().focus().deleteSelection().run()} />
      </Group>
    </>
  );
}

export const setPicture = (editor: Editor, patch: Record<string, unknown>) => editor.chain().focus().updateAttributes("image", patch).run();

export const WRAP_NAMES: [Wrap, string][] = [
  ["inline", "In Line with Text"],
  ["square", "Square"],
  ["topBottom", "Top and Bottom"],
  ["behind", "Behind Text"],
  ["front", "In Front of Text"],
];

/** How the selected picture sits with the text (Wrap Text). Also used by the right-click menu. */
export function setWrap(editor: Editor, to: Wrap) {
  const wrap = editor.getAttributes("image").wrap ?? "inline";
  if (to === "inline") return setPicture(editor, { wrap: "inline", x: 0, y: 0, z: 0 });
  const size = shownSize(editor);
  // Moving between in front and behind keeps the picture where it is.
  if (to === "front" || to === "behind")
    return setPicture(editor, wrap === "front" || wrap === "behind" ? { wrap: to } : { wrap: to, x: 0, y: 0, width: size.w, height: size.h });
  // Text flowing around it, or above and below it: it goes back into the text where it's anchored.
  return setPicture(editor, { wrap: to, x: 0, y: 0, z: 0, width: size.w, height: size.h });
}

/** In line with the text, or in front of or behind it (dragged anywhere). Shared with the Shape Format and Layout tabs. */
export function WrapTextButton({ editor, disabled }: { editor: Editor; disabled?: boolean }) {
  const wrap = editor.getAttributes("image").wrap ?? "inline";
  return (
    <MenuButton
      big
      icon={WrapText}
      label={"Wrap\nText"}
      title="Wrap Text"
      disabled={disabled}
      menu={(close) => (
        <>
          {WRAP_NAMES.map(([id, name]) => (
            <MenuItem key={id} label={name} checked={wrap === id} onClick={() => (close(), setWrap(editor, id))} />
          ))}
        </>
      )}
    />
  );
}

/** Height and width in centimetres. Pictures keep their proportions at first; shapes don't, as in Word. */
export function SizeGroup({ editor, lockedAtFirst, children }: { editor: Editor; lockedAtFirst: boolean; children?: ReactNode }) {
  const size = shownSize(editor);
  const [locked, setLocked] = useState(lockedAtFirst);

  function resize(side: "w" | "h", cm: number) {
    const px = Math.max(MIN_PICTURE, Math.round(cm * PX_PER_CM));
    const ratio = size.w / size.h;
    if (side === "w") setPicture(editor, { width: px, height: locked ? Math.round(px / ratio) : size.h });
    else setPicture(editor, { height: px, width: locked ? Math.round(px * ratio) : size.w });
  }

  return (
    <Group label="Size">
      <Stack>
        {/* The key refreshes the box when the picture is resized with its handles. */}
        <SizeBox key={`h${size.h}`} icon={ArrowUpDown} label="Height" px={size.h} onChange={(cm) => resize("h", cm)} />
        <SizeBox key={`w${size.w}`} icon={ArrowLeftRight} label="Width" px={size.w} onChange={(cm) => resize("w", cm)} />
        <label className="flex items-center gap-1.5 text-xs text-slate-600" title="Change the height and width together">
          <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
          <Lock size={12} /> Keep proportions
        </label>
      </Stack>
      {children}
    </Group>
  );
}

function SizeBox(p: { icon: typeof Lock; label: string; px: number; onChange: (cm: number) => void }) {
  const [text, setText] = useState((p.px / PX_PER_CM).toFixed(2));
  const commit = () => {
    const cm = parseFloat(text);
    if (Number.isFinite(cm) && cm > 0) p.onChange(cm);
    else setText((p.px / PX_PER_CM).toFixed(2));
  };
  return (
    <label className="flex items-center gap-1.5 text-xs" title={`${p.label} (cm)`}>
      <p.icon size={14} className="text-slate-600" />
      <span className="sr-only">{p.label} in centimetres</span>
      <input
        type="number"
        min={0.5}
        step={0.1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commit())}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-16 rounded border border-slate-300 bg-surface px-1.5 py-0.5 select-text"
      />
      cm
    </label>
  );
}
