"use client";

// Word's Mailings tab: Create (envelopes, labels), Start Mail Merge, Write & Insert Fields,
// Preview Results and Finish. The merge itself is in mailMerge.ts; the fields in mergeNodes.ts.

import { generateHTML, generateText, type JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import {
  AlertTriangle,
  ArrowDownAZ,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Contact,
  FileStack,
  Highlighter,
  ListChecks,
  Mail,
  MailOpen,
  Plus,
  Printer,
  Search,
  Shuffle,
  SquareCheck,
  Tags,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { PAGE_SIZES, type PageLayout } from "../layout";
import {
  ADDRESS_FIELDS,
  addressBlock,
  COMPARISONS,
  DEFAULT_ADDRESS,
  DEFAULT_GREETING,
  ENVELOPES,
  envelopeDoc,
  greetingLine,
  guessMatch,
  includedRecords,
  LABEL_SHEETS,
  labelsDoc,
  mergeAll,
  NEW_LIST_FIELDS,
  NO_MERGE,
  parseCsv,
  updateLabels,
  type AddressOptions,
  type Comparison,
  type FieldAttrs,
  type GreetingOptions,
  type MailMerge,
  type MergeType,
} from "../mailMerge";
import { previewOf, setPreview } from "../mergeNodes";
import { UNTRACKED } from "../review/track";
import { Choices, Form, Heading } from "./LayoutTab";
import { Big, Group, keepFocus, MenuButton, MenuItem, Stack } from "./parts";

interface Props {
  editor: Editor;
  title: string;
  layout: PageLayout;
  onLayout: (patch: Partial<PageLayout>) => void;
  /** Opens a new document made here (after asking to save this one). */
  onGenerated: (content: JSONContent, layout: Partial<PageLayout>, title: string) => void;
}

const IN = 96;

function Small(p: { icon: LucideIcon; label: string; title?: string; disabled?: boolean; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={p.title ?? p.label}
      disabled={p.disabled}
      aria-pressed={p.active}
      onMouseDown={keepFocus}
      onClick={p.onClick}
      className={`flex h-7 items-center gap-1 rounded px-1 text-xs disabled:opacity-35 ${p.active ? "bg-blue-100 text-blue-800" : "hover:bg-slate-200/70"}`}
    >
      <p.icon size={16} /> {p.label}
    </button>
  );
}

const field = (attrs: Partial<FieldAttrs>) => ({ type: "mergeField", attrs });

export function MailingsTab(p: Props) {
  const { editor } = p;
  const merge = p.layout.mailMerge;
  const setMerge = (patch: Partial<MailMerge>) => p.onLayout({ mailMerge: { ...merge, ...patch } });
  const hasList = merge.records.length > 0;
  const preview = previewOf(editor.view);
  const included = includedRecords(merge);
  const insert = (content: JSONContent | JSONContent[]) => editor.chain().focus().insertContent(content).run();
  const file = useRef<HTMLInputElement>(null);

  const takeList = (fields: string[], records: Record<string, string>[], source: string) =>
    setMerge({ fields, records, excluded: [], match: guessMatch(fields, merge.match), source, type: merge.type === "none" ? "letters" : merge.type });

  return (
    <>
      <Group label="Create">
        <MenuButton big arrow={false} icon={Mail} label="Envelopes" menu={(close) => <EnvelopeForm editor={editor} onDone={close} onCreate={(doc, layout) => p.onGenerated(doc, layout, "Envelope")} />} />
        <MenuButton big arrow={false} icon={Tags} label="Labels" menu={(close) => <LabelsForm editor={editor} onDone={close} onCreate={(doc, layout) => p.onGenerated(doc, layout, "Labels")} />} />
      </Group>

      <Group label="Start Mail Merge">
        <MenuButton
          big
          icon={FileStack}
          label={"Start Mail\nMerge"}
          menu={(close) => (
            <div className="w-60">
              {(
                [
                  ["letters", "Letters"],
                  ["email", "E-mail Messages"],
                  ["directory", "Directory"],
                ] as [MergeType, string][]
              ).map(([type, name]) => (
                <MenuItem key={type} label={name} checked={merge.type === type} onClick={() => (close(), setMerge({ type }))} />
              ))}
              {/* Envelopes and labels make a new document laid out for them, with an address block to merge. */}
              <MenuItem
                label="Envelopes…"
                checked={merge.type === "envelopes"}
                onClick={() => {
                  close();
                  const envelope = ENVELOPES[0];
                  p.onGenerated(envelopeDoc([field({ kind: "address" })], "", envelope), { ...envelopeLayout(envelope), mailMerge: { ...merge, type: "envelopes" } }, "Envelope merge");
                }}
              />
              <MenuItem
                label="Labels…"
                checked={merge.type === "labels"}
                onClick={() => {
                  close();
                  const sheet = LABEL_SHEETS[0];
                  p.onGenerated(labelsDoc([field({ kind: "address" })], sheet, false), { ...labelsLayout(sheet), mailMerge: { ...merge, type: "labels" } }, "Labels merge");
                }}
              />
              <div className="my-1 border-t border-slate-200" />
              <MenuItem label="Normal Word Document" checked={merge.type === "none"} onClick={() => (close(), setMerge({ type: "none" }))} />
            </div>
          )}
        />
        <MenuButton
          big
          icon={Users}
          label={"Select\nRecipients"}
          menu={(close) => (
            <Choices
              more="Type a New List…"
              form={(back) => (
                <RecipientGrid
                  fields={NEW_LIST_FIELDS}
                  records={[Object.fromEntries(NEW_LIST_FIELDS.map((f) => [f, ""]))]}
                  onCancel={back}
                  onSave={(fields, records) => {
                    close();
                    takeList(fields, records, "Typed in");
                  }}
                />
              )}
            >
              <div className="w-60">
                <MenuItem
                  label="Use an Existing List…"
                  hint="CSV"
                  onClick={() => {
                    close();
                    file.current?.click();
                  }}
                />
                {hasList && (
                  <MenuItem
                    icon={Trash2}
                    label="Remove the List"
                    onClick={() => {
                      close();
                      setMerge({ ...NO_MERGE, type: merge.type });
                      setPreview(editor.view, { on: false });
                    }}
                  />
                )}
              </div>
            </Choices>
          )}
        />
        <input
          ref={file}
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          hidden
          onChange={async (e) => {
            const chosen = e.target.files?.[0];
            e.target.value = "";
            if (!chosen) return;
            const { fields, records } = parseCsv(await chosen.text());
            if (fields.length) takeList(fields, records, chosen.name);
          }}
        />
        <MenuButton
          big
          arrow={false}
          icon={ListChecks}
          label={"Edit\nRecipient List"}
          disabled={!hasList}
          title={hasList ? "Edit Recipient List" : "Edit Recipient List (select recipients first)"}
          menu={(close) => <RecipientList merge={merge} onMerge={setMerge} onDone={close} />}
        />
      </Group>

      <Group label="Write & Insert Fields">
        <Big icon={Highlighter} label={"Highlight\nMerge Fields"} active={preview.highlight} onClick={() => setPreview(editor.view, { highlight: !preview.highlight })} />
        <MenuButton big arrow={false} icon={Contact} label={"Address\nBlock"} menu={(close) => <AddressForm merge={merge} onDone={close} onInsert={(o) => insert(field({ kind: "address", options: JSON.stringify(o) }))} />} />
        <MenuButton big arrow={false} icon={MailOpen} label={"Greeting\nLine"} menu={(close) => <GreetingForm merge={merge} onDone={close} onInsert={(o) => insert(field({ kind: "greeting", options: JSON.stringify(o) }))} />} />
        <MenuButton
          big
          icon={Plus}
          label={"Insert Merge\nField"}
          menu={(close) => (
            <div className="max-h-80 w-56 overflow-y-auto">
              {merge.fields.length ? <Heading>Fields in the list</Heading> : <p className="px-2 py-1.5 text-sm text-slate-500">Select recipients first (Select Recipients).</p>}
              {merge.fields.map((name) => (
                <MenuItem key={name} label={name} onClick={() => (close(), insert(field({ kind: "field", name })))} />
              ))}
            </div>
          )}
        />
        <Stack>
          <MenuButton
            icon={Shuffle}
            label="Rules"
            showLabel
            menu={(close) => (
              <RulesMenu
                merge={merge}
                onInsert={(attrs) => {
                  close();
                  insert(field(attrs));
                }}
              />
            )}
          />
          <MenuButton icon={ArrowDownAZ} label="Match Fields" showLabel arrow={false} disabled={!hasList} menu={(close) => <MatchFields merge={merge} onMerge={setMerge} onDone={close} />} />
          <Small
            icon={Tags}
            label="Update Labels"
            disabled={merge.type !== "labels"}
            onClick={() => editor.chain().setMeta(UNTRACKED, true).setContent(updateLabels(editor.getJSON()), true).run()}
          />
        </Stack>
      </Group>

      <Group label="Preview Results">
        <Big icon={SquareCheck} label={"Preview\nResults"} active={preview.on} disabled={!hasList} onClick={() => setPreview(editor.view, { on: !preview.on })} />
        <Stack>
          <div className="flex items-center gap-0.5">
            <Nav icon={ChevronFirst} label="First Record" disabled={!preview.on} onClick={() => setPreview(editor.view, { at: 0 })} />
            <Nav icon={ChevronLeft} label="Previous Record" disabled={!preview.on || preview.at <= 0} onClick={() => setPreview(editor.view, { at: preview.at - 1 })} />
            <input
              aria-label="Record"
              value={preview.on ? preview.at + 1 : ""}
              disabled={!preview.on}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 1 && n <= included.length) setPreview(editor.view, { at: n - 1 });
              }}
              className="h-6 w-10 rounded border border-slate-300 bg-surface text-center text-xs disabled:opacity-40"
            />
            <Nav icon={ChevronRight} label="Next Record" disabled={!preview.on || preview.at >= included.length - 1} onClick={() => setPreview(editor.view, { at: preview.at + 1 })} />
            <Nav icon={ChevronLast} label="Last Record" disabled={!preview.on} onClick={() => setPreview(editor.view, { at: included.length - 1 })} />
          </div>
          <MenuButton icon={Search} label="Find Recipient" showLabel arrow={false} disabled={!hasList} menu={(close) => <FindRecipient merge={merge} editor={editor} onDone={close} />} />
          <MenuButton icon={AlertTriangle} label="Check for Errors" showLabel arrow={false} disabled={merge.type === "none"} menu={() => <CheckErrors editor={editor} merge={merge} />} />
        </Stack>
      </Group>

      <Group label="Finish">
        <MenuButton
          big
          icon={FileStack}
          label={"Finish &\nMerge"}
          disabled={!hasList || merge.type === "none"}
          menu={(close) => <FinishMenu {...p} onDone={close} />}
        />
      </Group>
    </>
  );
}

