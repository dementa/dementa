// Word's right-click menus for the things in a document other than plain text and tables:
// pictures, shapes, charts and SmartArt; footnotes, citations, captions and tables of contents;
// tracked changes and comments. (Text: textMenu.tsx. Tables: table/tableMenu.ts.)

import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import {
  BringToFront,
  Check,
  ChartColumnBig,
  CircleCheck,
  FileImage,
  Group,
  MessageSquare,
  MessageSquarePlus,
  NotebookPen,
  RefreshCw,
  SendToBack,
  Tag,
  Text,
  Trash2,
  WrapText,
  X,
} from "lucide-react";
import type { MenuEntry } from "../ContextMenu";
import { groupable, groupPictures, selectedGroup, ungroupPictures } from "./multiSelect";
import { refreshNow } from "./refresh";
import { changesOf, settle, type Change } from "./review/track";
import { restack } from "./ribbon/LayoutTab";
import { WRAP_NAMES, setWrap } from "./ribbon/PictureTab";
import { clipboardItems } from "./textMenu";

/** The boxes a menu item can open next to the menu. */
export type ItemPanel = "link" | "alt" | "caption" | "chart";

interface Options {
  onComment: () => void;
  onError: (text: string) => void;
  onPanel: (panel: ItemPanel) => void;
}

// ---- Pictures, shapes, charts and SmartArt ----

/** The menu for the selected picture (or shape, chart or SmartArt), as Word's. */
export function pictureMenu(editor: Editor, node: PMNode, pos: number, p: Options): MenuEntry[] {
  const { wrap = "inline", chart, shape } = node.attrs;
  const floating = wrap === "front" || wrap === "behind";
  const plain = !chart && !shape;
  const items: MenuEntry[] = [...clipboardItems(editor, p.onError), "divider"];
  if (chart) items.push({ label: "Edit Data…", icon: ChartColumnBig, onSelect: () => p.onPanel("chart") });
  if (plain) items.push({ label: "Change Picture…", icon: FileImage, onSelect: () => changePicture(editor, pos, p.onError) });
  items.push(
    {
      label: "Group",
      icon: Group,
      submenu: [
        { label: "Group", disabled: !groupable(editor.state), onSelect: () => groupPictures(editor) },
        { label: "Ungroup", disabled: !selectedGroup(editor.state), onSelect: () => ungroupPictures(editor) },
      ],
    },
    {
      label: "Bring to Front",
      icon: BringToFront,
      // Only pictures that float over the text can be piled up (as Word greys these out for the rest).
      disabled: !floating,
      submenu: [
        { label: "Bring to Front", onSelect: () => restack(editor, "front") },
        { label: "Bring Forward", onSelect: () => restack(editor, "forward") },
        ...(wrap === "behind" ? [{ label: "Bring in Front of Text", onSelect: () => restack(editor, "inFront") }] : []),
      ],
    },
    {
      label: "Send to Back",
      icon: SendToBack,
      disabled: !floating,
      submenu: [
        { label: "Send to Back", onSelect: () => restack(editor, "back") },
        { label: "Send Backward", onSelect: () => restack(editor, "backward") },
        ...(wrap === "front" ? [{ label: "Send Behind Text", onSelect: () => restack(editor, "behind") }] : []),
      ],
    },
    "divider",
    { label: "Insert Caption…", icon: Tag, onSelect: () => p.onPanel("caption") },
    { label: "Wrap Text", icon: WrapText, submenu: WRAP_NAMES.map(([id, name]) => ({ label: name, checked: wrap === id, onSelect: () => setWrap(editor, id) })) },
    { label: "Edit Alt Text…", icon: Text, onSelect: () => p.onPanel("alt") },
    "divider",
    { label: "New Comment", icon: MessageSquarePlus, hint: "Ctrl+Alt+M", onSelect: p.onComment },
    { label: chart ? "Delete Chart" : shape ? "Delete Shape" : "Delete Picture", icon: Trash2, danger: true, onSelect: () => editor.chain().focus().deleteSelection().run() },
  );
  return items;
}

