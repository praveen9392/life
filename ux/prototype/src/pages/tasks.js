import { api } from "../core/api.js";
import { debounce, events, h, clear } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { addDays, fmtDate, fmtDuration, fmtTime, isoDate, plural, todayISO } from "../core/format.js";
import { query, setQuery } from "../core/router.js";
import { chip, confirmDialog, emptyState, errorState, input, openMenu, pageHeader, segmented, select, skeletonRows, statCard, toast, toastError } from "../core/ui.js";
import { taskForm } from "../forms.js";

const PRIORITY = { urgent: ["Urgent", "danger"], high: ["High", "warn"], medium: ["", ""], low: ["Low", ""] };
const STATUS_LABEL = { pending: "To do", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };
const GROUPS = [["overdue", "Overdue"], ["today", "Today"], ["upcoming", "Upcoming"], ["none", "No date"], ["done", "Finished"]];

export default async function tasks(view, ctx) {
  const q = query();
  const f = { search: q.get("search") ?? "", due: q.get("due") ?? "all", status: q.get("status") ?? "", priority: q.get("priority") ?? "", list: q.get("list") ?? "" };
  const today = todayISO();
  let items = [];
  let total = 0;
  let page = 1;
  let loading = false;
  let loadError = null;
  let dead = false;

  const statsHost = h("div", { class: "stats", style: { marginBottom: "16px" } });
  const listHost = h("div");
  const resultsLine = h("div", { class: "muted", style: { fontSize: "14px" }, role: "status", "aria-live": "polite" });

  const params = (p = 1) => {
    const out = { page_size: 50, page: p };
    if (f.search) out.search = f.search;
    if (f.due === "today") out.due_on = today;
    else if (f.due === "overdue") out.overdue = true;
    else if (f.due === "upcoming") out.due_from = addDays(today, 1);
    if (f.status) out.status = f.status;
    if (f.priority) out.priority = f.priority;
    if (f.list) out.list = f.list;
    return out;
  };
  const filtered = () => f.search || f.due !== "all" || f.status || f.priority || f.list;
  const saveUrl = () => setQuery({ search: f.search, due: f.due === "all" ? "" : f.due, status: f.status, priority: f.priority, list: f.list, new: "" });

  async function load(reset = true) {
    if (reset) { page = 1; items = []; }
    loading = true; loadError = null;
    if (reset) { clear(listHost).append(skeletonRows(5)); }
    try {
      const res = await api.tasks.list(params(page));
      if (dead) return;
      items = reset ? res.items : [...items, ...res.items];
      total = res.total;
    } catch (e) { loadError = e; }
    loading = false;
    drawList();
  }

  async function loadStats() {
    try {
      const [dueToday, overdue, progress, completed] = await Promise.all([
        api.tasks.list({ due_on: today, page_size: 1 }), api.tasks.list({ overdue: true, page_size: 1 }),
        api.tasks.list({ status: "in_progress", page_size: 1 }), api.tasks.list({ status: "completed", page_size: 100 }),
      ]);
      if (dead) return;
      const doneToday = completed.items.filter((t) => t.completed_at && isoDate(new Date(t.completed_at)) === today).length;
      const capped = completed.total > completed.items.length;
      drawStats.data = { dueToday: dueToday.total, overdue: overdue.total, progress: progress.total, doneToday, capped };
      drawStats();
    } catch { clear(statsHost); }
  }
  function drawStats() {
    const d = drawStats.data;
    if (!d) return;
    const card = (label, value, sub, key, val) => statCard({ label, value: String(value), sub, onClick: () => { if (key === "due") { f.due = f.due === val ? "all" : val; f.status = ""; } else { f.status = f.status === val ? "" : val; f.due = "all"; } saveUrl(); syncControls(); load(); drawStats(); }, pressed: key === "due" ? f.due === val : f.status === val });
    clear(statsHost).append(
      card("Due today", d.dueToday, "Scheduled for today", "due", "today"),
      card("Overdue", d.overdue, "Past their due date", "due", "overdue"),
      card("In progress", d.progress, "Started, not finished", "status", "in_progress"),
      card("Completed today", d.capped ? `${d.doneToday}+` : d.doneToday, d.capped ? "From your latest 100 completed" : "Finished today", "status", "completed"));
  }

  async function setStatus(task, status) {
    const prev = task.status;
    task.status = status;
    drawList();
    try {
      const saved = await api.tasks.update(task.id, { status });
      Object.assign(task, saved);
      events.emit("data");
      loadStats();
      drawList();
    } catch (e) { task.status = prev; drawList(); toastError(e); }
  }

  async function remove(task) {
    if (!(await confirmDialog({ title: "Delete this task?", message: `"${task.title}" will be permanently deleted.` }))) return;
    try {
      await api.tasks.remove(task.id);
      items = items.filter((t) => t.id !== task.id);
      total -= 1;
      toast("Task deleted");
      events.emit("data");
      loadStats();
      drawList();
    } catch (e) { toastError(e); }
  }

  function row(task) {
    const done = task.status === "completed";
    const cancelled = task.status === "cancelled";
    const overdue = !done && !cancelled && task.due_date && task.due_date < today;
    const [pLabel, pTone] = PRIORITY[task.priority] ?? ["", ""];
    const check = h("button", { class: "checkbtn", type: "button", role: "checkbox", "aria-checked": String(done), "aria-label": `${task.title}: ${STATUS_LABEL[task.status]}. Toggle complete`, onclick: () => setStatus(task, done ? "pending" : "completed") }, icon("check", 16));
    const more = h("button", { class: "btn btn-ghost btn-icon btn-sm", type: "button", "aria-label": `Actions for ${task.title}`, "aria-haspopup": "menu", onclick: () => openMenu(more, [
      { label: "Edit", icon: "edit", onClick: () => taskForm({ task }) },
      task.status === "in_progress" ? { label: "Move back to to-do", icon: "repeat", onClick: () => setStatus(task, "pending") } : { label: "Start (in progress)", icon: "clock", onClick: () => setStatus(task, "in_progress") },
      cancelled ? { label: "Reopen", icon: "repeat", onClick: () => setStatus(task, "pending") } : { label: "Cancel task", icon: "x", onClick: () => setStatus(task, "cancelled") },
      "-", { label: "Delete…", icon: "trash", danger: true, onClick: () => remove(task) },
    ]) }, icon("more", 18));
    return h("div", { class: `row${done || cancelled ? " is-done" : ""}${overdue ? " is-overdue" : ""}` }, check,
      h("div", { class: "row-main" },
        h("button", { type: "button", class: "row-title truncate", style: { background: "none", border: 0, padding: 0, textAlign: "left", maxWidth: "100%", color: "inherit", cursor: "pointer" }, onclick: () => taskForm({ task }) }, task.title),
        h("div", { class: "row-meta" },
          task.due_date ? h("span", { style: overdue ? { color: "var(--danger)", fontWeight: 600 } : null }, `${fmtDate(task.due_date)}${task.due_time ? `, ${fmtTime(task.due_time)}` : ""}`) : null,
          pLabel ? chip(pLabel, pTone) : null,
          task.status === "in_progress" ? chip("In progress", "info") : null, cancelled ? chip("Cancelled") : null,
          task.recurrence_rule ? h("span", { class: "row-gap", title: "Repeats" }, icon("repeat", 13), task.recurrence_rule.frequency) : null,
          task.estimated_duration_minutes ? h("span", null, fmtDuration(task.estimated_duration_minutes)) : null,
          ...task.tags.map((t) => chip(t.name)))),
      h("div", { class: "row-actions" }, more));
  }

  const groupOf = (t) => (t.status === "completed" || t.status === "cancelled" ? "done" : !t.due_date ? "none" : t.due_date < today ? "overdue" : t.due_date === today ? "today" : "upcoming");

  function drawList() {
    resultsLine.textContent = loadError ? "" : `${plural(total, "task")}${filtered() ? " match your filters" : ""}`;
    if (loadError) { clear(listHost).append(errorState(loadError, () => load())); return; }
    if (!items.length) {
      clear(listHost).append(h("div", { class: "card" }, filtered()
        ? emptyState({ icon: "search", title: "No tasks match", text: "Try a different search or clear the filters.", action: h("button", { class: "btn btn-secondary", type: "button", onclick: () => { Object.assign(f, { search: "", due: "all", status: "", priority: "", list: "" }); saveUrl(); syncControls(); load(); drawStats(); } }, "Clear filters") })
        : emptyState({ icon: "tasks", title: "No tasks yet", text: "Capture what's on your mind and give it a day.", action: h("button", { class: "btn btn-primary", type: "button", onclick: () => taskForm() }, "Add your first task") })));
      return;
    }
    const grouped = Object.fromEntries(GROUPS.map(([k]) => [k, []]));
    items.forEach((t) => grouped[groupOf(t)].push(t));
    const card = h("div", { class: "card card-flush" }, GROUPS.filter(([k]) => grouped[k].length).map(([k, label]) =>
      h("section", { "aria-label": label }, h("div", { class: "group-label" }, label, h("span", { class: "faint" }, grouped[k].length)), h("div", { class: "rows" }, grouped[k].map(row)))));
    clear(listHost).append(card, items.length < total ? h("div", { style: { textAlign: "center", marginTop: "16px" } }, h("button", { class: "btn btn-secondary", type: "button", disabled: loading, onclick: () => { page += 1; load(false); } }, `Load more (${total - items.length} left)`)) : null);
  }

  /* toolbar */
  const search = input({ type: "search", placeholder: "Search tasks", "aria-label": "Search tasks", value: f.search });
  const onSearch = debounce(() => { f.search = search.value.trim(); saveUrl(); load(); }, 300);
  search.addEventListener("input", onSearch);
  const dueSeg = () => segmented([["all", "All"], ["today", "Today"], ["overdue", "Overdue"], ["upcoming", "Upcoming"]], f.due, (v) => { f.due = v; saveUrl(); load(); drawStats(); }, "Due date");
  const dueHost = h("div");
  const statusSel = select([["", "Any status"], ["pending", "To do"], ["in_progress", "In progress"], ["completed", "Completed"], ["cancelled", "Cancelled"]], f.status, { "aria-label": "Status", style: { width: "auto" }, onchange: (e) => { f.status = e.target.value; saveUrl(); load(); drawStats(); } });
  const prioSel = select([["", "Any priority"], ["urgent", "Urgent"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]], f.priority, { "aria-label": "Priority", style: { width: "auto" }, onchange: (e) => { f.priority = e.target.value; saveUrl(); load(); } });
  const listSel = select([["", "Any list"], ["today", "Today list"], ["upcoming", "Upcoming list"], ["later", "Later list"]], f.list, { "aria-label": "List", style: { width: "auto" }, onchange: (e) => { f.list = e.target.value; saveUrl(); load(); } });
  function syncControls() { dueHost.replaceChildren(dueSeg()); statusSel.value = f.status; prioSel.value = f.priority; listSel.value = f.list; search.value = f.search; }
  syncControls();

  view.replaceChildren(
    pageHeader({ eyebrow: "Plan", title: "Tasks", subtitle: "Everything you've committed to, in one list.", module: "tasks", actions: [h("button", { class: "btn btn-primary", type: "button", onclick: () => taskForm() }, icon("plus", 18), "New task")] }),
    statsHost,
    h("div", { class: "toolbar" }, h("div", { class: "grow" }, search), dueHost, statusSel, prioSel, listSel),
    resultsLine, h("div", { style: { height: "8px" } }), listHost);

  await Promise.all([load(), loadStats()]);
  if (q.get("new") === "1") { setQuery({ new: "" }); taskForm(); }
  return () => { dead = true; onSearch.cancel(); };
}