const Nav = (p: { icon: LucideIcon; label: string; disabled?: boolean; onClick: () => void }) => (
  <button type="button" title={p.label} aria-label={p.label} disabled={p.disabled} onMouseDown={keepFocus} onClick={p.onClick} className="flex h-6 w-6 items-center justify-center rounded hover:bg-slate-200/70 disabled:opacity-35">
    <p.icon size={15} />
  </button>
);

// ---- Envelopes and labels ----

const envelopeLayout = (e: (typeof ENVELOPES)[number]): Partial<PageLayout> => ({
  width: e.h,
  height: e.w,
  orientation: "landscape",
  margins: { top: 0.4 * IN, right: 0.4 * IN, bottom: 0.4 * IN, left: 0.4 * IN },
});

const labelsLayout = (s: (typeof LABEL_SHEETS)[number]): Partial<PageLayout> => {
  const paper = PAGE_SIZES.find((x) => x.id === s.paper)!;
  return { width: paper.w, height: paper.h, orientation: "portrait", margins: { top: s.top, right: s.side, bottom: 0.2 * IN, left: s.side } };
};

const textLines = (text: string): JSONContent[] =>
  text.split("\n").flatMap((line, i) => [...(i ? [{ type: "hardBreak" }] : []), ...(line ? [{ type: "text", text: line }] : [])]);

