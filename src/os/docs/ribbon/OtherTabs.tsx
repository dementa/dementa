"use client";

// The Table tab: rows and columns, cells, their size, alignment, borders and shading.

import type { Editor } from "@tiptap/react";
import {
  AlignVerticalJustifyCenter,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Columns3,
  Grid2x2,
  PaintBucket,
  Rows3,
  Scaling,
  SquareDashedMousePointer,
  Table,
  TableCellsMerge,
  TableCellsSplit,
  Trash2,
  UnfoldHorizontal,
  UnfoldVertical,
} from "lucide-react";
import { BORDERS, CELL_ALIGNMENTS, SHADES } from "../table/tableMenu";
import { alignCells, autoFit, distribute, selectTablePart, setBorders, shadeCells } from "../table/tableTools";
import { Big, Divider, Group, MenuButton, MenuItem } from "./parts";

export function TableTab({ editor }: { editor: Editor }) {
  const run = () => editor.chain().focus();
  return (
    <>
      <Group label="Table">
        <MenuButton
          big
          icon={SquareDashedMousePointer}
          label={"Select\n"}
          title="Select"
          menu={(close) =>
            (["cell", "column", "row", "table"] as const).map((part) => (
              <MenuItem key={part} label={`Select ${part[0].toUpperCase() + part.slice(1)}`} onClick={() => (close(), selectTablePart(editor, part))} />
            ))
          }
        />
      </Group>
      <Divider />
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
        <Big icon={TableCellsMerge} label={"Merge\nCells"} disabled={!editor.can().mergeCells()} onClick={() => run().mergeCells().run()} />
        <Big icon={TableCellsSplit} label={"Split\nCells"} disabled={!editor.can().splitCell()} onClick={() => run().splitCell().run()} />
        <Big
          icon={Table}
          label={"Repeat\nHeader Rows"}
          title="Repeat the first row at the top of each page"
          active={editor.isActive("tableHeader")}
          onClick={() => run().toggleHeaderRow().run()}
        />
      </Group>
      <Divider />
      <Group label="Cell Size">
        <MenuButton
          big
          icon={Scaling}
          label={"AutoFit\n"}
          title="AutoFit"
          menu={(close) => (
            <>
              <MenuItem label="AutoFit Contents" onClick={() => (close(), autoFit(editor, "contents"))} />
              <MenuItem label="AutoFit Window" onClick={() => (close(), autoFit(editor, "window"))} />
              <MenuItem label="Fixed Column Width" onClick={() => (close(), autoFit(editor, "fixed"))} />
            </>
          )}
        />
        <Big icon={UnfoldVertical} label={"Distribute\nRows"} onClick={() => distribute(editor, "rows")} />
        <Big icon={UnfoldHorizontal} label={"Distribute\nColumns"} onClick={() => distribute(editor, "columns")} />
      </Group>
      <Divider />
      <Group label="Alignment">
        <MenuButton
          big
          icon={AlignVerticalJustifyCenter}
          label={"Cell\nAlignment"}
          menu={(close) => (
            <div className="grid grid-cols-3 gap-0.5 p-1">
              {CELL_ALIGNMENTS.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  title={a.label}
                  aria-label={a.label}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => (close(), alignCells(editor, a.v, a.h))}
                  className="flex h-8 w-8 flex-col justify-between rounded border border-slate-200 p-1 hover:bg-slate-100"
                  style={{ justifyContent: a.v === "top" ? "flex-start" : a.v === "middle" ? "center" : "flex-end", alignItems: a.h === "left" ? "flex-start" : a.h === "center" ? "center" : "flex-end" }}
                >
                  <span className="block h-0.5 w-4 bg-slate-600" />
                  <span className="mt-0.5 block h-0.5 w-2.5 bg-slate-600" />
                </button>
              ))}
            </div>
          )}
        />
      </Group>
      <Divider />
      <Group label="Borders">
        <MenuButton
          big
          icon={PaintBucket}
          label={"Shading\n"}
          title="Shading"
          menu={(close) => (
            <>
              <MenuItem label="No Color" onClick={() => (close(), shadeCells(editor, null))} />
              <div className="grid grid-cols-7 gap-1 p-2">
                {SHADES.map(([name, colour]) => (
                  <button
                    key={colour}
                    type="button"
                    title={name}
                    aria-label={name}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => (close(), shadeCells(editor, colour))}
                    className="h-5 w-5 border border-slate-300 hover:outline hover:outline-2 hover:outline-blue-400"
                    style={{ background: colour }}
                  />
                ))}
              </div>
            </>
          )}
        />
        <MenuButton
          big
          icon={Grid2x2}
          label={"Borders\n"}
          title="Borders"
          menu={(close) => BORDERS.map(([kind, name]) => <MenuItem key={kind} label={name} onClick={() => (close(), setBorders(editor, kind))} />)}
        />
      </Group>
      <Divider />
      <Group label="Table">
        <Big icon={Trash2} label="Delete table" danger onClick={() => run().deleteTable().run()} />
      </Group>
    </>
  );
}
