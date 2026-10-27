// What Docs' editors can do: the document's own editor, and the ones for its headers and footers,
// which have the same tools so the ribbon works in both.

import CharacterCount from "@tiptap/extension-character-count";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TableRow from "@tiptap/extension-table-row";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import StarterKit from "@tiptap/starter-kit";
import { FontSize, ParagraphFormat, SearchHighlight, StyledBulletList, StyledOrderedList, StyledTable, StyledTableCell, StyledTableHeader, StyledUnderline } from "./extensions";
import { Bookmark, ChartImage, ColumnBreak, CoverPage, PageBreak, PageField } from "./insertNodes";
import { MergeField } from "./mergeNodes";
import { CommentMark } from "./review/comments";
import { Deletion, Insertion } from "./review/track";
import { MultiSelect } from "./multiSelect";
import { WordKeys } from "./wordKeys";
import { TableMouse } from "./table/tableTools";
import { Proofing } from "./review/proofing";
import { CaptionNumber, Citation, IndexMark, Note, RefBlock } from "./refNodes";

export function editorExtensions(placeholder: string) {
  return [
    // Lists come from extensions.ts instead, so they can have bullet and number styles.
    StarterKit.configure({ bulletList: false, orderedList: false }),
    StyledBulletList,
    StyledOrderedList,
    StyledUnderline,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Placeholder.configure({ placeholder }),
    // Its own each time: one shared between editors would count the header's words as the body's.
    CharacterCount.configure(),
    TextStyle,
    Color,
    // Links don't open while editing, so a click just puts the cursor there.
    Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } }),
    // Pictures, including charts that remember their data.
    ChartImage.configure({ allowBase64: true }),
    // Word forms use very narrow columns to line things up.
    // Resizable only so its column widths show (table/tableTools.ts drags the borders, as Word does).
    StyledTable.configure({ resizable: true, handleWidth: 0, cellMinWidth: 4 }),
    TableRow,
    StyledTableHeader,
    StyledTableCell,
    FontFamily,
    FontSize,
    Subscript,
    Superscript,
    ParagraphFormat,
    SearchHighlight,
    PageBreak,
    ColumnBreak,
    CoverPage,
    Bookmark,
    PageField,
    MultiSelect,
    Note,
    Citation,
    CaptionNumber,
    IndexMark,
    RefBlock,
    MergeField,
    Insertion,
    Deletion,
    CommentMark,
    WordKeys,
    TableMouse,
    Proofing,
  ];
}