/** What's selected, as an address to start with (Word fills in the selection). */
const selectedText = (editor: Editor) => {
  const { from, to } = editor.state.selection;
  return editor.state.doc.textBetween(from, to, "\n").trim();
};

function EnvelopeForm({ editor, onDone, onCreate }: { editor: Editor; onDone: () => void; onCreate: (doc: JSONContent, layout: Partial<PageLayout>) => void }) {
  const [delivery, setDelivery] = useState(selectedText(editor));
  const [from, setFrom] = useState("");
  const [size, setSize] = useState(ENVELOPES[0].id);
  return (
    <Form
      title="Envelopes"
      ok={delivery.trim().length > 0}
      problem="Type the delivery address."
      cancel="Cancel"
      onCancel={onDone}
      onApply={() => {
        onDone();
        const envelope = ENVELOPES.find((e) => e.id === size)!;
        onCreate(envelopeDoc(textLines(delivery.trim()), from.trim(), envelope), envelopeLayout(envelope));
      }}
    >
      <Area label="Delivery address" value={delivery} onChange={setDelivery} rows={4} autoFocus />
      <Area label="Return address" value={from} onChange={setFrom} rows={3} />
      <Pick label="Envelope size" value={size} onChange={setSize} options={ENVELOPES.map((e) => [e.id, e.name])} />
      <p className="text-xs text-slate-500">OK makes a new document laid out as the envelope, to print.</p>
    </Form>
  );
}

