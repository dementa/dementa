"use client";

// Charts: the form for typing a chart's data (Insert › Chart, and Chart Design › Edit Data), and
// the Chart Design tab that shows while a chart is selected.

import type { Editor } from "@tiptap/react";
import { ChartArea, ChartBarBig, ChartColumnBig, ChartLine, ChartPie, Donut, Sheet, Tags, Trash2 } from "lucide-react";
import { useState } from "react";
import { CHART_TYPES, chartSvg, NEW_CHART, parseSpec, readChart, type ChartSpec, type ChartType } from "../charts";
import { svgUrl } from "../graphics";
import { Choice, inputClass, Preview, primaryClass, Problem, Title } from "./insertPanels";
import { Big, Divider, Group, MenuButton, type IconType } from "./parts";

export const CHART_ICONS: Record<ChartType, IconType> = {
  column: ChartColumnBig,
  bar: ChartBarBig,
  line: ChartLine,
  area: ChartArea,
  pie: ChartPie,
  doughnut: Donut,
};

/** The selected chart's settings, or null when the selection isn't a chart. */
export function selectedChart(editor: Editor): ChartSpec | null {
  return editor.isActive("image") ? parseSpec(editor.getAttributes("image").chart) : null;
}

/** The picture attributes that show a chart and remember how to draw it again. */
function chartAttrs(spec: ChartSpec) {
  const read = readChart(spec);
  if (!("points" in read)) return null;
  return {
    src: svgUrl(chartSvg(spec, read.points)),
    alt: spec.title.trim() || `${CHART_TYPES.find((t) => t.id === spec.type)!.name} chart`,
    chart: JSON.stringify(spec),
  };
}

/** New chart (Insert tab), or the selected one (`editing`) with an Update button. */
export function ChartForm({ editor, editing, onDone }: { editor: Editor; editing?: ChartSpec; onDone: () => void }) {
  const [spec, setSpec] = useState<ChartSpec>(editing ?? NEW_CHART);
  const change = (patch: Partial<ChartSpec>) => setSpec((s) => ({ ...s, ...patch }));
  const read = readChart(spec);
  const src = "points" in read ? svgUrl(chartSvg(spec, read.points)) : null;

  function apply() {
    const attrs = chartAttrs(spec);
    if (!attrs) return;
    if (editing) editor.chain().focus().updateAttributes("image", attrs).run();
    else editor.chain().focus().insertContent({ type: "image", attrs }).run();
    onDone();
  }

  return (
    <div className="flex w-[26rem] flex-col gap-2">
      <Title>{editing ? "Edit Chart" : "Insert Chart"}</Title>
      <Choice options={CHART_TYPES} value={spec.type} onChange={(type) => change({ type })} columns={3} />
      <input value={spec.title} onChange={(e) => change({ title: e.target.value })} placeholder="Title (optional)" aria-label="Chart title" className={inputClass} />
      <label className="text-xs font-medium text-slate-600" htmlFor="docs-chart-data">
        One line each: a name, then a number
      </label>
      <textarea
        id="docs-chart-data"
        rows={3}
        value={spec.data}
        onChange={(e) => change({ data: e.target.value })}
        className={`${inputClass} resize-none font-mono`}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={spec.labels} onChange={(e) => change({ labels: e.target.checked })} />
        Show the numbers on the chart
      </label>
      {"problem" in read && <Problem>{read.problem}</Problem>}
      <Preview src={src} alt="Chart preview" />
      <div className="flex justify-end">
        <button disabled={!src} onClick={apply} className={primaryClass}>
          {editing ? "Update chart" : "Insert chart"}
        </button>
      </div>
    </div>
  );
}

/** Word's Chart Design tab: change the type, show the numbers, edit the data. */
export function ChartTab({ editor, spec, onError }: { editor: Editor; spec: ChartSpec; onError: (text: string) => void }) {
  function update(patch: Partial<ChartSpec>) {
    const next = { ...spec, ...patch };
    const read = readChart(next);
    if ("problem" in read) return onError(read.problem);
    editor.chain().focus().updateAttributes("image", chartAttrs(next)!).run();
  }

  return (
    <>
      <Group label="Type">
        {CHART_TYPES.map((t) => (
          <Big key={t.id} icon={CHART_ICONS[t.id]} label={t.name} active={spec.type === t.id} onClick={() => update({ type: t.id })} />
        ))}
      </Group>
      <Divider />
      <Group label="Chart Elements">
        <Big icon={Tags} label={"Data\nLabels"} title="Show the numbers on the chart" active={spec.labels} onClick={() => update({ labels: !spec.labels })} />
      </Group>
      <Divider />
      <Group label="Data">
        {/* The key opens the form fresh for each chart. */}
        <MenuButton
          key={JSON.stringify(spec)}
          big
          arrow={false}
          icon={Sheet}
          label={"Edit\nData"}
          menu={(close) => <ChartForm editor={editor} editing={spec} onDone={close} />}
        />
      </Group>
      <Divider />
      <Group label="Chart">
        <Big icon={Trash2} label={"Delete\nChart"} danger onClick={() => editor.chain().focus().deleteSelection().run()} />
      </Group>
    </>
  );
}