/** Change Picture: another picture from this computer in its place, at the same size and place. */
function changePicture(editor: Editor, pos: number, onError: (text: string) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => onError("That picture couldn't be read.");
    reader.onload = () => {
      const node = editor.state.doc.nodeAt(pos);
      if (node?.type.name !== "image") return;
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: String(reader.result), alt: file.name.replace(/\.[^.]+$/, "") }));
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

// ---- Fields: footnotes, citations, captions, tables of contents… ----

const FIELD_NAMES: Record<string, string> = { citation: "Citation", captionNumber: "Caption Number", pageField: "Page Number" };

/**
 * The extra items for a field under the mouse (put before the text menu's), or null when there's
 * none: a footnote or endnote mark, a citation, a caption's number, or a table of contents,
 * figures, bibliography or index.
 */
export function fieldItems(editor: Editor, node: PMNode, pos: number, p: { onNote: (id: string) => void }): MenuEntry[] | null {
  const update = { label: "Update Field", icon: RefreshCw, onSelect: () => refreshNow(editor.view) };
  const remove = (label: string) => ({ label, icon: Trash2, onSelect: () => editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run() });
  switch (node.type.name) {
    case "note": {
      const kind = node.attrs.kind === "endnote" ? "Endnote" : "Footnote";
      return [{ label: `Edit ${kind}`, icon: NotebookPen, onSelect: () => p.onNote(node.attrs.id) }, remove(`Delete ${kind}`), "divider"];
    }
    case "refBlock": {
      const name = { toc: "Table of Contents", figures: "Table of Figures", bibliography: "Bibliography", index: "Index" }[node.attrs.kind as string] ?? "Table";
      return [{ label: name === "Bibliography" ? "Update Citations and Bibliography" : `Update ${name}`, icon: RefreshCw, onSelect: update.onSelect }, remove(`Remove ${name}`), "divider"];
    }
    default:
      return node.type.name in FIELD_NAMES ? [update, remove(`Delete ${FIELD_NAMES[node.type.name]}`), "divider"] : null;
  }
}

// ---- Tracked changes and comments ----

/** Accept or Reject for the tracked change under the mouse (first in the menu, as in Word). */
export function changeItems(editor: Editor, pos: number): MenuEntry[] {
  const here: Change[] = changesOf(editor.state.doc).filter((c) => pos >= c.from && pos <= c.to);
  if (!here.length || !editor.isEditable) return [];
  const what = here[0].kind === "insertion" ? "Insertion" : "Deletion";
  return [
    { label: `Accept ${what}`, icon: Check, onSelect: () => settle(editor, here, true) },
    { label: `Reject ${what}`, icon: X, onSelect: () => settle(editor, here, false) },
    "divider",
  ];
}

/** For text that has comments on it: show, resolve or delete them. */
export function commentItems(ids: string[], p: { onShow: () => void; onResolve: (ids: string[]) => void; onDelete: (ids: string[]) => void }): MenuEntry[] {
  if (!ids.length) return [];
  const one = ids.length === 1;
  return [
    { label: "Show Comments", icon: MessageSquare, onSelect: p.onShow },
    { label: one ? "Resolve Comment" : "Resolve Comments", icon: CircleCheck, onSelect: () => p.onResolve(ids) },
    { label: one ? "Delete Comment" : "Delete Comments", icon: Trash2, onSelect: () => p.onDelete(ids) },
    "divider",
  ];
}

// ---- Headers and footers ----

/** Right-clicking a header or footer (or the margin where one goes) when it isn't being edited. */
export function headerFooterMenu(part: "header" | "footer", onEdit: () => void): MenuEntry[] {
  return [{ label: part === "header" ? "Edit Header" : "Edit Footer", icon: NotebookPen, onSelect: onEdit }];
}
