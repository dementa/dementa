"use client";

// The Insert tab, in Word's order: Pages, Tables, Illustrations, Add-ins, Media, Links.

import type { Editor } from "@tiptap/react";
import {
  Bookmark,
  Camera,
  ChartColumnBig,
  ChevronDown,
  File,
  FileSymlink,
  Globe,
  Image as ImageIcon,
  Link,
  MonitorPlay,
  Network,
  NotebookText,
  Puzzle,
  ScissorsLineDashed,
  Shapes,
  ShoppingBag,
  Table,
  Trash2,
} from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { SHAPE_GROUPS, shapeSvg, svgUrl } from "../graphics";
import { COVER_DESIGNS, hasCoverPage, insertBlankPage, insertCoverPage, removeCoverPage, type CoverDesign } from "../insertNodes";
import { ChartForm } from "./ChartForm";
import { BookmarkPanel, CrossReferencePanel, LinkForm, OnlinePictures, SmartArtForm, TablePicker, WikipediaPanel } from "./insertPanels";
import { Big, Divider, Group, keepFocus, MenuButton, MenuItem, Stack } from "./parts";

/** Pictures are kept inside the document, so they're limited to keep documents quick to save and open. */
const MAX_PICTURE_BYTES = 5 * 1024 * 1024;
/** Screenshots are shrunk to this width, which is plenty for a page. */
const SCREENSHOT_WIDTH = 1600;

