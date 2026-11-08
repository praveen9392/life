import { api, ApiError } from "./core/api.js";
import { h, events } from "./core/dom.js";
import { isoDate, todayISO } from "./core/format.js";
import { openModal, toast, field, input, textarea, select, withBusy, errorMessage } from "./core/ui.js";

class FormError extends Error {
  constructor(name, message) { super(message); this.fieldName = name; }
}

const WEEKDAYS = [[0, "Mon"], [1, "Tue"], [2, "Wed"], [3, "Thu"], [4, "Fri"], [5, "Sat"], [6, "Sun"]];
let seq = 0;
const uid = (p) => `${p}-${++seq}`;

function setFieldError(form, name, message) {
  const control = form.querySelector(`[name="${name}"]`);
  form.querySelectorAll(`[data-err-for="${name}"]`).forEach((n) => n.remove());
  if (!control) return false;
  control.setAttribute("aria-invalid", "true");
  const err = h("div", { class: "error", role: "alert", "data-err-for": name }, message);
  (control.closest(".field") ?? control.parentElement).append(err);
  control.focus();
  return true;
}

/** Shared modal-form scaffold: busy state, inline field errors, server error banner. */
function formModal({ title, submitLabel = "Save", body, onSubmit, wide = false, danger = false }) {
  const formId = uid("form");
  const banner = h("div", { class: "banner banner-danger", role: "alert", hidden: true });
  const form = h("form", { id: formId, class: "stack", novalidate: "" }, banner, body);
  const submit = h("button", { class: `btn ${danger ? "btn-danger" : "btn-primary"}`, type: "submit", form: formId }, submitLabel);
  const cancel = h("button", { class: "btn btn-secondary", type: "button", onclick: () => dlg.close(false) }, "Cancel");
  const dlg = openModal({ title, body: form, footer: [cancel, submit], wide });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    banner.hidden = true;
    form.querySelectorAll("[data-err-for]").forEach((n) => n.remove());
    form.querySelectorAll("[aria-invalid]").forEach((n) => n.removeAttribute("aria-invalid"));
    try {
      await withBusy(submit, onSubmit);
      dlg.close(true);
    } catch (err) {
      if (err instanceof FormError) { setFieldError(form, err.fieldName, err.message); return; }
      if (err instanceof ApiError && err.fields) {
        const first = Object.entries(err.fields).map(([k, v]) => setFieldError(form, k.split(".").pop(), v)).some(Boolean);
        if (first) return;
      }
      banner.textContent = errorMessage(err);
      banner.hidden = false;
    }
  });
  return dlg;
}

const required = (name, value, label) => {
  if (!String(value ?? "").trim()) throw new FormError(name, `${label} is required.`);
};
const done = (msg) => { toast(msg); events.emit("data"); events.emit("refresh"); };

function chipToggle(label, pressed, onToggle) {
  const b = h("button", { type: "button", class: "chip", "aria-pressed": String(pressed), onclick: () => { pressed = !pressed; b.setAttribute("aria-pressed", String(pressed)); onToggle(pressed); } }, label);
  return b;
}

