import { api } from "../core/api.js";
import { h, clear, events } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { addDays, fmtDuration, fmtLongDate, fmtMonth, fmtTime, isoDate, parseISO, plural, startOfWeek, todayISO } from "../core/format.js";
import { query, setQuery } from "../core/router.js";
import { chip, emptyState, errorState, pageHeader, segmented, skeletonRows, toastError } from "../core/ui.js";
import { taskForm } from "../forms.js";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function calendar(view) {
  const today = todayISO();
  const q = query();
  let selected = q.get("date") || today;
  let mode = q.get("view") === "week" ? "week" : "month";
  let anchor = selected;
  let days = new Map();
  let error = null;
  let loadId = 0;

  const grid = h("div");
  const panel = h("aside", { class: "card", "aria-label": "Selected day", "aria-live": "polite" });
  const label = h("strong", { role: "status", "aria-live": "polite", style: { flex: "1", minWidth: "0", textAlign: "center", fontFamily: "var(--font-display)", fontSize: "20px" } });

  const range = () => {
    if (mode === "week") { const s = startOfWeek(anchor); return [s, addDays(s, 6)]; }
    const first = `${anchor.slice(0, 7)}-01`;
    const last = isoDate(new Date(parseISO(first).getFullYear(), parseISO(first).getMonth() + 1, 0));
    return [startOfWeek(first), addDays(startOfWeek(last), 6)];
  };

  async function load() {
    const id = ++loadId;
    clear(grid).append(skeletonRows(4));
    const [s, e] = range();
    try {
      const res = await api.calendar(s, e);
      if (id !== loadId) return;
      days = new Map(res.days.map((d) => [d.date, d]));
      error = null;
    } catch (err) { if (id !== loadId) return; error = err; }
    draw();
  }

  function pips(d) {
    if (!d) return null;
    const out = [];
    if (d.tasks_due) out.push(h("span", { title: "Tasks done / due" }, icon("tasks", 11), `${d.tasks_completed}/${d.tasks_due}`));
    if (d.habits_due && d.date <= today) out.push(h("span", { title: "Habits done / due" }, icon("habits", 11), `${d.habits_completed}/${d.habits_due}`));
    if (d.workout_sessions) out.push(h("span", { title: "Workouts" }, icon("workouts", 11), String(d.workout_sessions)));
    if (d.learning_minutes) out.push(h("span", { title: "Learning" }, icon("learning", 11), fmtDuration(d.learning_minutes)));
    if (d.milestones_due) out.push(h("span", { title: "Milestones due" }, icon("goals", 11), String(d.milestones_due)));
    return h("div", { class: "pips" }, out);
  }

  function dayButton(date) {
    const d = days.get(date);
    const month = anchor.slice(0, 7);
    const summary = d ? [d.tasks_due && `${d.tasks_completed} of ${d.tasks_due} tasks`, d.habits_due && date <= today && `${d.habits_completed} of ${d.habits_due} habits`, d.workout_sessions && plural(d.workout_sessions, "workout"), d.learning_minutes && `${d.learning_minutes} minutes of learning`].filter(Boolean).join(", ") : "";
    return h("button", { type: "button", class: `day${date === today ? " today" : ""}${date === selected ? " sel" : ""}${mode === "month" && date.slice(0, 7) !== month ? " out" : ""}`, "aria-pressed": String(date === selected), "aria-label": `${fmtLongDate(date)}${summary ? `: ${summary}` : ""}`,
      onclick: () => { selected = date; setQuery({ date: date === today ? "" : date }); draw(); } }, h("span", { class: "num" }, parseISO(date).getDate()), pips(d));
  }

  function drawPanel() {
    const d = days.get(selected);
    const body = h("div", { class: "stack-sm" }, h("h2", { style: { fontSize: "18px", fontFamily: "var(--font-display)" } }, fmtLongDate(selected)));
    if (d) {
      body.append(h("div", { class: "row-gap", style: { flexWrap: "wrap" } },
        d.habits_due && selected <= today ? chip(`${d.habits_completed}/${d.habits_due} habits`, d.habits_completed === d.habits_due ? "accent" : "") : null,
        d.workout_sessions ? chip(plural(d.workout_sessions, "workout")) : null, d.learning_minutes ? chip(`${fmtDuration(d.learning_minutes)} learning`) : null, d.milestones_due ? chip(`${plural(d.milestones_due, "milestone")} due`, "warn") : null));
    }
    const list = h("div", { class: "rows", style: { marginTop: "8px" } }, skeletonRows(2));
    body.append(h("h3", { style: { fontSize: "14px", marginTop: "8px" } }, "Tasks due"), list,
      h("div", { class: "row-gap", style: { marginTop: "12px", flexWrap: "wrap" } }, h("button", { class: "btn btn-secondary btn-sm", type: "button", onclick: () => taskForm({ defaults: { due_date: selected, list: selected === today ? "today" : "upcoming" } }) }, icon("plus", 16), "Add task"), h("a", { class: "btn btn-ghost btn-sm", href: "/app/habits", "data-link": "" }, "Open habits")));
    clear(panel).append(body);
    const forDay = selected;
    api.tasks.list({ due_on: forDay, page_size: 50 }).then((r) => {
      if (forDay !== selected) return;
      clear(list).append(...(r.items.length ? r.items.map((t) => h("button", { type: "button", class: `row${t.status === "completed" ? " is-done" : ""}`, style: { width: "100%", border: 0, textAlign: "left" }, onclick: () => taskForm({ task: t }) },
        h("span", { class: "dot", style: { background: t.status === "completed" ? "var(--accent)" : "var(--m-tasks)" } }), h("div", { class: "row-main" }, h("div", { class: "row-title truncate" }, t.title), t.due_time ? h("div", { class: "row-meta" }, fmtTime(t.due_time)) : null))) : [h("p", { class: "muted", style: { padding: "8px 0" } }, "No tasks due on this day.")]));
    }).catch((e) => { clear(list).append(h("p", { class: "muted" }, "Couldn't load tasks.")); toastError(e); });
  }

  function draw() {
    const [s, e] = range();
    label.textContent = mode === "month" ? fmtMonth(anchor) : `${fmtLongDate(s).replace(/^\w+, /, "")} – ${fmtLongDate(e).replace(/^\w+, /, "")}`;
    drawPanel();
    if (error) { clear(grid).append(errorState(error, load)); return; }
    const cells = [];
    for (let d = s; d <= e; d = addDays(d, 1)) cells.push(dayButton(d));
    clear(grid).append(h("div", { class: "cal", role: "group", "aria-label": "Calendar" }, ...DOW.map((x) => h("div", { class: "dow", "aria-hidden": "true" }, x)), ...cells));
  }

  const shift = (n) => { anchor = mode === "month" ? isoDate(new Date(parseISO(anchor).getFullYear(), parseISO(anchor).getMonth() + n, 1)) : addDays(anchor, 7 * n); load(); };
  const nav = h("div", { class: "row-gap" },
    h("button", { class: "btn btn-secondary btn-icon btn-sm", type: "button", "aria-label": mode === "month" ? "Previous month" : "Previous week", onclick: () => shift(-1) }, icon("left", 18)), label,
    h("button", { class: "btn btn-secondary btn-icon btn-sm", type: "button", "aria-label": mode === "month" ? "Next month" : "Next week", onclick: () => shift(1) }, icon("right", 18)),
    h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { anchor = today; selected = today; setQuery({ date: "" }); load(); } }, "Today"));
  const seg = segmented([["month", "Month"], ["week", "Week"]], mode, (v) => { mode = v; setQuery({ view: v === "week" ? "week" : "" }); nav.children[0].setAttribute("aria-label", v === "month" ? "Previous month" : "Previous week"); nav.children[2].setAttribute("aria-label", v === "month" ? "Next month" : "Next week"); load(); }, "Calendar view");

  view.replaceChildren(
    pageHeader({ eyebrow: "Plan", title: "Calendar", module: "calendar", subtitle: "Your week at a glance. Pick a day for details.", actions: [h("button", { class: "btn btn-primary", type: "button", onclick: () => taskForm({ defaults: { due_date: selected } }) }, icon("plus", 18), "Add task")] }),
    h("div", { class: "toolbar" }, nav, h("span", { class: "spacer" }), seg),
    h("div", { class: "cal-layout" }, grid, panel));
  await load();
}
