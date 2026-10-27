"use client";

// The Help tab, as in Word: Help (F1), keyboard shortcuts, training and what's new open the Help
// pane beside the page; Feedback writes an e-mail in the person's own mail app.

import { CircleHelp, GraduationCap, Keyboard, MessageSquareHeart, Sparkles } from "lucide-react";
import { useState } from "react";
import type { ReviewView } from "./ReviewTab";
import { Big, Group, MenuButton } from "./parts";

/** Where Feedback e-mails go. */
export const FEEDBACK_TO = "dementaacademy@gmail.com";

const KINDS = [
  ["like", "I like something"],
  ["dislike", "I don't like something"],
  ["idea", "I have a suggestion"],
] as const;

export function HelpTab({ title, view }: { title: string; view: ReviewView }) {
  const open = (pane: "help" | "shortcuts" | "training" | "whatsnew") => view.onPane(view.pane === pane ? null : pane);
  return (
    <>
      <Group label="Help">
        <Big icon={CircleHelp} label="Help" title="Help (F1)" active={view.pane === "help"} onClick={() => open("help")} />
        <Big icon={Keyboard} label={"Keyboard\nShortcuts"} active={view.pane === "shortcuts"} onClick={() => open("shortcuts")} />
        <Big icon={GraduationCap} label={"Show\nTraining"} active={view.pane === "training"} onClick={() => open("training")} />
        <Big icon={Sparkles} label={"What's\nNew"} active={view.pane === "whatsnew"} onClick={() => open("whatsnew")} />
      </Group>
      <Group label="Feedback">
        <MenuButton icon={MessageSquareHeart} label="Feedback" big arrow={false} menu={(close) => <Feedback title={title} onDone={close} />} />
      </Group>
    </>
  );
}

function Feedback({ title, onDone }: { title: string; onDone: () => void }) {
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("idea");
  const [text, setText] = useState("");
  const send = () => {
    const subject = `Dementa Docs feedback: ${KINDS.find((k) => k[0] === kind)![1]}`;
    const body = `${text.trim()}\n\n(Document: ${title || "Untitled"}; ${navigator.userAgent})`;
    window.location.href = `mailto:${FEEDBACK_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    onDone();
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="flex w-72 flex-col gap-2 p-2 text-sm"
    >
      <p className="font-semibold">Send feedback</p>
      {KINDS.map(([id, name]) => (
        <label key={id} className="flex items-center gap-2">
          <input type="radio" name="feedback-kind" checked={kind === id} onChange={() => setKind(id)} />
          {name}
        </label>
      ))}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Tell us more" className="rounded border border-slate-300 p-1.5 outline-none focus:border-blue-500" />
      <p className="text-xs text-slate-500">This opens an e-mail to Dementa in your mail app; nothing is sent until you send it there.</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded px-3 py-1 hover:bg-slate-100">
          Cancel
        </button>
        <button type="submit" disabled={!text.trim()} className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50">
          Write e-mail
        </button>
      </div>
    </form>
  );
}
