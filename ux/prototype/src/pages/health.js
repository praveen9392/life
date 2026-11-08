import { api } from "../core/api.js";
import { lineChart, responsive, sparkline } from "../core/charts.js";
import { events, h, clear } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { fmtDateTime, isoDate, plural, relTime } from "../core/format.js";
import { chip, confirmDialog, emptyState, errorState, pageHeader, skeletonRows, statCard, toast, toastError } from "../core/ui.js";
import { METRIC_TYPES, healthForm } from "../forms.js";

const LABEL = Object.fromEntries(METRIC_TYPES.map(([v, l]) => [v, l]));
const fmtVal = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

export default async function health(view) {
  let type = "";
  let items = [];
  let error = null;
  const chipsHost = h("div", { class: "chip-scroll", role: "group", "aria-label": "Metric type", style: { marginBottom: "16px" } });
  const bodyHost = h("div");

  async function load() {
    clear(bodyHost).append(skeletonRows(4));
    try { items = (await api.health.list(type || undefined)).items; error = null; } catch (e) { error = e; }
    draw();
  }

  async function remove(m) {
    if (!(await confirmDialog({ title: "Delete this entry?", message: `${fmtVal(m.value)} ${m.unit} (${LABEL[m.metric_type] ?? m.metric_type}) will be removed.` }))) return;
    try { await api.health.remove(m.id); items = items.filter((x) => x.id !== m.id); toast("Entry deleted"); events.emit("data"); draw(); } catch (e) { toastError(e); }
  }

  const byTypeAsc = (t) => items.filter((m) => m.metric_type === t).sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));

  function overview() {
    const types = [...new Set(items.map((m) => m.metric_type))];
    if (!types.length) return null;
    return h("div", { class: "grid-3", style: { marginBottom: "16px" } }, types.map((t) => {
      const series = byTypeAsc(t);
      const last = series.at(-1);
      const prev = series.at(-2);
      const delta = prev ? last.value - prev.value : null;
      return h("button", { type: "button", class: "card", style: { textAlign: "left", cursor: "pointer" }, onclick: () => { type = t; draw(); load(); }, "aria-label": `${LABEL[t] ?? t}: latest ${fmtVal(last.value)} ${last.unit}. Open details` },
        h("div", { class: "row-gap" }, h("span", { class: "muted", style: { flex: 1, fontWeight: 600 } }, LABEL[t] ?? t), h("span", { class: "faint", style: { fontSize: "13px" } }, relTime(last.recorded_at))),
        h("div", { class: "row-gap", style: { alignItems: "baseline", marginTop: "4px" } }, h("span", { class: "display tnum", style: { fontSize: "28px" } }, fmtVal(last.value)), h("span", { class: "muted" }, last.unit)),
        h("div", { class: "row-gap", style: { marginTop: "8px", justifyContent: "space-between" } }, h("span", { class: "faint", style: { fontSize: "13px" } }, delta == null ? plural(series.length, "entry", "entries") : `${delta > 0 ? "+" : ""}${fmtVal(Math.round(delta * 100) / 100)} since previous`), sparkline(series.map((m) => m.value))));
    }));
  }

  function detail() {
    const series = byTypeAsc(type);
    if (!series.length) return null;
    const values = series.map((m) => m.value);
    const lo = Math.min(...values), hi = Math.max(...values);
    const pad = (hi - lo) * 0.2 || Math.max(1, hi * 0.05);
    const unit = series.at(-1).unit;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const first = series[0], last = series.at(-1);
    const labels = series.map((m) => isoDate(new Date(m.recorded_at)).slice(5).replace("-", "/"));
    return h("div", { class: "stack", style: { marginBottom: "16px" } },
      h("div", { class: "stats" },
        statCard({ label: "Latest", value: `${fmtVal(last.value)}`, sub: `${last.unit} - ${relTime(last.recorded_at)}` }),
        statCard({ label: "Average", value: fmtVal(Math.round(avg * 100) / 100), sub: `${unit} across ${plural(series.length, "entry", "entries")}` }),
        statCard({ label: "Change", value: `${last.value - first.value > 0 ? "+" : ""}${fmtVal(Math.round((last.value - first.value) * 100) / 100)}`, sub: `${unit} since first entry` }),
        statCard({ label: "Range", value: `${fmtVal(lo)}–${fmtVal(hi)}`, sub: unit })),
      series.length > 1 ? h("section", { class: "card" }, h("h2", { style: { fontSize: "16px", marginBottom: "8px" } }, `${LABEL[type] ?? type} over time`),
        responsive((width) => lineChart({ width, labels, series: [{ name: LABEL[type] ?? type, color: "var(--accent)", values }], min: Math.floor((lo - pad) * 10) / 10, max: Math.ceil((hi + pad) * 10) / 10, unit: "", ariaLabel: `${LABEL[type]} trend, ${series.length} entries` }))) : null);
  }

  function draw() {
    clear(chipsHost).append(...[["", "All"], ...METRIC_TYPES.map(([v, l]) => [v, l])].map(([v, l]) => h("button", { type: "button", class: "chip", "aria-pressed": String(type === v), onclick: () => { type = v; draw(); load(); } }, l)));
    if (error) { clear(bodyHost).append(errorState(error, load)); return; }
    if (!items.length) {
      clear(bodyHost).append(h("div", { class: "card" }, emptyState({ icon: "health", title: type ? `No ${LABEL[type].toLowerCase()} logged yet` : "Nothing logged yet", text: "Weight, sleep, water, steps, heart rate - log a number and watch the trend.", action: h("button", { class: "btn btn-primary", type: "button", onclick: () => healthForm({ type: type || "weight" }) }, "Log a metric") })));
      return;
    }
    const sorted = [...items].sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
    const rows = h("div", { class: "card card-flush" }, h("div", { class: "card-head" }, h("h2", null, "History"), h("span", { class: "sub" }, plural(items.length, "entry", "entries"))), h("div", { class: "rows" }, sorted.map((m) => {
      const del = h("button", { class: "btn btn-ghost btn-icon btn-sm", type: "button", "aria-label": `Delete ${fmtVal(m.value)} ${m.unit} entry`, onclick: () => remove(m) }, icon("trash", 18));
      return h("div", { class: "row" }, h("div", { class: "row-main" }, h("div", { class: "row-title tnum" }, `${fmtVal(m.value)} ${m.unit}`),
        h("div", { class: "row-meta" }, !type ? chip(LABEL[m.metric_type] ?? m.metric_type) : null, h("span", null, fmtDateTime(m.recorded_at)), m.note ? h("span", { class: "truncate" }, m.note) : null)), h("div", { class: "row-actions" }, del));
    })));
    clear(bodyHost).append(type ? detail() : overview(), rows);
  }

  view.replaceChildren(
    pageHeader({ eyebrow: "Routines", title: "Health", module: "health", subtitle: "Numbers that tell you how you're doing.", actions: [h("button", { class: "btn btn-primary", type: "button", onclick: () => healthForm({ type: type || "weight" }) }, icon("plus", 18), "Log metric")] }),
    chipsHost, bodyHost);
  await load();
}

