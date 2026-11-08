import { api } from "../core/api.js";
import { h, clear, events } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { fmtDate, fmtDuration, fmtLongDate, fmtTime, greeting, plural } from "../core/format.js";
import { chip, emptyState, openMenu, ring, segmented, statCard, toast, toastError, errorState } from "../core/ui.js";
import { habitForm, taskForm } from "../forms.js";

const PRIORITY = { urgent: ["Urgent", "danger"], high: ["High", "warn"], medium: ["", ""], low: ["Low", ""] };
const hourOf = (t) => (t ? Number(t.split(":")[0]) : null);

export default async function today(view, ctx) {
  let s = await api.dashboard();
  let tab = "all";
  const first = (ctx.user.full_name || "").split(" ")[0];

  const percent = () => {
    const total = s.habits_due_today + s.tasks_due_today;
    return total ? Math.floor(((s.habits_completed_today + s.tasks_completed_today) / total) * 100) : null;
  };

  const progressRing = ring(percent(), "of today");
  const heroSub = h("p", { class: "hero-sub" });
  const heroChips = h("div", { class: "hero-chips" });
  const habitsHost = h("div");
  const tasksHost = h("div");

  const drawHero = () => {
    const total = s.habits_due_today + s.tasks_due_today;
    heroSub.textContent = total === 0
      ? "Nothing is scheduled for today. Enjoy the space, or add something."
      : `${s.habits_completed_today} of ${plural(s.habits_due_today, "habit")} and ${s.tasks_completed_today} of ${plural(s.tasks_due_today, "task")} done.`;
    clear(heroChips).append(
      chip(`Habits ${s.habits_completed_today}/${s.habits_due_today}`, s.habits_due_today && s.habits_completed_today === s.habits_due_today ? "accent" : ""),
      chip(`Tasks ${s.tasks_completed_today}/${s.tasks_due_today}`, s.tasks_due_today && s.tasks_completed_today === s.tasks_due_today ? "accent" : ""),
      s.best_current_streak > 0 ? h("span", { class: "chip chip-warn" }, icon("flame", 14), `Best streak ${plural(s.best_current_streak, "day")}`) : null);
    progressRing.update(percent());
  };

  /* ----- habits ----- */
  async function toggleHabit(entry, next) {
    const prev = entry.status;
    const wasDone = prev === "completed";
    entry.status = next;
    if (entry.is_due) s.habits_completed_today += (next === "completed" ? 1 : 0) - (wasDone ? 1 : 0);
    drawHero(); drawHabits();
    try {
      if (next === null) await api.habits.unlog(entry.habit.id, s.today);
      else await api.habits.log(entry.habit.id, s.today, next);
      events.emit("data");
      api.dashboard().then((fresh) => { s = fresh; drawHero(); drawHabits(); drawTasks(); }).catch(() => {});
    } catch (e) {
      entry.status = prev;
      if (entry.is_due) s.habits_completed_today += (wasDone ? 1 : 0) - (next === "completed" ? 1 : 0);
      drawHero(); drawHabits(); toastError(e);
    }
  }

  function habitRow(entry) {
    const done = entry.status === "completed";
    const skipped = entry.status === "skipped";
    const hb = entry.habit;
    const btn = h("button", { class: "checkbtn", type: "button", role: "checkbox", "aria-checked": String(done), "data-state": skipped ? "skipped" : "", "aria-label": `${hb.name}: ${done ? "completed" : skipped ? "skipped" : "not done"}. Toggle`, onclick: () => toggleHabit(entry, done || skipped ? null : "completed") }, icon(skipped ? "skip" : "check", 16));
    const more = h("button", { class: "btn btn-ghost btn-icon btn-sm", type: "button", "aria-label": `More for ${hb.name}`, "aria-haspopup": "menu", onclick: () => openMenu(more, [
      { label: skipped ? "Undo skip" : "Skip today", icon: "skip", onClick: () => toggleHabit(entry, skipped ? null : "skipped") },
      { label: "Edit habit", icon: "edit", onClick: () => habitForm({ habit: hb }) },
    ]) }, icon("more", 18));
    return h("div", { class: `row${done ? " is-done" : ""}` }, btn,
      h("div", { class: "row-main" }, h("div", { class: "row-title truncate" }, hb.name),
        h("div", { class: "row-meta" }, hb.category ? h("span", null, hb.category) : null, hb.reminder_time ? h("span", { class: "row-gap" }, icon("clock", 13), fmtTime(hb.reminder_time)) : null, skipped ? chip("Skipped", "warn") : null)),
      h("div", { class: "row-actions" }, more));
  }

  function drawHabits() {
    const due = s.habits.filter((e) => e.is_due);
    const off = s.habits.filter((e) => !e.is_due);
    const hasReminders = due.some((e) => e.habit.reminder_time);
    if (!hasReminders) tab = "all";
    const shown = due.filter((e) => tab === "all" || (tab === "morning" ? hourOf(e.habit.reminder_time) < 12 : hourOf(e.habit.reminder_time) >= 17) && e.habit.reminder_time);
    const head = h("div", { class: "card-head" }, h("div", { style: { flex: 1 } }, h("h2", null, "Habits"), h("div", { class: "sub" }, `${s.habits_completed_today} of ${due.length} done today`)),
      hasReminders ? segmented([["all", "All"], ["morning", "Morning"], ["evening", "Evening"]], tab, (v) => { tab = v; drawHabits(); }, "Habit time of day") : null,
      h("button", { class: "btn btn-ghost btn-icon btn-sm", type: "button", "aria-label": "New habit", onclick: () => habitForm() }, icon("plus", 18)));
    const body = !s.habits.length
      ? emptyState({ icon: "habits", title: "No habits yet", text: "Small daily actions add up. Start with one.", action: h("button", { class: "btn btn-primary", type: "button", onclick: () => habitForm() }, "Create a habit") })
      : h("div", null,
        shown.length ? h("div", { class: "rows" }, shown.map(habitRow)) : h("p", { class: "muted", style: { padding: "20px" } }, due.length ? "No habits in this part of the day." : "No habits scheduled today."),
        off.length ? h("details", { style: { borderTop: "1px solid var(--line)" } }, h("summary", { style: { padding: "12px 16px", cursor: "pointer", color: "var(--ink-2)", fontSize: "14px" } }, `Not scheduled today (${off.length})`),
          h("div", { class: "rows" }, off.map((e) => h("div", { class: "row" }, h("div", { class: "row-main" }, h("div", { class: "row-title muted truncate" }, e.habit.name)))))) : null);
    clear(habitsHost).append(h("section", { class: "card card-flush", "aria-labelledby": "h-habits" }, head, body));
    head.querySelector("h2").id = "h-habits";
  }

  /* ----- tasks ----- */
  async function toggleTask(task, listName) {
    const done = task.status === "completed";
    const next = done ? "pending" : "completed";
    const isToday = task.due_date === s.today;
    task.status = next;
    if (isToday) s.tasks_completed_today += next === "completed" ? 1 : -1;
    drawHero(); drawTasks();
    try {
      await api.tasks.update(task.id, { status: next });
      events.emit("data");
      api.dashboard().then((fresh) => { s = fresh; drawHero(); drawHabits(); drawTasks(); }).catch(() => {});
    } catch (e) {
      task.status = done ? "completed" : "pending";
      if (isToday) s.tasks_completed_today += next === "completed" ? -1 : 1;
      drawHero(); drawTasks(); toastError(e);
    }
  }

  function taskRow(task, overdue = false) {
    const done = task.status === "completed";
    const [pLabel, pTone] = PRIORITY[task.priority] ?? ["", ""];
    const btn = h("button", { class: "checkbtn", type: "button", role: "checkbox", "aria-checked": String(done), "aria-label": `${task.title}: ${done ? "completed" : "open"}. Toggle`, onclick: () => toggleTask(task) }, icon("check", 16));
    return h("div", { class: `row${done ? " is-done" : ""}${overdue && !done ? " is-overdue" : ""}` }, btn,
      h("div", { class: "row-main" }, h("button", { type: "button", class: "row-title truncate", style: { background: "none", border: 0, padding: 0, textAlign: "left", maxWidth: "100%", cursor: "pointer", color: "inherit" }, onclick: () => taskForm({ task }) }, task.title),
        h("div", { class: "row-meta" }, task.due_date ? h("span", { style: overdue && !done ? { color: "var(--danger)", fontWeight: 600 } : null }, `${fmtDate(task.due_date)}${task.due_time ? `, ${fmtTime(task.due_time)}` : ""}`) : null,
          pLabel ? chip(pLabel, pTone) : null, task.estimated_duration_minutes ? h("span", null, fmtDuration(task.estimated_duration_minutes)) : null, ...task.tags.map((t) => chip(t.name)))));
  }

  function drawTasks() {
    const todayTasks = [...s.tasks_today].sort((a, b) => (a.status === "completed") - (b.status === "completed"));
    const remaining = s.tasks_overdue.filter((t) => t.status !== "completed").length + todayTasks.filter((t) => t.status !== "completed").length;
    const section = (label, tasks, overdue) => (tasks.length ? [h("div", { class: "group-label" }, label), h("div", { class: "rows" }, tasks.map((t) => taskRow(t, overdue)))] : []);
    const empty = !s.tasks_overdue.length && !todayTasks.length && !s.tasks_upcoming.length;
    const head = h("div", { class: "card-head" }, h("div", { style: { flex: 1 } }, h("h2", { id: "h-tasks" }, "Tasks"), h("div", { class: "sub" }, remaining ? `${plural(remaining, "task")} left` : "Nothing left to do")),
      h("a", { class: "btn btn-ghost btn-sm", href: "/app/tasks", "data-link": "" }, "All tasks"),
      h("button", { class: "btn btn-ghost btn-icon btn-sm", type: "button", "aria-label": "New task", onclick: () => taskForm({ defaults: { due_date: s.today } }) }, icon("plus", 18)));
    clear(tasksHost).append(h("section", { class: "card card-flush", "aria-labelledby": "h-tasks" }, head,
      empty ? emptyState({ icon: "tasks", title: "Clear for today", text: "Add a task to plan your day.", action: h("button", { class: "btn btn-primary", type: "button", onclick: () => taskForm({ defaults: { due_date: s.today } }) }, "Add a task") })
        : [...section("Overdue", s.tasks_overdue, true), ...section("Today", todayTasks, false), ...section("Coming up", s.tasks_upcoming, false)]));
  }

  const stats = h("div", { class: "stats", style: { marginTop: "16px" } },
    statCard({ label: "Learning this week", value: fmtDuration(s.learning_minutes_this_week) || "0m", sub: "Time studied" }),
    statCard({ label: "Workouts this week", value: String(s.workout_sessions_this_week), sub: "Sessions logged" }),
    statCard({ label: "Notes this week", value: String(s.recent_notes_count), sub: "New or edited" }),
    statCard({ label: "Best current streak", value: String(s.best_current_streak), sub: s.best_current_streak === 1 ? "day" : "days" }));

  view.replaceChildren(
    h("header", { class: "hero" },
      h("div", { style: { minWidth: 0 } },
        h("div", { class: "eyebrow muted", style: { fontSize: "13px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "6px" } }, fmtLongDate(s.today)),
        h("h1", { id: "page-title", tabindex: "-1" }, `${greeting()}${first ? `, ${first}` : ""}`), heroSub, heroChips),
      progressRing),
    h("div", { class: "grid-2" }, habitsHost, tasksHost), stats);
  drawHero(); drawHabits(); drawTasks();
}