function LabelsForm({ editor, onDone, onCreate }: { editor: Editor; onDone: () => void; onCreate: (doc: JSONContent, layout: Partial<PageLayout>) => void }) {
  const [address, setAddress] = useState(selectedText(editor));
  const [sheetId, setSheetId] = useState(LABEL_SHEETS[0].id);
  const [full, setFull] = useState(true);
  const sheet = LABEL_SHEETS.find((s) => s.id === sheetId)!;
  return (
    <Form
      title="Labels"
      ok
      cancel="Cancel"
      onCancel={onDone}
      onApply={() => {
        onDone();
        onCreate(labelsDoc(textLines(address.trim()), sheet, full), labelsLayout(sheet));
      }}
    >
      <Area label="Address" value={address} onChange={setAddress} rows={4} autoFocus />
      <Pick label="Label" value={sheetId} onChange={setSheetId} options={LABEL_SHEETS.map((s) => [s.id, s.name])} />
      <p className="text-xs text-slate-500">
        {sheet.across} × {sheet.down} labels, each {(sheet.w / IN).toFixed(2)} × {(sheet.h / IN).toFixed(2)} in
      </p>
      <fieldset className="flex gap-3 text-sm">
        <label className="flex items-center gap-1">
          <input type="radio" checked={full} onChange={() => setFull(true)} /> Full page of the same label
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={!full} onChange={() => setFull(false)} /> Single label
        </label>
      </fieldset>
    </Form>
  );
}

// ---- Recipients ----