/* ---------- Task ---------- */
export async function taskForm({ task, defaults = {} } = {}) {
  const t = task ?? {};
  const [tags] = await Promise.all([api.tags.list().catch(() => [])]);
  const selected = new Set((t.tags ?? []).map((x) => x.id));
  const tagBox = h("div", { class: "chip-scroll", style: { flexWrap: "wrap" } });
  const drawTags = () => {
    tagBox.replaceChildren(...tags.map((tag) => chipToggle(tag.name, selected.has(tag.id), (on) => (on ? selected.add(tag.id) : selected.delete(tag.id)))));
  };
  drawTags();
  const newTag = input({ name: "newtag", placeholder: "New tag", maxlength: "40", "aria-label": "New tag name", style: { maxWidth: "180px" } });
  const addTag = async () => {
    const name = newTag.value.trim();
    if (!name) return;
    try {
      const tag = await api.tags.create(name);
      if (!tags.some((x) => x.id === tag.id)) tags.push(tag);
      selected.add(tag.id);
      newTag.value = "";
      drawTags();
    } catch (e) { toast(errorMessage(e), "error"); }
  };
  newTag.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } });

  const rule = t.recurrence_rule ?? null;
  const freq = select([["none", "Does not repeat"], ["daily", "Every day"], ["weekly", "Every week"], ["monthly", "Every month"]], rule?.frequency ?? "none", { name: "recurrence" });
  const wdSel = new Set(rule?.weekdays ?? []);
  const wdBox = h("div", { class: "chip-scroll" }, WEEKDAYS.map(([v, l]) => chipToggle(l, wdSel.has(v), (on) => (on ? wdSel.add(v) : wdSel.delete(v)))));
  const wdField = h("div", { class: "field", hidden: freq.value !== "weekly" }, h("span", { class: "field-label" }, "Repeat on"), wdBox);
  freq.addEventListener("change", () => { wdField.hidden = freq.value !== "weekly"; });

  const f = {
    title: input({ name: "title", value: t.title ?? "", maxlength: "200", placeholder: "What needs doing?", autocomplete: "off" }),
    description: textarea({ name: "description", rows: "3", maxlength: "5000" }),
    priority: select([["low", "Low"], ["medium", "Medium"], ["high", "High"], ["urgent", "Urgent"]], t.priority ?? "medium", { name: "priority" }),
    list: select([["today", "Today"], ["upcoming", "Upcoming"], ["later", "Later"]], t.list ?? defaults.list ?? "today", { name: "list" }),
    due: input({ name: "due_date", type: "date", value: t.due_date ?? defaults.due_date ?? "" }),
    time: input({ name: "due_time", type: "time", value: (t.due_time ?? "").slice(0, 5) }),
    est: input({ name: "estimated_duration_minutes", type: "number", min: "0", max: "1440", value: t.estimated_duration_minutes ?? "", placeholder: "min" }),
  };
  f.description.value = t.description ?? "";

  const body = h("div", { class: "stack" },
    field({ label: "Title", control: f.title }),
    field({ label: "Notes", control: f.description }),
    h("div", { class: "field-row" }, field({ label: "Priority", control: f.priority }), field({ label: "List", control: f.list })),
    h("div", { class: "field-row" }, field({ label: "Due date", control: f.due }), field({ label: "Due time", control: f.time }), field({ label: "Estimate (min)", control: f.est })),
    field({ label: "Repeat", control: freq, hint: "Recurring tasks create their next occurrence when completed." }),
    wdField,
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Tags"), tagBox, h("div", { class: "row-gap" }, newTag, h("button", { class: "btn btn-secondary btn-sm", type: "button", onclick: addTag }, "Add tag"))));

  return formModal({
    title: task ? "Edit task" : "New task",
    submitLabel: task ? "Save changes" : "Create task",
    body,
    onSubmit: async () => {
      required("title", f.title.value, "Title");
      if (freq.value === "weekly" && !wdSel.size) throw new FormError("recurrence", "Pick at least one weekday.");
      const recurrence = freq.value === "none" ? null : { frequency: freq.value, ...(freq.value === "weekly" ? { weekdays: [...wdSel].sort() } : {}) };
      const payload = {
        title: f.title.value.trim(),
        description: f.description.value.trim() || null,
        priority: f.priority.value,
        list: f.list.value,
        due_date: f.due.value || null,
        due_time: f.time.value ? `${f.time.value}:00` : null,
        estimated_duration_minutes: f.est.value ? Number(f.est.value) : null,
        tag_ids: [...selected],
      };
      if (task) {
        const recurrenceChanged = JSON.stringify(recurrence) !== JSON.stringify(task.recurrence_rule ?? null);
        await api.tasks.update(task.id, payload);
        if (recurrenceChanged && task.recurrence_template_id) await api.tasks.updateTemplate(task.recurrence_template_id, { recurrence_rule: recurrence });
        else if (recurrenceChanged) await api.tasks.update(task.id, { recurrence_rule: recurrence });
      } else {
        await api.tasks.create({ ...payload, recurrence_rule: recurrence });
      }
      done(task ? "Task updated" : "Task created");
    },
  });
}

