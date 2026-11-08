import { api } from "../core/api.js";
import { barChart, responsive } from "../core/charts.js";
import { events, h, clear } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { addDays, fmtDateTime, fmtDayMonth, fmtDuration, isoDate, plural, startOfWeek, todayISO } from "../core/format.js";
import { confirmDialog, emptyState, errorState, pageHeader, skeletonRows, statCard, toast, toastError } from "../core/ui.js";
import { workoutForm } from "../forms.js";

const WEEKS = 8;

export default async function workouts(view) {
  const host = h("div");
  let sessions = [];
  let names = new Map();
  let error = null;

  async function load() {
    clear(host).append(skeletonRows(4));
    try {
      const [s, ex] = await Promise.all([api.workouts.sessions(), api.workouts.exercises().catch(() => [])]);
      sessions = s.items;
      names = new Map(ex.map((e) => [e.id, e.name]));
      error = null;
    } catch (e) { error = e; }
    draw();
  }
  const nameOf = (id) => names.get(id) ?? "Unnamed exercise";
  const dayOf = (s) => isoDate(new Date(s.performed_at));

  async function remove(s) {
    if (!(await confirmDialog({ title: "Delete this workout?", message: `The session on ${fmtDateTime(s.performed_at)} and its sets will be deleted.` }))) return;
    try { await api.workouts.removeSession(s.id); sessions = sessions.filter((x) => x.id !== s.id); toast("Workout deleted"); events.emit("data"); draw(); } catch (e) { toastError(e); }
  }

  function records() {
    const best = new Map();
    for (const s of sessions) for (const set of s.sets) {
      const r = best.get(set.exercise_id) ?? { weight: null, unit: "kg", reps: null };
      if (set.weight != null && (r.weight == null || set.weight > r.weight)) { r.weight = set.weight; r.unit = set.weight_unit ?? "kg"; r.repsAtWeight = set.reps; }
      if (set.reps != null && (r.reps == null || set.reps > r.reps)) r.reps = set.reps;
      best.set(set.exercise_id, r);
    }
    return [...best.entries()].map(([id, r]) => ({ id, ...r })).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  }

  function sessionCard(s) {
    const groups = new Map();
    [...s.sets].sort((a, b) => a.set_number - b.set_number).forEach((set) => { (groups.get(set.exercise_id) ?? groups.set(set.exercise_id, []).get(set.exercise_id)).push(set); });
    const del = h("button", { class: "btn btn-ghost btn-icon btn-sm", type: "button", "aria-label": `Delete workout from ${fmtDateTime(s.performed_at)}`, onclick: () => remove(s) }, icon("trash", 18));
    return h("article", { class: "card" },
      h("div", { class: "row-gap", style: { alignItems: "flex-start" } }, h("div", { style: { flex: 1, minWidth: 0 } }, h("h3", { style: { fontSize: "16px" } }, fmtDateTime(s.performed_at)),
        h("div", { class: "row-meta" }, s.duration_minutes != null ? h("span", { class: "row-gap" }, icon("clock", 13), fmtDuration(s.duration_minutes)) : null, h("span", null, plural(s.sets.length, "set")), s.notes ? h("span", { class: "truncate" }, s.notes) : null)), del),
      groups.size ? h("div", { class: "stack-sm", style: { marginTop: "12px" } }, [...groups.entries()].map(([id, sets]) => h("div", { style: { borderTop: "1px solid var(--line)", paddingTop: "8px" } },
        h("div", { class: "row-gap" }, h("strong", { style: { flex: 1, minWidth: 0 }, class: "truncate" }, nameOf(id)), h("span", { class: "faint", style: { fontSize: "13px" } }, plural(sets.length, "set"))),
        h("div", { class: "row-gap", style: { flexWrap: "wrap", marginTop: "4px" } }, sets.map((x) => h("span", { class: "chip tnum" }, `${x.reps ?? "–"}${x.weight != null ? ` × ${x.weight} ${x.weight_unit ?? "kg"}` : " reps"}`)))))) : h("p", { class: "muted", style: { marginTop: "8px" } }, "No sets recorded."));
  }

  function draw() {
    if (error) { clear(host).append(errorState(error, load)); return; }
    if (!sessions.length) {
      clear(host).append(h("div", { class: "card" }, emptyState({ icon: "workouts", title: "No workouts logged", text: "Log your first session to see weekly frequency and personal records.", action: h("button", { class: "btn btn-primary", type: "button", onclick: () => workoutForm() }, "Log a workout") })));
      return;
    }
    const today = todayISO();
    const thisWeek = startOfWeek(today);
    const weekStarts = Array.from({ length: WEEKS }, (_, i) => addDays(thisWeek, -7 * (WEEKS - 1 - i)));
    const counts = weekStarts.map((ws) => sessions.filter((s) => dayOf(s) >= ws && dayOf(s) <= addDays(ws, 6)).length);
    const weekSessions = sessions.filter((s) => dayOf(s) >= thisWeek);
    const minutes = weekSessions.reduce((a, s) => a + (s.duration_minutes ?? 0), 0);
    const recs = records();
    clear(host).append(h("div", { class: "stack" },
      h("div", { class: "stats" },
        statCard({ label: "This week", value: String(weekSessions.length), sub: weekSessions.length === 1 ? "session" : "sessions" }),
        statCard({ label: "Last 8 weeks", value: String(counts.reduce((a, b) => a + b, 0)), sub: "sessions" }),
        statCard({ label: "Time this week", value: fmtDuration(minutes) || "0m", sub: "Logged duration" })),
      h("section", { class: "card" }, h("h2", { style: { fontSize: "16px", marginBottom: "8px" } }, "Sessions per week"), responsive((width) => barChart({ width, labels: weekStarts.map((w) => fmtDayMonth(w)), values: counts, color: "var(--m-workouts)", ariaLabel: `Workout sessions per week for the last ${WEEKS} weeks`, unit: " sessions" }))),
      recs.length ? h("section", { class: "card" }, h("h2", { style: { fontSize: "16px", marginBottom: "12px" } }, "Personal records"),
        h("div", { class: "grid-3" }, recs.slice(0, 9).map((r) => h("div", { class: "stat" }, h("div", { class: "stat-label truncate" }, nameOf(r.id)),
          h("div", { class: "stat-value" }, r.weight != null ? `${r.weight} ${r.unit}` : `${r.reps} reps`), h("div", { class: "stat-sub" }, r.weight != null ? `${r.repsAtWeight ?? "–"} reps at best weight` : "Most reps in a set"))))) : null,
      h("section", { "aria-label": "Sessions" }, h("h2", { style: { fontSize: "18px", margin: "8px 0 12px" } }, "Recent sessions"), h("div", { class: "grid-3", style: { gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))" } }, sessions.map(sessionCard)))));
  }

  view.replaceChildren(
    pageHeader({ eyebrow: "Routines", title: "Workouts", module: "workouts", subtitle: "What you lifted, ran and repeated.", actions: [h("button", { class: "btn btn-primary", type: "button", onclick: () => workoutForm() }, icon("plus", 18), "Log workout")] }),
    host);
  await load();
}

