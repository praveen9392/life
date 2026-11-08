import { api } from "../core/api.js";
import { lineChart, responsive } from "../core/charts.js";
import { h, clear } from "../core/dom.js";
import { addDays, fmtDayMonth, fmtDuration, isoDate, plural, todayISO } from "../core/format.js";
import { emptyState, errorState, pageHeader, progressBar, segmented, skeletonRows, statCard } from "../core/ui.js";

export default async function insights(view) {
  let period = "week";
  let data = null;
  let cal = null;
  let error = null;
  const host = h("div");

  async function load() {
    clear(host).append(skeletonRows(4));
    try {
      data = await api.analytics(period);
      cal = await api.calendar(data.start_date, data.end_date).catch(() => null);
      error = null;
    } catch (e) { error = e; }
    draw();
  }

  const rateOf = (done, due) => (due ? Math.min(100, Math.round((done / due) * 100)) : null);

  function draw() {
    if (error) { clear(host).append(errorState(error, load)); return; }
    const d = data;
    const today = todayISO();
    const nothing = !d.habits.length && !d.tasks_due && !d.learning_sessions && !d.workout_sessions && !d.goals_active;
    if (nothing) { clear(host).append(h("div", { class: "card" }, emptyState({ icon: "insights", title: "Not enough data yet", text: "Log a few habits, tasks or workouts and your trends will show up here." }))); return; }
    const stats = h("div", { class: "stats" },
      statCard({ label: "Habit completion", value: d.habit_completion_percent == null ? "-" : `${Math.round(d.habit_completion_percent)}%`, sub: d.habits.length ? `Across ${plural(d.habits.length, "habit")}` : "No habits yet" }),
      statCard({ label: "Task completion", value: d.tasks_due ? `${Math.round(d.task_completion_percent)}%` : "-", sub: d.tasks_due ? `${d.tasks_completed} of ${d.tasks_due} due tasks` : "No tasks were due" }),
      statCard({ label: "Learning", value: fmtDuration(d.learning_minutes) || "0m", sub: plural(d.learning_sessions, "session") }),
      statCard({ label: "Workouts", value: String(d.workout_sessions), sub: d.workout_sessions === 1 ? "session" : "sessions" }),
      statCard({ label: "Active goals", value: String(d.goals_active), sub: d.goals_active ? `Average ${Math.round(d.goals_average_progress)}% complete` : "None in progress" }),
      statCard({ label: "Best current streak", value: String(d.best_current_streak), sub: d.best_current_streak === 1 ? "day" : "days" }));

    let trend = null;
    if (cal && cal.days.length) {
      const dayList = cal.days.filter((x) => x.date <= today);
      const labels = dayList.map((x) => fmtDayMonth(x.date));
      trend = h("section", { class: "card" }, h("div", { class: "row-gap", style: { marginBottom: "8px", flexWrap: "wrap" } }, h("h2", { style: { fontSize: "16px", flex: 1 } }, "Daily completion"), h("div", { class: "legend" }, h("span", null, h("i", { style: { background: "var(--m-tasks)" } }), "Tasks (solid)"), h("span", null, h("i", { style: { background: "var(--accent)" } }), "Habits (dashed)"))),
        responsive((width) => lineChart({ width, labels, series: [{ name: "Tasks", color: "var(--m-tasks)", values: dayList.map((x) => rateOf(x.tasks_completed, x.tasks_due)) }, { name: "Habits", color: "var(--accent)", dash: "6 5", values: dayList.map((x) => rateOf(x.habits_completed, x.habits_due)) }], ariaLabel: `Daily task and habit completion, ${period}` })),
        h("p", { class: "faint", style: { fontSize: "13px", marginTop: "4px" } }, "Days with nothing due have no point. Lines only join days that have data."));
    }

    const habits = [...d.habits].sort((a, b) => b.rate_percent - a.rate_percent);
    const habitCard = h("section", { class: "card card-flush" }, h("div", { class: "card-head" }, h("h2", null, "Habit completion rates"), h("span", { class: "sub" }, `${fmtDayMonth(d.start_date)} – ${fmtDayMonth(d.end_date)}`)),
      habits.length ? h("div", { class: "rows" }, habits.map((x) => h("div", { class: "row" }, h("div", { class: "row-main" }, h("div", { class: "row-gap", style: { justifyContent: "space-between" } }, h("span", { class: "row-title truncate" }, x.name), h("strong", { class: "tnum" }, `${Math.round(x.rate_percent)}%`)),
        h("div", { style: { margin: "6px 0 2px" } }, progressBar(x.rate_percent, `${x.name} completion`)), h("div", { class: "row-meta" }, h("span", null, `${x.completed} of ${plural(x.expected, "day")}`), x.current_streak ? h("span", null, `Streak ${x.current_streak}`) : null))))) : emptyState({ icon: "habits", title: "No habits tracked", text: "Create a habit to see completion rates." }));

    clear(host).append(h("div", { class: "stack" }, stats, trend, habitCard));
  }

  view.replaceChildren(
    pageHeader({ eyebrow: "Review", title: "Insights", module: "insights", subtitle: "How the period is going, in plain numbers.", actions: [segmented([["week", "This week"], ["month", "This month"]], period, (v) => { period = v; load(); }, "Period")] }),
    host);
  await load();
}