/* ---------- Habit ---------- */
export function habitForm({ habit } = {}) {
  const hb = habit ?? {};
  const cfg = hb.frequency_config ?? {};
  const f = {
    name: input({ name: "name", value: hb.name ?? "", maxlength: "200", placeholder: "e.g. Read 20 pages" }),
    category: input({ name: "category", value: hb.category ?? "", maxlength: "100", placeholder: "e.g. health" }),
    freq: select([["daily", "Every day"], ["weekly", "Specific weekdays"], ["custom_days", "Every N days"]], hb.frequency_type ?? "daily", { name: "frequency_type" }),
    every: input({ name: "every_n_days", type: "number", min: "1", max: "365", value: cfg.every_n_days ?? 2 }),
    target: input({ name: "target_count", type: "number", min: "1", max: "50", value: hb.target_count ?? 1 }),
    start: input({ name: "start_date", type: "date", value: hb.start_date ?? todayISO(), disabled: !!habit }),
    end: input({ name: "end_date", type: "date", value: hb.end_date ?? "" }),
    reminder: input({ name: "reminder_time", type: "time", value: (hb.reminder_time ?? "").slice(0, 5) }),
    desc: textarea({ name: "description", rows: "2", maxlength: "2000" }),
  };
  f.desc.value = hb.description ?? "";
  const wd = new Set(cfg.weekdays ?? [0, 1, 2, 3, 4]);
  const wdField = h("div", { class: "field" }, h("span", { class: "field-label" }, "Weekdays"), h("div", { class: "chip-scroll" }, WEEKDAYS.map(([v, l]) => chipToggle(l, wd.has(v), (on) => (on ? wd.add(v) : wd.delete(v))))));
  const everyField = field({ label: "Repeat every (days)", control: f.every });
  const sync = () => { wdField.hidden = f.freq.value !== "weekly"; everyField.hidden = f.freq.value !== "custom_days"; };
  f.freq.addEventListener("change", sync);
  sync();
  const body = h("div", { class: "stack" },
    field({ label: "Name", control: f.name }),
    h("div", { class: "field-row" }, field({ label: "Category", control: f.category }), field({ label: "Daily target", control: f.target, hint: "Times per scheduled day" })),
    field({ label: "Schedule", control: f.freq }), wdField, everyField,
    h("div", { class: "field-row" }, field({ label: "Starts", control: f.start }), field({ label: "Ends (optional)", control: f.end }), field({ label: "Reminder time", control: f.reminder, hint: "Adds the habit to Morning/Evening on Today" })),
    field({ label: "Description", control: f.desc }));
  return formModal({
    title: habit ? "Edit habit" : "New habit",
    submitLabel: habit ? "Save changes" : "Create habit",
    body,
    onSubmit: async () => {
      required("name", f.name.value, "Name");
      if (f.freq.value === "weekly" && !wd.size) throw new FormError("frequency_type", "Pick at least one weekday.");
      const frequency_config = f.freq.value === "weekly" ? { weekdays: [...wd].sort() } : f.freq.value === "custom_days" ? { every_n_days: Number(f.every.value) || 2 } : {};
      const payload = {
        name: f.name.value.trim(),
        description: f.desc.value.trim() || null,
        category: f.category.value.trim() || null,
        frequency_type: f.freq.value,
        frequency_config,
        target_count: Number(f.target.value) || 1,
        end_date: f.end.value || null,
        reminder_time: f.reminder.value ? `${f.reminder.value}:00` : null,
      };
      if (habit) await api.habits.update(habit.id, payload);
      else await api.habits.create({ ...payload, start_date: f.start.value || todayISO() });
      done(habit ? "Habit updated" : "Habit created");
    },
  });
}

