"use client";

// The Layout and Table tabs, and the placeholder for tabs that aren't built yet.

import type { Editor } from "@tiptap/react";
import {
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Columns3,
  File,
  RectangleHorizontal,
  RectangleVertical,
  Rows3,
  Ruler,
  Table,
  TableCellsMerge,
  Trash2,
} from "lucide-react";
import { MARGINS, PAGE_SIZES, type Margins, type PageLayout, type PageSize } from "../layout";
import { Big, Divider, Group } from "./parts";

export function LayoutTab({ layout, onLayout }: { layout: PageLayout; onLayout: (patch: Partial<PageLayout>) => void }) {
  return (
    <>
      <Group label="Size">
        {(Object.keys(PAGE_SIZES) as PageSize[]).map((s) => (
          <Big key={s} icon={File} label={PAGE_SIZES[s].label} active={layout.size === s} onClick={() => onLayout({ size: s })} />
        ))}
      </Group>
      <Divider />
      <Group label="Orientation">
        <Big icon={RectangleVertical} label="Portrait" active={layout.orientation === "portrait"} onClick={() => onLayout({ orientation: "portrait" })} />
        <Big icon={RectangleHorizontal} label="Landscape" active={layout.orientation === "landscape"} onClick={() => onLayout({ orientation: "landscape" })} />
      </Group>
      <Divider />
      <Group label="Margins">
        {(Object.keys(MARGINS) as Margins[]).map((m) => (
          <Big key={m} icon={Ruler} label={MARGINS[m].label} active={layout.margins === m} onClick={() => onLayout({ margins: m })} />
        ))}
      </Group>
    </>
  );
}

export function TableTab({ editor }: { editor: Editor }) {
  const run = () => editor.chain().focus();
  return (
    <>
      <Group label="Rows">
        <Big icon={BetweenHorizontalStart} label="Above" onClick={() => run().addRowBefore().run()} />
        <Big icon={BetweenHorizontalEnd} label="Below" onClick={() => run().addRowAfter().run()} />
        <Big icon={Rows3} label="Delete" onClick={() => run().deleteRow().run()} />
      </Group>
      <Divider />
      <Group label="Columns">
        <Big icon={BetweenVerticalStart} label="Left" onClick={() => run().addColumnBefore().run()} />
        <Big icon={BetweenVerticalEnd} label="Right" onClick={() => run().addColumnAfter().run()} />
        <Big icon={Columns3} label="Delete" onClick={() => run().deleteColumn().run()} />
      </Group>
      <Divider />
      <Group label="Cells">
        <Big icon={TableCellsMerge} label="Merge / split" disabled={!editor.can().mergeOrSplit()} onClick={() => run().mergeOrSplit().run()} />
        <Big icon={Table} label="Header row" onClick={() => run().toggleHeaderRow().run()} />
      </Group>
      <Divider />
      <Group label="Table">
        <Big icon={Trash2} label="Delete table" danger onClick={() => run().deleteTable().run()} />
      </Group>
    </>
  );
}
/** Tabs that are on the ribbon but not built yet. */
export function ComingSoon({ name }: { name: string }) {
  return <p className="m-auto text-sm text-slate-500">{name} tools are coming soon.</p>;
}
