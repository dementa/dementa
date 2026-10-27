"use client";

// Read Aloud: the browser's speech reads the document from the cursor, paragraph by paragraph,
// selecting each word as it's spoken, as Word highlights it. A small bar plays, pauses, skips
// and stops, and sets the voice and speed.

import type { Editor } from "@tiptap/react";
import { Pause, Play, Settings2, SkipBack, SkipForward, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface Paragraph {
  text: string;
  /** Where its text starts in the document. */
  start: number;
}

function paragraphsFrom(editor: Editor): { list: Paragraph[]; first: number } {
  const list: Paragraph[] = [];
  let first = 0;
  const here = editor.state.selection.from;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    if (node.textContent.trim()) {
      if (pos + node.nodeSize <= here) first = list.length + 1;
      list.push({ text: node.textContent, start: pos + 1 });
    }
    return false;
  });
  return { list, first: Math.min(first, Math.max(0, list.length - 1)) };
}

export function ReadAloud({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [state] = useState(() => paragraphsFrom(editor));
  const [at, setAt] = useState(state.first);
  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(1);
  const [voice, setVoice] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [settings, setSettings] = useState(false);
  const atRef = useRef(at);
  atRef.current = at;

  useEffect(() => {
    const load = () => setVoices(speechSynthesis.getVoices());
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const speak = useCallback(
    (index: number) => {
      speechSynthesis.cancel();
      const p = state.list[index];
      if (!p) {
        setPlaying(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(p.text);
      utterance.rate = rate;
      const chosen = voices.find((v) => v.name === voice);
      if (chosen) utterance.voice = chosen;
      // The word being read is selected in the text.
      utterance.onboundary = (e) => {
        if (e.name !== "word") return;
        const length = e.charLength || (p.text.slice(e.charIndex).match(/^\S+/)?.[0].length ?? 1);
        editor.chain().setTextSelection({ from: p.start + e.charIndex, to: p.start + e.charIndex + length }).scrollIntoView().run();
      };
      utterance.onend = () => {
        if (atRef.current !== index) return;
        if (index + 1 < state.list.length) setAt(index + 1);
        else setPlaying(false);
      };
      speechSynthesis.speak(utterance);
    },
    [editor, rate, state.list, voice, voices],
  );

  useEffect(() => {
    if (playing) speak(at);
    else speechSynthesis.cancel();
  }, [at, playing, speak]);

  useEffect(() => () => speechSynthesis.cancel(), []);

  if (!("speechSynthesis" in globalThis)) {
    return (
      <Bar>
        <span className="px-2 text-sm">This browser can&apos;t read aloud.</span>
        <Btn label="Close" onClick={onClose}>
          <Square size={15} />
        </Btn>
      </Bar>
    );
  }
  return (
    <Bar>
      <Btn label="Previous paragraph" onClick={() => setAt(Math.max(0, at - 1))}>
        <SkipBack size={15} />
      </Btn>
      <Btn label={playing ? "Pause" : "Play"} onClick={() => setPlaying(!playing)}>
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </Btn>
      <Btn label="Next paragraph" onClick={() => setAt(Math.min(state.list.length - 1, at + 1))}>
        <SkipForward size={15} />
      </Btn>
      <span className="relative">
        <Btn label="Settings" onClick={() => setSettings(!settings)}>
          <Settings2 size={15} />
        </Btn>
        {settings && (
          <div className="menu-pop absolute right-0 bottom-full mb-2 flex w-64 flex-col gap-2 rounded-lg bg-surface p-3 text-sm shadow-xl ring-1 ring-black/10">
            <label className="flex flex-col gap-1">
              Reading speed
              <input type="range" min={0.5} max={2} step={0.1} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              Voice
              <select value={voice} onChange={(e) => setVoice(e.target.value)} className="rounded border border-slate-300 bg-surface px-1.5 py-1">
                <option value="">Default</option>
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </span>
      <Btn
        label="Stop"
        onClick={() => {
          speechSynthesis.cancel();
          onClose();
        }}
      >
        <Square size={15} />
      </Btn>
    </Bar>
  );
}

const Bar = ({ children }: { children: React.ReactNode }) => (
  <div role="toolbar" aria-label="Read Aloud" className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-surface px-2 py-1 shadow-xl ring-1 ring-black/10">
    {children}
  </div>
);

const Btn = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" title={label} aria-label={label} onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100">
    {children}
  </button>
);