/* ---------- Goal ---------- */
export function goalForm({ goal } = {}) {
  const g = goal ?? {};
  const f = {
    title: input({ name: "title", value: g.title ?? "", maxlength: "200", placeholder: "e.g. Run a half marathon" }),
    desc: textarea({ name: "description", rows: "3", maxlength: "5000" }),
    category: input({ name: "category", value: g.category ?? "", maxlength: "100" }),
    target: input({ name: "target_date", type: "date", value: g.target_date ?? "" }),
    mode: select([["manual", "Manual - I set the progress"], ["milestones", "Milestones - from completed steps"], ["measurable", "Measurable"]], g.progress_mode ?? "manual", { name: "progress_mode" }),
    status: select([["not_started", "Not started"], ["in_progress", "In progress"], ["completed", "Completed"], ["abandoned", "Abandoned"]], g.status ?? "not_started", { name: "status" }),
    progress: input({ name: "progress_percent", type: "range", min: "0", max: "100", step: "5", value: g.progress_percent ?? 0 }),
  };
  f.desc.value = g.description ?? "";
  const progressLabel = h("span", { class: "tnum" }, `${f.progress.value}%`);
  f.progress.addEventListener("input", () => { progressLabel.textContent = `${f.progress.value}%`; });
  const progressField = h("div", { class: "field" }, h("label", { for: "goal-progress" }, "Progress ", progressLabel), f.progress);
  f.progress.id = "goal-progress";
  const sync = () => { progressField.hidden = !goal || f.mode.value !== "manual"; };
  f.mode.addEventListener("change", sync);
  sync();
  const body = h("div", { class: "stack" },
    field({ label: "Goal", control: f.title }), field({ label: "Why it matters", control: f.desc }),
    h("div", { class: "field-row" }, field({ label: "Category", control: f.category }), field({ label: "Target date", control: f.target })),
    field({ label: "Progress mode", control: f.mode }),
    goal ? field({ label: "Status", control: f.status }) : null,
    progressField);
  return formModal({
    title: goal ? "Edit goal" : "New goal",
    submitLabel: goal ? "Save changes" : "Create goal",
    body,
    onSubmit: async () => {
      required("title", f.title.value, "Goal");
      const payload = { title: f.title.value.trim(), description: f.desc.value.trim() || null, category: f.category.value.trim() || null, target_date: f.target.value || null, progress_mode: f.mode.value };
      if (goal) {
        payload.status = f.status.value;
        if (f.mode.value === "manual") payload.progress_percent = Number(f.progress.value);
        await api.goals.update(goal.id, payload);
      } else await api.goals.create(payload);
      done(goal ? "Goal updated" : "Goal created");
    },
  });
}