/** Type a New List, and editing a list: a grid of the recipients' details. */
function RecipientGrid(p: { fields: string[]; records: Record<string, string>[]; onSave: (fields: string[], records: Record<string, string>[]) => void; onCancel: () => void }) {
  const [fields, setFields] = useState(p.fields);
  const [rows, setRows] = useState(p.records.length ? p.records : [{}]);
  const [newColumn, setNewColumn] = useState("");
  const set = (i: number, f: string, value: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [f]: value } : r)));
  return (
    <div className="flex w-[min(760px,90vw)] flex-col gap-2 p-1.5">
      <h3 className="text-sm font-semibold">New Address List</h3>
      <div className="max-h-[50vh] overflow-auto rounded border border-slate-200">
        <table className="border-collapse text-xs">
          <thead className="sticky top-0 bg-slate-100">
            <tr>
              <th className="w-6" />
              {fields.map((f) => (
                <th key={f} className="border-l border-slate-200 px-1.5 py-1 text-left font-medium whitespace-nowrap">
                  <span className="flex items-center gap-1">
                    {f}
                    <button type="button" title={`Delete the ${f} column`} onClick={() => setFields(fields.filter((x) => x !== f))} className="text-slate-400 hover:text-red-600">
                      ×
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-200">
                <td className="px-1 text-center">
                  <button type="button" title="Delete this entry" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600">
                    <Trash2 size={12} />
                  </button>
                </td>
                {fields.map((f) => (
                  <td key={f} className="border-l border-slate-200 p-0">
                    <input value={r[f] ?? ""} onChange={(e) => set(i, f, e.target.value)} className="w-28 bg-transparent px-1.5 py-1 outline-none focus:bg-blue-50" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => setRows([...rows, {}])} className="flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-100">
          <Plus size={14} /> New Entry
        </button>
        <input value={newColumn} placeholder="New column name" onChange={(e) => setNewColumn(e.target.value)} className="w-36 rounded border border-slate-300 px-2 py-1 text-xs" />
        <button
          type="button"
          disabled={!newColumn.trim() || fields.includes(newColumn.trim())}
          onClick={() => {
            setFields([...fields, newColumn.trim()]);
            setNewColumn("");
          }}
          className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
        >
          Add Column
        </button>
        <span className="flex-1" />
        <button type="button" onClick={p.onCancel} className="rounded px-3 py-1 hover:bg-slate-100">
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            p.onSave(
              fields,
              rows.filter((r) => fields.some((f) => (r[f] ?? "").trim())).map((r) => Object.fromEntries(fields.map((f) => [f, (r[f] ?? "").trim()]))),
            )
          }
          className="rounded bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-700"
        >
          OK
        </button>
      </div>
    </div>
  );
}

/** Edit Recipient List: tick who's in the merge, sort, search, and edit the list. */
function RecipientList({ merge, onMerge, onDone }: { merge: MailMerge; onMerge: (patch: Partial<MailMerge>) => void; onDone: () => void }) {
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <RecipientGrid
        fields={merge.fields}
        records={merge.records}
        onCancel={() => setEditing(false)}
        onSave={(fields, records) => {
          onMerge({ fields, records, excluded: [], match: guessMatch(fields, merge.match) });
          setEditing(false);
        }}
      />
    );
  }
  const shown = merge.records.map((r, i) => ({ r, i })).filter(({ r }) => !filter || Object.values(r).some((v) => v.toLowerCase().includes(filter.toLowerCase())));
  const toggle = (i: number) => onMerge({ excluded: merge.excluded.includes(i) ? merge.excluded.filter((x) => x !== i) : [...merge.excluded, i] });
  const sortBy = (f: string) => onMerge({ records: [...merge.records].sort((a, b) => (a[f] ?? "").localeCompare(b[f] ?? "", undefined, { numeric: true })), excluded: [] });
  const columns = merge.fields.slice(0, 8);
  return (
    <div className="flex w-[min(760px,90vw)] flex-col gap-2 p-1.5">
      <h3 className="text-sm font-semibold">Mail Merge Recipients</h3>
      <p className="text-xs text-slate-500">
        {merge.source} · {merge.records.length - merge.excluded.length} of {merge.records.length} in the merge. Click a column name to sort.
      </p>
      <input value={filter} placeholder="Filter: type to find recipients" onChange={(e) => setFilter(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm" />
      <div className="max-h-[45vh] overflow-auto rounded border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-slate-100">
            <tr>
              <th className="w-7 px-1">
                <input
                  type="checkbox"
                  aria-label="All"
                  checked={merge.excluded.length === 0}
                  onChange={(e) => onMerge({ excluded: e.target.checked ? [] : merge.records.map((_, i) => i) })}
                />
              </th>
              {columns.map((f) => (
                <th key={f} className="cursor-pointer border-l border-slate-200 px-1.5 py-1 text-left font-medium whitespace-nowrap hover:bg-slate-200" onClick={() => sortBy(f)}>
                  {f}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map(({ r, i }) => (
              <tr key={i} className="border-t border-slate-200">
                <td className="px-1 text-center">
                  <input type="checkbox" checked={!merge.excluded.includes(i)} onChange={() => toggle(i)} aria-label={`Include record ${i + 1}`} />
                </td>
                {columns.map((f) => (
                  <td key={f} className="max-w-40 truncate border-l border-slate-200 px-1.5 py-1">
                    {r[f]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between gap-2 text-sm">
        <button type="button" onClick={() => setEditing(true)} className="rounded px-2 py-1 hover:bg-slate-100">
          Edit…
        </button>
        <button type="button" onClick={onDone} className="rounded bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-700">
          OK
        </button>
      </div>
    </div>
  );
}

function MatchFields({ merge, onMerge, onDone }: { merge: MailMerge; onMerge: (patch: Partial<MailMerge>) => void; onDone: () => void }) {
  const [match, setMatch] = useState(merge.match);
  return (
    <Form title="Match Fields" ok cancel="Cancel" onCancel={onDone} onApply={() => (onDone(), onMerge({ match }))}>
      <p className="text-xs text-slate-500">Which column of your list each part of an address is in.</p>
      {ADDRESS_FIELDS.map((std) => (
        <Pick
          key={std}
          label={std}
          value={match[std] ?? ""}
          onChange={(column) => setMatch({ ...match, [std]: column })}
          options={[["", "(not matched)"], ...merge.fields.map((f) => [f, f] as [string, string])]}
        />
      ))}
    </Form>
  );
}

// ---- Fields ----

function AddressForm({ merge, onInsert, onDone }: { merge: MailMerge; onInsert: (o: AddressOptions) => void; onDone: () => void }) {
  const [o, setO] = useState(DEFAULT_ADDRESS);
  const sample = includedRecords(merge)[0]?.r;
  return (
    <Form title="Insert Address Block" ok cancel="Cancel" onCancel={onDone} onApply={() => (onDone(), onInsert(o))}>
      <Pick
        label="Recipient's name"
        value={o.name}
        onChange={(name) => setO({ ...o, name: name as AddressOptions["name"] })}
        options={[
          ["title-full", "Mr. Joshua Randall"],
          ["full", "Joshua Randall"],
          ["first", "Joshua"],
        ]}
      />
      <Check label="Insert company name" checked={o.company} onChange={(company) => setO({ ...o, company })} />
      <Check label="Insert country or region" checked={o.country} onChange={(country) => setO({ ...o, country })} />
      <Sample>{sample ? addressBlock(merge, sample, o).join("\n") || "(this recipient has no address)" : "«AddressBlock»"}</Sample>
    </Form>
  );
}

function GreetingForm({ merge, onInsert, onDone }: { merge: MailMerge; onInsert: (o: GreetingOptions) => void; onDone: () => void }) {
  const [o, setO] = useState(DEFAULT_GREETING);
  const sample = includedRecords(merge)[0]?.r;
  return (
    <Form title="Insert Greeting Line" ok cancel="Cancel" onCancel={onDone} onApply={() => (onDone(), onInsert(o))}>
      <div className="grid grid-cols-3 gap-1.5">
        <select value={o.salutation} onChange={(e) => setO({ ...o, salutation: e.target.value })} className="rounded border border-slate-300 bg-surface px-1 py-0.5 text-sm">
          {["Dear", "To", "Hello", ""].map((s) => (
            <option key={s} value={s}>
              {s || "(none)"}
            </option>
          ))}
        </select>
        <select value={o.name} onChange={(e) => setO({ ...o, name: e.target.value as GreetingOptions["name"] })} className="rounded border border-slate-300 bg-surface px-1 py-0.5 text-sm">
          <option value="full">Joshua Randall</option>
          <option value="first">Joshua</option>
          <option value="title-last">Mr. Randall</option>
        </select>
        <select value={o.punctuation} onChange={(e) => setO({ ...o, punctuation: e.target.value })} className="rounded border border-slate-300 bg-surface px-1 py-0.5 text-sm">
          {[",", ":", ""].map((s) => (
            <option key={s} value={s}>
              {s || "(none)"}
            </option>
          ))}
        </select>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Greeting line for invalid recipient names
        <input value={o.fallback} onChange={(e) => setO({ ...o, fallback: e.target.value })} className="rounded border border-slate-300 px-2 py-1" />
      </label>
      <Sample>{sample ? greetingLine(merge, sample, o) : "«GreetingLine»"}</Sample>
    </Form>
  );
}

function RulesMenu({ merge, onInsert }: { merge: MailMerge; onInsert: (attrs: Partial<FieldAttrs>) => void }) {
  const [rule, setRule] = useState<"if" | "skip" | null>(null);
  if (rule) return <RuleForm kind={rule} merge={merge} onCancel={() => setRule(null)} onInsert={onInsert} />;
  return (
    <div className="w-56">
      <MenuItem label="If…Then…Else…" onClick={() => setRule("if")} />
      <MenuItem label="Skip Record If…" onClick={() => setRule("skip")} />
      <MenuItem label="Merge Record #" onClick={() => onInsert({ kind: "record" })} />
      {!merge.fields.length && <p className="px-2 pt-1 text-xs text-slate-500">Rules use the list&apos;s fields: select recipients first.</p>}
    </div>
  );
}

function RuleForm({ kind, merge, onInsert, onCancel }: { kind: "if" | "skip"; merge: MailMerge; onInsert: (attrs: Partial<FieldAttrs>) => void; onCancel: () => void }) {
  const [name, setName] = useState(merge.fields[0] ?? "");
  const [op, setOp] = useState<Comparison>("equal");
  const [value, setValue] = useState("");
  const [then, setThen] = useState("");
  const [otherwise, setOtherwise] = useState("");
  const needsValue = op !== "blank" && op !== "notBlank";
  return (
    <Form
      title={kind === "if" ? "Insert Word Field: IF" : "Insert Word Field: Skip Record If"}
      ok={Boolean(name)}
      problem="Select recipients first, to have fields to compare."
      onCancel={onCancel}
      onApply={() => onInsert({ kind, name, op, value, then, otherwise })}
    >
      <Pick label="Field name" value={name} onChange={setName} options={merge.fields.map((f) => [f, f])} />
      <Pick label="Comparison" value={op} onChange={(v) => setOp(v as Comparison)} options={COMPARISONS.map((c) => [c.id, c.name])} />
      {needsValue && <Line label="Compare to" value={value} onChange={setValue} />}
      {kind === "if" && (
        <>
          <Area label="Insert this text:" value={then} onChange={setThen} rows={2} />
          <Area label="Otherwise insert this text:" value={otherwise} onChange={setOtherwise} rows={2} />
        </>
      )}
    </Form>
  );
}

// ---- Preview ----

function FindRecipient({ merge, editor, onDone }: { merge: MailMerge; editor: Editor; onDone: () => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const find = () => {
    const records = includedRecords(merge);
    const from = previewOf(editor.view).at;
    const hit = [...records.slice(from + 1), ...records.slice(0, from + 1)].find(({ r }) => Object.values(r).some((v) => v.toLowerCase().includes(text.toLowerCase())));
    if (!hit) return setResult("No recipient matches.");
    setPreview(editor.view, { on: true, at: records.indexOf(hit) });
    setResult(`Showing recipient ${records.indexOf(hit) + 1}.`);
  };
  return (
    <Form title="Find Entry" ok={text.trim().length > 0} cancel="Close" onCancel={onDone} onApply={find}>
      <Line label="Find" value={text} onChange={setText} autoFocus />
      {result && <p className="text-xs text-slate-500">{result}</p>}
    </Form>
  );
}

const fieldsIn = (doc: JSONContent): FieldAttrs[] => {
  const out: FieldAttrs[] = [];
  const visit = (n: JSONContent) => {
    if (n.type === "mergeField") out.push(n.attrs as FieldAttrs);
    n.content?.forEach(visit);
  };
  visit(doc);
  return out;
};

/** Check for Errors: what would go wrong in the merge. */
function CheckErrors({ editor, merge }: { editor: Editor; merge: MailMerge }) {
  const fields = fieldsIn(editor.getJSON());
  const problems: string[] = [];
  if (!merge.records.length) problems.push("There's no recipient list (Select Recipients).");
  else if (!includedRecords(merge).length) problems.push("Every recipient is left out of the merge (Edit Recipient List).");
  if (!fields.length) problems.push("The document has no merge fields yet.");
  const missing = [...new Set(fields.filter((f) => (f.kind === "field" || f.kind === "if" || f.kind === "skip") && !merge.fields.includes(f.name)).map((f) => f.name))];
  for (const name of missing) problems.push(`«${name}» isn't a column in the list.`);
  if (fields.some((f) => f.kind === "address" || f.kind === "greeting") && !merge.match["Last Name"] && !merge.match["First Name"])
    problems.push("Names aren't matched to the list's columns (Match Fields).");
  return (
    <div className="w-72 p-2 text-sm">
      <h3 className="mb-1 font-semibold">Check for Errors</h3>
      {problems.length ? (
        <ul className="list-disc space-y-1 pl-5 text-slate-700">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : (
        <p className="text-slate-600">No mail merge errors have been found in {merge.source || "the list"}.</p>
      )}
    </div>
  );
}

// ---- Finish ----

function FinishMenu(p: Props & { onDone: () => void }) {
  const [step, setStep] = useState<"edit" | "print" | "email" | null>(null);
  const merge = p.layout.mailMerge;
  const at = previewOf(p.editor.view).at;
  if (step === "email") return <EmailForm {...p} onCancel={() => setStep(null)} />;
  if (step)
    return (
      <WhichRecords
        title={step === "edit" ? "Merge to New Document" : "Merge to Printer"}
        count={includedRecords(merge).length}
        onCancel={() => setStep(null)}
        onApply={(which) => {
          p.onDone();
          const records = includedRecords(merge);
          const chosen = which === "all" ? "all" : which === "current" ? [records[at]?.i ?? 0] : records.slice(which[0] - 1, which[1]).map(({ i }) => i);
          const merged = mergeAll(p.editor.getJSON(), merge, chosen);
          if (step === "edit") p.onGenerated(merged, { ...p.layout, mailMerge: NO_MERGE }, `${p.title} (merged)`);
          else printDoc(p.editor, merged, p.layout);
        }}
      />
    );
  return (
    <div className="w-60">
      <MenuItem icon={FileStack} label="Edit Individual Documents…" onClick={() => setStep("edit")} />
      <MenuItem icon={Printer} label="Print Documents…" onClick={() => setStep("print")} />
      <MenuItem icon={Mail} label="Send Email Messages…" onClick={() => setStep("email")} />
    </div>
  );
}

function WhichRecords(p: { title: string; count: number; onCancel: () => void; onApply: (which: "all" | "current" | [number, number]) => void }) {
  const [which, setWhich] = useState<"all" | "current" | "range">("all");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(p.count);
  return (
    <Form title={p.title} ok={which !== "range" || (from >= 1 && to >= from)} problem="Pick records from 1 up." onCancel={p.onCancel} onApply={() => p.onApply(which === "range" ? [from, to] : which)}>
      <p className="text-xs text-slate-500">Merge records:</p>
      {(
        [
          ["all", "All"],
          ["current", "Current record"],
          ["range", "From"],
        ] as const
      ).map(([id, name]) => (
        <label key={id} className="flex items-center gap-1.5 text-sm">
          <input type="radio" checked={which === id} onChange={() => setWhich(id)} /> {name}
          {id === "range" && (
            <>
              <input type="number" min={1} value={from} onChange={(e) => setFrom(Number(e.target.value))} className="w-14 rounded border border-slate-300 px-1" />
              to
              <input type="number" min={1} value={to} onChange={(e) => setTo(Number(e.target.value))} className="w-14 rounded border border-slate-300 px-1" />
            </>
          )}
        </label>
      ))}
    </Form>
  );
}

/** Prints the merged documents, from a page of their own (the editor's page has the whole OS around it). */
function printDoc(editor: Editor, doc: JSONContent, layout: PageLayout) {
  const html = generateHTML(doc, editor.extensionManager.extensions);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  document.body.append(frame);
  const w = layout.orientation === "portrait" ? layout.width : layout.height;
  const h = layout.orientation === "portrait" ? layout.height : layout.width;
  const m = layout.margins;
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${w}px ${h}px;margin:${m.top}px ${m.right}px ${m.bottom}px ${m.left}px}body{margin:0;font-family:system-ui,sans-serif;font-size:16px;line-height:1.6}[data-page-break]{break-after:page}table{border-collapse:collapse}p{margin:0 0 .6em}</style></head><body>${html}</body></html>`;
  frame.onload = () => {
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  };
}

/** Send Email Messages: one message per recipient, opened in your mail app (Docs can't send mail itself). */
function EmailForm(p: Props & { onCancel: () => void }) {
  const merge = p.layout.mailMerge;
  const [to, setTo] = useState(merge.match["E-mail Address"] ?? merge.fields.find((f) => /mail/i.test(f)) ?? "");
  const [subject, setSubject] = useState(p.title);
  const [ready, setReady] = useState(false);
  if (ready) {
    const doc = p.editor.getJSON();
    const messages = includedRecords(merge)
      .filter(({ r }) => (r[to] ?? "").includes("@"))
      .map(({ r, i }, n) => {
        const body = generateText(mergeAll(doc, { ...merge, records: [r], excluded: [] }, "all"), p.editor.extensionManager.extensions, { blockSeparator: "\n" });
        return { i, address: r[to], href: `mailto:${encodeURIComponent(r[to])}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.slice(0, 1800))}`, n };
      });
    return (
      <div className="w-80 p-2 text-sm">
        <h3 className="mb-1 font-semibold">Messages ready</h3>
        <p className="mb-2 text-xs text-slate-500">Each opens in your mail app, filled in, to send from there. Docs can&apos;t send e-mail by itself.</p>
        <div className="max-h-64 overflow-y-auto">
          {messages.map((m) => (
            <a key={m.i} href={m.href} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-100">
              <Mail size={14} className="text-slate-500" /> {m.address}
            </a>
          ))}
          {!messages.length && <p className="text-slate-500">No recipient has an e-mail address in “{to}”.</p>}
        </div>
      </div>
    );
  }
  return (
    <Form title="Merge to E-mail" ok={Boolean(to)} problem="Pick the column with the e-mail addresses." onCancel={p.onCancel} onApply={() => setReady(true)}>
      <Pick label="To" value={to} onChange={setTo} options={merge.fields.map((f) => [f, f])} />
      <Line label="Subject line" value={subject} onChange={setSubject} />
    </Form>
  );
}

// ---- Small form parts ----

const Pick = (p: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) => (
  <label className="flex items-center justify-between gap-2 text-sm">
    {p.label}
    <select value={p.value} onChange={(e) => p.onChange(e.target.value)} className="max-w-[60%] rounded border border-slate-300 bg-surface px-1.5 py-0.5">
      {p.options.map(([v, name]) => (
        <option key={v} value={v}>
          {name}
        </option>
      ))}
    </select>
  </label>
);

const Line = (p: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) => (
  <label className="flex flex-col gap-1 text-sm">
    {p.label}
    <input autoFocus={p.autoFocus} value={p.value} onChange={(e) => p.onChange(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
  </label>
);

const Area = (p: { label: string; value: string; onChange: (v: string) => void; rows: number; autoFocus?: boolean }) => (
  <label className="flex flex-col gap-1 text-sm">
    {p.label}
    <textarea autoFocus={p.autoFocus} rows={p.rows} value={p.value} onChange={(e) => p.onChange(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
  </label>
);

const Check = (p: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex items-center gap-2 text-sm">
    <input type="checkbox" checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} /> {p.label}
  </label>
);

const Sample = ({ children }: { children: ReactNode }) => (
  <div>
    <p className="text-xs text-slate-500">Preview</p>
    <pre className="mt-0.5 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 font-sans text-sm whitespace-pre-wrap">{children}</pre>
  </div>
);
