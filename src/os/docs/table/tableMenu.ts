// Word's right-click menu for a table: the clipboard, Insert, Delete, Select, Merge and Split,
// sizes, alignment, borders and shading.

import type { Editor } from "@tiptap/react";
import {
  AlignVerticalJustifyCenter,
  BetweenHorizontalStart,
  ClipboardPaste,
  Copy,
  Grid2x2,
  MessageSquarePlus,
  PaintBucket,
  Scaling,
  Scissors,
  SquareDashedMousePointer,
  TableCellsMerge,
  TableCellsSplit,
  Trash2,
  UnfoldHorizontal,
  UnfoldVertical,
} from "lucide-react";
import type { MenuEntry } from "../../ContextMenu";
import { alignCells, autoFit, distribute, selectTablePart, setBorders, shadeCells, type BorderKind, type HAlign, type VAlign } from "./tableTools";

/** Colours for Shading: Word's lighter theme tints, which keep black text readable. */
export const SHADES: [string, string][] = [
  ["Light Grey", "#d9d9d9"],
  ["Blue", "#dbe5f1"],
  ["Orange", "#fbe4d5"],
  ["Gold", "#fff2cc"],
  ["Green", "#e2efd9"],
  ["Purple", "#e5dfec"],
  ["Dark Grey", "#a6a6a6"],
];

export const BORDERS: [BorderKind, string][] = [
  ["all", "All Borders"],
  ["outside", "Outside Borders"],
  ["inside", "Inside Borders"],
  ["none", "No Border"],
  ["top", "Top Border"],
  ["bottom", "Bottom Border"],
  ["left", "Left Border"],
  ["right", "Right Border"],
  ["insideH", "Inside Horizontal Border"],
  ["insideV", "Inside Vertical Border"],
];

const V: [VAlign, string][] = [
  ["top", "Top"],
  ["middle", "Center"],
  ["bottom", "Bottom"],
];
const H: [HAlign, string][] = [
  ["left", "Left"],
  ["center", "Center"],
  ["right", "Right"],
];

/** Word's nine Cell Alignment choices, "Align Top Left" to "Align Bottom Right". */
export const CELL_ALIGNMENTS = V.flatMap(([v, vName]) => H.map(([h, hName]) => ({ v, h, label: v === "middle" && h === "center" ? "Align Center" : `Align ${vName} ${hName}` })));

export function tableMenu(editor: Editor, p: { onComment: () => void; onError: (text: string) => void }): MenuEntry[] {
  const run = () => editor.chain().focus();
  const clipboard = (what: "cut" | "copy") => {
    editor.view.focus();
    if (!document.execCommand(what)) p.onError(`Use ${what === "cut" ? "Ctrl+X" : "Ctrl+C"} to ${what}.`);
  };
  const paste = async () => {
    editor.view.focus();
    try {
      const items = await navigator.clipboard.read();
      const html = items.find((i) => i.types.includes("text/html"));
      if (html) editor.view.pasteHTML(await (await html.getType("text/html")).text());
      else editor.view.pasteText(await navigator.clipboard.readText());
    } catch {
      p.onError("The browser didn't allow pasting from here: use Ctrl+V.");
    }
  };
  return [
    { label: "Cut", icon: Scissors, hint: "Ctrl+X", onSelect: () => clipboard("cut") },
    { label: "Copy", icon: Copy, hint: "Ctrl+C", onSelect: () => clipboard("copy") },
    { label: "Paste", icon: ClipboardPaste, hint: "Ctrl+V", onSelect: () => void paste() },
    "divider",
    {
      label: "Insert",
      icon: BetweenHorizontalStart,
      submenu: [
        { label: "Insert Columns to the Left", onSelect: () => run().addColumnBefore().run() },
        { label: "Insert Columns to the Right", onSelect: () => run().addColumnAfter().run() },
        { label: "Insert Rows Above", onSelect: () => run().addRowBefore().run() },
        { label: "Insert Rows Below", onSelect: () => run().addRowAfter().run() },
      ],
    },
    {
      label: "Delete",
      icon: Trash2,
      submenu: [
        { label: "Delete Columns", onSelect: () => run().deleteColumn().run() },
        { label: "Delete Rows", onSelect: () => run().deleteRow().run() },
        { label: "Delete Table", danger: true, onSelect: () => run().deleteTable().run() },
      ],
    },
    {
      label: "Select",
      icon: SquareDashedMousePointer,
      submenu: [
        { label: "Select Cell", onSelect: () => selectTablePart(editor, "cell") },
        { label: "Select Column", onSelect: () => selectTablePart(editor, "column") },
        { label: "Select Row", onSelect: () => selectTablePart(editor, "row") },
        { label: "Select Table", onSelect: () => selectTablePart(editor, "table") },
      ],
    },
    { label: "Merge Cells", icon: TableCellsMerge, disabled: !editor.can().mergeCells(), onSelect: () => run().mergeCells().run() },
    { label: "Split Cells", icon: TableCellsSplit, disabled: !editor.can().splitCell(), onSelect: () => run().splitCell().run() },
    "divider",
    { label: "Distribute Rows Evenly", icon: UnfoldVertical, onSelect: () => distribute(editor, "rows") },
    { label: "Distribute Columns Evenly", icon: UnfoldHorizontal, onSelect: () => distribute(editor, "columns") },
    {
      label: "AutoFit",
      icon: Scaling,
      submenu: [
        { label: "AutoFit to Contents", onSelect: () => autoFit(editor, "contents") },
        { label: "AutoFit to Window", onSelect: () => autoFit(editor, "window") },
        { label: "Fixed Column Width", onSelect: () => autoFit(editor, "fixed") },
      ],
    },
    {
      label: "Cell Alignment",
      icon: AlignVerticalJustifyCenter,
      submenu: CELL_ALIGNMENTS.map((a) => ({ label: a.label, onSelect: () => alignCells(editor, a.v, a.h) })),
    },
    { label: "Borders", icon: Grid2x2, submenu: BORDERS.map(([kind, label]) => ({ label, onSelect: () => setBorders(editor, kind) })) },
    {
      label: "Shading",
      icon: PaintBucket,
      submenu: [{ label: "No Color", onSelect: () => shadeCells(editor, null) }, ...SHADES.map(([label, colour]) => ({ label, onSelect: () => shadeCells(editor, colour) }))],
    },
    "divider",
    { label: "New Comment", icon: MessageSquarePlus, hint: "Ctrl+Alt+M", onSelect: p.onComment },
  ];
}