/* ---------- Health ---------- */
export const METRIC_TYPES = [["weight", "Weight", "kg"], ["water", "Water", "glasses"], ["sleep", "Sleep", "hours"], ["steps", "Steps", "steps"], ["resting_heart_rate", "Resting heart rate", "bpm"], ["custom", "Custom", ""]];
const localDT = (d = new Date()) => `${isoDate(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
export { localDT };

export function healthForm({ type = "weight" } = {}) {
  const f = {
    type: select(METRIC_TYPES.map(([v, l]) => [v, l]), type, { name: "metric_type" }),
    value: input({ name: "value", type: "number", step: "any", inputmode: "decimal", placeholder: "0" }),
    unit: input({ name: "unit", value: METRIC_TYPES.find((m) => m[0] === type)?.[2] ?? "", maxlength: "20" }),
    at: input({ name: "recorded_at", type: "datetime-local", value: localDT() }),
    note: input({ name: "note", maxlength: "500", placeholder: "Optional" }),
  };
  f.type.addEventListener("change", () => { f.unit.value = METRIC_TYPES.find((m) => m[0] === f.type.value)?.[2] ?? ""; });
  const body = h("div", { class: "stack" },
    field({ label: "Metric", control: f.type }),
    h("div", { class: "field-row" }, field({ label: "Value", control: f.value }), field({ label: "Unit", control: f.unit })),
    field({ label: "When", control: f.at }), field({ label: "Note", control: f.note }));
  return formModal({
    title: "Log a health metric",
    submitLabel: "Log metric",
    body,
    onSubmit: async () => {
      if (f.value.value === "" || Number.isNaN(Number(f.value.value))) throw new FormError("value", "Enter a number.");
      required("unit", f.unit.value, "Unit");
      await api.health.create({ metric_type: f.type.value, value: Number(f.value.value), unit: f.unit.value.trim(), recorded_at: new Date(f.at.value).toISOString(), note: f.note.value.trim() || null });
      done("Metric logged");
    },
  });
}

/* ---------- Workout ---------- */
export async function workoutForm() {
  let exercises = await api.workouts.exercises().catch(() => []);
  const blocks = [];
  const blockHost = h("div", { class: "stack" });
  const f = {
    at: input({ name: "performed_at", type: "datetime-local", value: localDT() }),
    dur: input({ name: "duration_minutes", type: "number", min: "0", max: "1440", placeholder: "min" }),
    notes: input({ name: "notes", maxlength: "2000", placeholder: "How did it feel?" }),
  };
  const exerciseSelect = (value) => select([["", "Choose exercise..."], ...exercises.map((e) => [e.id, e.name])], value ?? "", { "aria-label": "Exercise" });
  function addBlock() {
    const block = { sel: exerciseSelect(), sets: [], setHost: h("div", { class: "stack-sm" }) };
    const addSet = (reps = "", weight = "") => {
      const row = { reps: input({ type: "number", min: "0", placeholder: "Reps", "aria-label": "Reps", value: reps }), weight: input({ type: "number", min: "0", step: "any", placeholder: "Weight", "aria-label": "Weight", value: weight }), unit: select(["kg", "lb"], "kg", { "aria-label": "Unit", style: { maxWidth: "76px" } }) };
      block.sets.push(row);
      const idx = block.sets.length;
      block.setHost.append(h("div", { class: "row-gap" }, h("span", { class: "muted tnum", style: { width: "56px" } }, `Set ${idx}`), row.reps, row.weight, row.unit));
    };
    addSet();
    const wrap = h("div", { class: "card", style: { padding: "12px" } },
      h("div", { class: "row-gap", style: { marginBottom: "8px" } }, block.sel, h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { blocks.splice(blocks.indexOf(block), 1); wrap.remove(); } }, "Remove")),
      block.setHost,
      h("button", { class: "btn btn-secondary btn-sm", type: "button", style: { marginTop: "8px" }, onclick: () => { const last = block.sets.at(-1); addSet(last?.reps.value ?? "", last?.weight.value ?? ""); } }, "Add set"));
    blocks.push(block);
    blockHost.append(wrap);
  }
  addBlock();
  const nx = { name: input({ placeholder: "e.g. Romanian deadlift", maxlength: "150", "aria-label": "New exercise name" }), group: input({ placeholder: "Muscle group (optional)", maxlength: "80", "aria-label": "Muscle group" }) };
  const createExercise = async () => {
    if (!nx.name.value.trim()) return;
    try {
      const ex = await api.workouts.createExercise({ name: nx.name.value.trim(), muscle_group: nx.group.value.trim() || undefined });
      exercises = [...exercises, ex];
      blocks.forEach((b) => { const cur = b.sel.value; const fresh = exerciseSelect(cur); b.sel.replaceChildren(...fresh.children); b.sel.value = cur; });
      const empty = blocks.find((b) => !b.sel.value);
      if (empty) empty.sel.value = ex.id;
      nx.name.value = ""; nx.group.value = "";
      toast(`Added ${ex.name} to your catalog`);
    } catch (e) { toast(errorMessage(e), "error"); }
  };
  const body = h("div", { class: "stack" },
    h("div", { class: "field-row" }, field({ label: "When", control: f.at }), field({ label: "Duration (min)", control: f.dur })),
    field({ label: "Notes", control: f.notes }),
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Exercises"), blockHost, h("div", null, h("button", { class: "btn btn-secondary btn-sm", type: "button", onclick: addBlock }, "Add exercise"))),
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Not in the list?"), h("div", { class: "row-gap", style: { flexWrap: "wrap" } }, nx.name, nx.group, h("button", { class: "btn btn-secondary btn-sm", type: "button", onclick: createExercise }, "Add to catalog"))));
  return formModal({
    title: "Log workout",
    submitLabel: "Log workout",
    body,
    wide: true,
    onSubmit: async () => {
      const sets = [];
      for (const b of blocks) {
        if (!b.sel.value) continue;
        b.sets.forEach((s, i) => {
          if (s.reps.value === "" && s.weight.value === "") return;
          sets.push({ exercise_id: b.sel.value, set_number: i + 1, reps: s.reps.value === "" ? null : Number(s.reps.value), weight: s.weight.value === "" ? null : Number(s.weight.value), weight_unit: s.weight.value === "" ? null : s.unit.value });
        });
      }
      if (!sets.length && !f.dur.value) throw new FormError("duration_minutes", "Add at least one set or a duration.");
      await api.workouts.createSession({ performed_at: new Date(f.at.value).toISOString(), duration_minutes: f.dur.value ? Number(f.dur.value) : null, notes: f.notes.value.trim() || null, sets });
      done("Workout logged");
    },
  });
}

/* ---------- Note (title first, then straight into the editor) ---------- */
export function noteForm({ directoryId } = {}) {
  const title = input({ name: "title", maxlength: "200", placeholder: "Untitled note" });
  return formModal({
    title: "New note",
    submitLabel: "Create note",
    body: field({ label: "Title", control: title }),
    onSubmit: async () => {
      const note = await api.notes.create({ title: title.value.trim() || "Untitled note", content: "", directory_id: directoryId ?? null });
      events.emit("data");
      events.emit("open-note", note.id);
    },
  });
}

/* ---------- Learning ---------- */
export function courseForm({ course } = {}) {
  const c = course ?? {};
  const f = {
    title: input({ name: "title", value: c.title ?? "", maxlength: "200", placeholder: "e.g. System Design Fundamentals" }),
    provider: input({ name: "provider", value: c.provider ?? "", maxlength: "150", placeholder: "e.g. Coursera" }),
    start: input({ name: "start_date", type: "date", value: c.start_date ?? "" }),
    target: input({ name: "target_date", type: "date", value: c.target_date ?? "" }),
    status: select([["not_started", "Not started"], ["in_progress", "In progress"], ["completed", "Completed"], ["abandoned", "Abandoned"]], c.status ?? "not_started", { name: "status" }),
  };
  const body = h("div", { class: "stack" }, field({ label: "Course", control: f.title }), field({ label: "Provider", control: f.provider }),
    h("div", { class: "field-row" }, field({ label: "Start", control: f.start }), field({ label: "Target finish", control: f.target })),
    course ? field({ label: "Status", control: f.status }) : null);
  return formModal({
    title: course ? "Edit course" : "New course",
    submitLabel: course ? "Save changes" : "Create course",
    body,
    onSubmit: async () => {
      required("title", f.title.value, "Course");
      const payload = { title: f.title.value.trim(), provider: f.provider.value.trim() || null, start_date: f.start.value || null, target_date: f.target.value || null };
      if (course) await api.learning.updateCourse(course.id, { ...payload, status: f.status.value });
      else await api.learning.createCourse(payload);
      done(course ? "Course updated" : "Course created");
    },
  });
}

export async function learningSessionForm({ courses = [] } = {}) {
  const f = {
    course: select([["", "No course"], ...courses.map((c) => [c.id, c.title])], "", { name: "course_id" }),
    topic: input({ name: "topic", maxlength: "200", placeholder: "What did you study?" }),
    mins: input({ name: "duration_minutes", type: "number", min: "1", max: "1440", placeholder: "30" }),
    date: input({ name: "session_date", type: "date", value: todayISO() }),
    notes: textarea({ name: "notes", rows: "2", maxlength: "5000" }),
  };
  const body = h("div", { class: "stack" }, field({ label: "Course", control: f.course }), field({ label: "Topic", control: f.topic }),
    h("div", { class: "field-row" }, field({ label: "Minutes", control: f.mins }), field({ label: "Date", control: f.date })), field({ label: "Notes", control: f.notes }));
  return formModal({
    title: "Log a study session",
    submitLabel: "Log session",
    body,
    onSubmit: async () => {
      const minutes = Number(f.mins.value);
      if (!minutes || minutes < 1) throw new FormError("duration_minutes", "Enter the minutes studied.");
      if (!f.course.value && !f.topic.value.trim()) throw new FormError("topic", "Add a topic or pick a course.");
      await api.learning.logSession({ course_id: f.course.value || null, topic: f.topic.value.trim() || null, duration_minutes: minutes, session_date: f.date.value || todayISO(), notes: f.notes.value.trim() || null });
      done("Session logged");
    },
  });
}

export function simpleTextForm({ title, label, value = "", submitLabel = "Save", placeholder = "", maxlength = 200, onSave }) {
  const control = input({ name: "text", value, maxlength: String(maxlength), placeholder });
  return formModal({ title, submitLabel, body: field({ label, control }), onSubmit: async () => { required("text", control.value, label); await onSave(control.value.trim()); } });
}
