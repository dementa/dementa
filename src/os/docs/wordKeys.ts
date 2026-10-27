// Word's keyboard shortcuts that the editor doesn't have by itself: Ctrl+L, E, R and J to line
// text up, and Ctrl+] and Ctrl+[ to make it bigger or smaller. Ctrl+Shift+E is Word's Track
// Changes (DocsApp), so it doesn't centre the text here.

import { Extension } from "@tiptap/core";
import { currentSize, SIZES } from "./ribbon/HomeTab";

export const WordKeys = Extension.create({
  name: "wordKeys",
  // Before the editor's own shortcuts for the same keys.
  priority: 1000,
  addKeyboardShortcuts() {
    const size = (pt: number) => this.editor.commands.setFontSize(`${Math.min(400, Math.max(1, pt))}pt`);
    return {
      "Mod-l": () => this.editor.commands.setTextAlign("left"),
      "Mod-e": () => this.editor.commands.setTextAlign("center"),
      "Mod-r": () => this.editor.commands.setTextAlign("right"),
      "Mod-j": () => this.editor.commands.setTextAlign("justify"),
      "Mod-]": () => {
        const now = currentSize(this.editor);
        return size(SIZES.find((s) => s > now) ?? now + 10);
      },
      "Mod-[": () => {
        const now = currentSize(this.editor);
        return size([...SIZES].reverse().find((s) => s < now) ?? now - 1);
      },
      "Mod-Shift-e": () => true,
    };
  },
});