export function InsertTab({ editor, onError }: { editor: Editor; onError: (text: string) => void }) {
  const run = () => editor.chain().focus();
  const picture = useRef<HTMLInputElement>(null);

  function addPicture(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return onError("That isn't a picture. Choose a photo or drawing.");
    if (file.size > MAX_PICTURE_BYTES) return onError("That picture is too big. Pictures can be up to 5 MB.");
    const reader = new FileReader();
    reader.onload = () => run().setImage({ src: String(reader.result), alt: file.name.replace(/\.[^.]+$/, "") }).run();
    reader.onerror = () => onError("Couldn't read that picture.");
    reader.readAsDataURL(file);
  }

  async function screenshot() {
    if (!navigator.mediaDevices?.getDisplayMedia) return onError("Screenshots aren't available here.");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch (err) {
      // Pressing Cancel in the picker isn't a problem.
      if (!(err instanceof DOMException && err.name === "NotAllowedError")) onError("Couldn't take a screenshot here.");
      return;
    }
    try {
      const video = document.createElement("video");
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      const scale = Math.min(1, SCREENSHOT_WIDTH / video.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
      run().setImage({ src: canvas.toDataURL("image/jpeg", 0.85), alt: "Screenshot" }).run();
    } catch {
      onError("Couldn't take a screenshot here.");
    } finally {
      stream.getTracks().forEach((t) => t.stop());
    }
  }

  return (
    <>
      <Group label="Pages">
        <MenuButton
          big
          icon={NotebookText}
          label={"Cover\nPage"}
          menu={(close) => (
            <div className="w-64">
              <p className="px-2 pb-1 text-xs font-medium text-slate-500">Built-in</p>
              <div className="grid grid-cols-3 gap-2 px-2 pb-2">
                {COVER_DESIGNS.map((d) => (
                  <button
                    key={d.id}
                    onMouseDown={keepFocus}
                    onClick={() => (close(), insertCoverPage(editor, d.id))}
                    className="flex flex-col items-center gap-1 rounded p-1 text-xs hover:bg-slate-100"
                  >
                    <CoverThumb design={d.id} />
                    {d.name}
                  </button>
                ))}
              </div>
              <span className="mx-2 block h-px bg-slate-200" />
              <button
                onMouseDown={keepFocus}
                disabled={!hasCoverPage(editor)}
                onClick={() => (close(), removeCoverPage(editor))}
                className="mt-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Trash2 size={14} className="text-slate-600" /> Remove Current Cover Page
              </button>
            </div>
          )}
        />
        <Big icon={File} label={"Blank\nPage"} title="Blank Page" onClick={() => insertBlankPage(editor)} />
        <Big icon={ScissorsLineDashed} label={"Page\nBreak"} title="Page Break (Ctrl+Enter)" onClick={() => run().setPageBreak().run()} />
      </Group>
      <Divider />

      <Group label="Tables">
        <MenuButton
          big
          icon={Table}
          label={"Table\n"}
          title="Table"
          menu={(close) => (
            <TablePicker
              onPick={(rows, cols) => {
                run().insertTable({ rows, cols, withHeaderRow: true }).run();
                close();
              }}
            />
          )}
        />
      </Group>
      <Divider />

      <Group label="Illustrations">
        <Big icon={ImageIcon} label="Pictures" title="Pictures from this computer" onClick={() => picture.current?.click()} />
        <input ref={picture} type="file" accept="image/*" hidden onChange={addPicture} />
        <MenuButton big arrow={false} icon={Globe} label={"Online\nPictures"} menu={(close) => <OnlinePictures editor={editor} onDone={close} />} />
        <MenuButton
          big
          icon={Shapes}
          label={"Shapes\n"}
          title="Shapes"
          menu={(close) => (
            <div className="flex w-64 flex-col gap-2 p-1">
              {SHAPE_GROUPS.map((g) => (
                <div key={g.name}>
                  <p className="mb-1 text-xs font-medium text-slate-500">{g.name}</p>
                  <div className="flex flex-wrap gap-1">
                    {g.shapes.map((s) => (
                      <button
                        key={s.kind}
                        title={s.name}
                        aria-label={s.name}
                        onMouseDown={keepFocus}
                        onClick={() => {
                          close();
                          // Like Word, shapes go in front of the text, so they can be dragged anywhere.
                          const line = s.kind === "line" || s.kind === "arrowLine";
                          run()
                            .insertContent({
                              type: "image",
                              attrs: { src: svgUrl(shapeSvg(s.kind)), alt: s.name, wrap: "front", width: 160, height: line ? 60 : 100 },
                            })
                            .run();
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded hover:bg-slate-100"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- a drawing made here */}
                        <img src={svgUrl(shapeSvg(s.kind))} alt="" className="max-h-6 max-w-6" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        />
        <MenuButton big arrow={false} icon={Network} label="SmartArt" menu={(close) => <SmartArtForm editor={editor} onDone={close} />} />
        <MenuButton big arrow={false} icon={ChartColumnBig} label="Chart" menu={(close) => <ChartForm editor={editor} onDone={close} />} />
        <MenuButton
          big
          icon={Camera}
          label={"Screenshot\n"}
          title="Screenshot"
          align="right"
          menu={(close) => (
            <MenuItem icon={Camera} label="Take a screenshot of a window or screen…" onClick={() => (close(), screenshot())} />
          )}
        />
      </Group>
      <Divider />

      <Group label="Add-ins">
        <Stack>
          <SmallSoon icon={ShoppingBag} label="Store" />
          <SmallSoon icon={Puzzle} label="My Add-ins" arrow />
        </Stack>
        <MenuButton big arrow={false} icon={WikipediaIcon} label="Wikipedia" align="right" menu={(close) => <WikipediaPanel editor={editor} onDone={close} />} />
      </Group>
      <Divider />

      <Group label="Media">
        <Big
          icon={MonitorPlay}
          label={"Online\nVideo"}
          disabled
          title="Online Video: video sites aren't on Dementa's list of approved websites yet"
          onClick={() => {}}
        />
      </Group>
      <Divider />

      <Group label="Links">
        <MenuButton big arrow={false} icon={Link} label="Hyperlink" align="right" menu={(close) => <LinkForm editor={editor} onDone={close} />} />
        <MenuButton big arrow={false} icon={Bookmark} label="Bookmark" align="right" menu={(close) => <BookmarkPanel editor={editor} onDone={close} />} />
        <MenuButton
          big
          arrow={false}
          icon={FileSymlink}
          label={"Cross-\nreference"}
          title="Cross-reference"
          align="right"
          menu={(close) => <CrossReferencePanel editor={editor} onDone={close} />}
        />
      </Group>
    </>
  );
}

/** Word's Wikipedia "W". */
function WikipediaIcon({ size = 24 }: { size?: number }) {
  return (
    <span aria-hidden className="flex items-center justify-center font-serif leading-none" style={{ width: size, height: size, fontSize: size }}>
      W
    </span>
  );
}

/** Store and My Add-ins: add-ins for Docs aren't built yet. */
function SmallSoon({ icon: Icon, label, arrow }: { icon: typeof Puzzle; label: string; arrow?: boolean }) {
  return (
    <button
      type="button"
      disabled
      title={`${label}: add-ins for Docs are coming soon`}
      className="flex h-7 items-center gap-1.5 rounded px-1.5 text-xs disabled:opacity-40"
    >
      <Icon size={16} /> {label}
      {arrow && <ChevronDown size={11} />}
    </button>
  );
}

/** A tiny drawing of each cover page design, for the Cover Page menu. */
function CoverThumb({ design }: { design: CoverDesign }) {
  const centred = design === "centered";
  return (
    <span className={`flex h-24 w-[4.25rem] flex-col gap-1 bg-white p-1.5 shadow ring-1 ring-black/10 ${centred ? "items-center justify-center" : "pt-6"}`}>
      <span className={`h-2 w-11 rounded-sm ${design === "banded" ? "bg-[#2b579a]" : "bg-slate-500"}`} />
      <span className={`h-1 w-8 rounded-sm ${design === "banded" ? "bg-[#dbe5f5]" : "bg-slate-300"}`} />
      {!centred && <span className="mt-auto h-1 w-6 rounded-sm bg-[#2b579a]" />}
    </span>
  );
}
