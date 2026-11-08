import { api } from "../core/api.js";
import { events, h, clear } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { addDays, fmtDate, fmtDuration, plural, startOfWeek, todayISO } from "../core/format.js";
import { chip, confirmDialog, emptyState, errorState, input, openMenu, pageHeader, progressBar, segmented, select, skeletonRows, statCard, toast, toastError } from "../core/ui.js";
import { courseForm, learningSessionForm, simpleTextForm } from "../forms.js";

const STATUS = { not_started: "Not started", in_progress: "In progress", completed: "Completed", abandoned: "Abandoned" };
const TYPES = [["book", "Book"], ["technology", "Technology"], ["topic", "Topic"], ["project", "Project"]];
const TONE = { completed: "accent", in_progress: "info", abandoned: "danger", not_started: "" };

export default async function learning(view) {
  let tab = "courses";
  let courses = [], items = [], sessions = [];
  let error = null;
  const details = new Map();
  const open = new Set();
  const host = h("div");
  const statsHost = h("div", { class: "stats", style: { marginBottom: "16px" } });

  async function load() {
    clear(host).append(skeletonRows(4));
    try {
      [courses, items, sessions] = await Promise.all([api.learning.courses(), api.learning.items(), api.learning.sessions().then((p) => p.items)]);
      error = null;
    } catch (e) { error = e; }
    draw();
  }
  const refresh = async () => { events.emit("data"); await load(); for (const id of open) await loadDetail(id); draw(); };
  async function loadDetail(id) { try { details.set(id, await api.learning.course(id)); } catch (e) { toastError(e); } }
  const courseName = (id) => courses.find((c) => c.id === id)?.title;

  function drawStats() {
    const weekStart = startOfWeek(todayISO());
    const week = sessions.filter((s) => s.session_date >= weekStart);
    clear(statsHost).append(
      statCard({ label: "Studied this week", value: fmtDuration(week.reduce((a, s) => a + s.duration_minutes, 0)) || "0m", sub: plural(week.length, "session") }),
      statCard({ label: "Courses in progress", value: String(courses.filter((c) => c.status === "in_progress").length), sub: `${courses.length} total` }),
      statCard({ label: "Library finished", value: String(items.filter((i) => i.status === "completed").length), sub: `of ${items.length} items` }));
  }

  /* ----- courses ----- */
  async function toggleLesson(course, lesson) {
    try { await api.learning.updateLesson(lesson.id, { status: lesson.status === "completed" ? "not_started" : "completed" }); await refresh(); } catch (e) { toastError(e); }
  }

  function courseCard(c) {
    const isOpen = open.has(c.id);
    const more = h("button", { class: "btn btn-ghost btn-icon btn-sm", type: "button", "aria-label": `Actions for ${c.title}`, "aria-haspopup": "menu", onclick: () => openMenu(more, [
      { label: "Edit course", icon: "edit", onClick: () => courseForm({ course: c }) },
      { label: "Delete…", icon: "trash", danger: true, onClick: async () => { if (!(await confirmDialog({ title: "Delete this course?", message: `"${c.title}" and all its modules and lessons will be deleted.` }))) return; try { await api.learning.removeCourse(c.id); open.delete(c.id); toast("Course deleted"); await refresh(); } catch (e) { toastError(e); } } },
    ]) }, icon("more", 18));
    const toggle = h("button", { class: "btn btn-ghost btn-icon btn-sm", type: "button", "aria-expanded": String(isOpen), "aria-label": `${isOpen ? "Collapse" : "Expand"} ${c.title}`, onclick: async () => { if (isOpen) open.delete(c.id); else { open.add(c.id); await loadDetail(c.id); } draw(); } }, icon(isOpen ? "up" : "down", 18));
    const d = details.get(c.id);
    return h("article", { class: "card" },
      h("div", { class: "row-gap", style: { alignItems: "flex-start" } }, h("div", { style: { flex: 1, minWidth: 0 } }, h("h3", { class: "truncate", style: { fontSize: "17px" } }, c.title),
        h("div", { class: "row-meta" }, chip(STATUS[c.status], TONE[c.status]), c.provider ? h("span", null, c.provider) : null, c.target_date ? h("span", null, `Target ${fmtDate(c.target_date)}`) : null)), more, toggle),
      h("div", { style: { marginTop: "12px" } }, progressBar(c.progress_percent, `${c.title} progress`), h("div", { class: "faint tnum", style: { fontSize: "13px", marginTop: "4px" } }, `${c.progress_percent}% of lessons complete`)),
      isOpen ? h("div", { class: "stack", style: { marginTop: "16px" } }, !d ? skeletonRows(2) : [
        ...(d.modules.length ? d.modules.map((m) => h("section", { "aria-label": m.title },
          h("h4", { style: { fontSize: "14px", marginBottom: "4px" } }, m.title),
          h("div", { class: "rows card card-flush" }, m.lessons.length ? m.lessons.map((l) => h("div", { class: `row${l.status === "completed" ? " is-done" : ""}`, style: { minHeight: "48px" } },
            h("button", { class: "checkbtn", type: "button", role: "checkbox", "aria-checked": String(l.status === "completed"), "aria-label": `${l.title}: ${l.status === "completed" ? "done" : "not done"}`, onclick: () => toggleLesson(c, l) }, icon("check", 16)),
            h("div", { class: "row-main" }, h("div", { class: "row-title" }, l.title)), l.duration_minutes ? h("span", { class: "faint" }, fmtDuration(l.duration_minutes)) : null)) : h("p", { class: "muted", style: { padding: "12px 16px" } }, "No lessons yet.")),
          h("button", { class: "btn btn-ghost btn-sm", type: "button", style: { marginTop: "6px" }, onclick: () => simpleTextForm({ title: `Add lesson to ${m.title}`, label: "Lesson title", submitLabel: "Add lesson", onSave: async (t) => { await api.learning.addLesson(m.id, t); await refresh(); } }) }, icon("plus", 16), "Add lesson"))) : [h("p", { class: "muted" }, "No modules yet. Modules group lessons into chapters.")]),
        h("div", null, h("button", { class: "btn btn-secondary btn-sm", type: "button", onclick: () => simpleTextForm({ title: "Add module", label: "Module title", submitLabel: "Add module", onSave: async (t) => { await api.learning.addModule(c.id, t); await refresh(); } }) }, icon("plus", 16), "Add module"))]) : null);
  }

  /* ----- library ----- */
  function itemRow(it) {
    const status = select(Object.entries(STATUS).filter(([k]) => k !== "abandoned"), it.status, { "aria-label": `Status of ${it.title}`, style: { width: "auto", minHeight: "32px" }, onchange: async (e) => { try { await api.learning.updateItem(it.id, { status: e.target.value, ...(e.target.value === "completed" ? { progress_percent: 100 } : {}) }); await refresh(); } catch (err) { toastError(err); } } });
    const del = h("button", { class: "btn btn-ghost btn-icon btn-sm", type: "button", "aria-label": `Delete ${it.title}`, onclick: async () => { if (!(await confirmDialog({ title: "Remove from library?", message: `"${it.title}" will be deleted.` }))) return; try { await api.learning.removeItem(it.id); toast("Removed"); await refresh(); } catch (e) { toastError(e); } } }, icon("trash", 18));
    return h("div", { class: "row" }, h("div", { class: "row-main" }, h("div", { class: "row-title truncate" }, it.title), h("div", { class: "row-meta" }, chip(TYPES.find((t) => t[0] === it.type)?.[1] ?? it.type), h("span", { class: "tnum" }, `${it.progress_percent}%`))), status, del);
  }

  function library() {
    const type = select(TYPES, "book", { "aria-label": "Type", style: { width: "auto" } });
    const title = input({ placeholder: "Add a book, technology, topic or project…", maxlength: "200", "aria-label": "Title" });
    const add = async () => { if (!title.value.trim()) { title.focus(); return; } try { await api.learning.createItem({ type: type.value, title: title.value.trim() }); title.value = ""; toast("Added to library"); await refresh(); } catch (e) { toastError(e); } };
    title.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    return h("div", { class: "stack" }, h("div", { class: "toolbar", style: { margin: 0 } }, type, h("div", { class: "grow" }, title), h("button", { class: "btn btn-secondary", type: "button", onclick: add }, icon("plus", 18), "Add")),
      items.length ? h("div", { class: "card card-flush rows" }, items.map(itemRow)) : h("div", { class: "card" }, emptyState({ icon: "learning", title: "Your library is empty", text: "Track books, technologies and topics you want to learn." })));
  }

  /* ----- sessions ----- */
  function sessionsView() {
    if (!sessions.length) return h("div", { class: "card" }, emptyState({ icon: "clock", title: "No study sessions yet", text: "Log time as you learn to see your weekly total.", action: h("button", { class: "btn btn-primary", type: "button", onclick: () => learningSessionForm({ courses }) }, "Log a session") }));
    return h("div", { class: "card card-flush rows" }, sessions.map((s) => h("div", { class: "row" },
      h("div", { class: "row-main" }, h("div", { class: "row-title truncate" }, s.topic || courseName(s.course_id) || "Study session"), h("div", { class: "row-meta" }, h("span", null, fmtDate(s.session_date)), s.course_id && s.topic ? h("span", null, courseName(s.course_id)) : null, s.notes ? h("span", { class: "truncate" }, s.notes) : null)),
      h("strong", { class: "tnum" }, fmtDuration(s.duration_minutes)),
      h("button", { class: "btn btn-ghost btn-icon btn-sm", type: "button", "aria-label": "Delete session", onclick: async () => { if (!(await confirmDialog({ title: "Delete this session?", message: `${fmtDuration(s.duration_minutes)} on ${fmtDate(s.session_date)} will be removed.` }))) return; try { await api.learning.removeSession(s.id); toast("Session deleted"); await refresh(); } catch (e) { toastError(e); } } }, icon("trash", 18)))));
  }

  function draw() {
    if (error) { clear(host).append(errorState(error, load)); return; }
    drawStats();
    const body = tab === "courses"
      ? (courses.length ? h("div", { class: "stack" }, courses.map(courseCard)) : h("div", { class: "card" }, emptyState({ icon: "learning", title: "No courses yet", text: "Add a course, break it into modules and lessons, and watch progress build.", action: h("button", { class: "btn btn-primary", type: "button", onclick: () => courseForm() }, "Add a course") })))
      : tab === "library" ? library() : sessionsView();
    clear(host).append(body);
  }

  view.replaceChildren(
    pageHeader({ eyebrow: "Routines", title: "Learning", module: "learning", subtitle: "Courses, reading and study time in one place.", actions: [
      h("button", { class: "btn btn-secondary", type: "button", onclick: () => courseForm() }, icon("plus", 18), "New course"),
      h("button", { class: "btn btn-primary", type: "button", onclick: () => learningSessionForm({ courses }) }, icon("clock", 18), "Log session")] }),
    statsHost,
    h("div", { class: "toolbar" }, segmented([["courses", "Courses"], ["library", "Library"], ["sessions", "Sessions"]], tab, (v) => { tab = v; draw(); }, "Learning section")),
    host);
  await load();
}
