"use client";

// Word's Picture Format tab, while a picture, shape, SmartArt or chart is selected: how it sits
// with the text, its exact size, and deleting it.

import type { Editor } from "@tiptap/react";
import { ArrowLeftRight, ArrowUpDown, Lock, RotateCcw, Trash2, WrapText } from "lucide-react";
import { useState } from "react";
import { MIN_PICTURE } from "../PictureView";
import { Big, Divider, Group, MenuButton, MenuItem, Stack } from "./parts";

const PX_PER_CM = 96 / 2.54;

/** The selected picture's size on the page, whether it was given one or not. */
function shownSize(editor: Editor) {
  const { width, height } = editor.getAttributes("image");
  if (width && height) return { w: width as number, h: height as number };
  const dom = editor.view.nodeDOM(editor.state.selection.from) as HTMLElement | null;
  const img = dom?.querySelector("img");
  return { w: img?.offsetWidth || 1, h: img?.offsetHeight || 1 };
}

export function PictureTab({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes("image");
  const front = attrs.wrap === "front";
  const size = shownSize(editor);
  const [locked, setLocked] = useState(true);
  const set = (patch: Record<string, unknown>) => editor.chain().focus().updateAttributes("image", patch).run();

  function resize(side: "w" | "h", cm: number) {
    const px = Math.max(MIN_PICTURE, Math.round(cm * PX_PER_CM));
    const ratio = size.w / size.h;
    if (side === "w") set({ width: px, height: locked ? Math.round(px / ratio) : size.h });
    else set({ height: px, width: locked ? Math.round(px * ratio) : size.w });
  }

  return (
    <>
      <Group label="Arrange">
        <MenuButton
          big
          icon={WrapText}
          label={"Wrap\nText"}
          title="Wrap Text"
          menu={(close) => (
            <>
              <MenuItem label="In Line with Text" checked={!front} onClick={() => (close(), set({ wrap: "inline", x: 0, y: 0 }))} />
              <MenuItem label="In Front of Text" checked={front} onClick={() => (close(), set({ wrap: "front", x: 0, y: 0, width: size.w, height: size.h }))} />
            </>
          )}
        />
      </Group>
      <Divider />
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
        <Big icon={RotateCcw} label={"Reset\nSize"} title="Back to the picture's own size" onClick={() => set({ width: null, height: null })} />
      </Group>
      <Divider />
      <Group label="Picture">
        <Big icon={Trash2} label="Delete" danger onClick={() => editor.chain().focus().deleteSelection().run()} />
      </Group>
    </>
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
