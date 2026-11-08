import { api } from "../core/api.js";
import { events, h, clear } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { diffDays, fmtDate, plural, todayISO } from "../core/format.js";
import { chip, confirmDialog, emptyState, errorState, input, openMenu, pageHeader, progressBar, segmented, skeletonRows, statCard, toast, toastError } from "../core/ui.js";
import { goalForm } from "../forms.js";

const STATUS = { not_started: "Not started", in_progress: "In progress", completed: "Completed", abandoned: "Abandoned" };
const TONE = { completed: "accent", in_progress: "info", abandoned: "danger", not_started: "" };
const MODE = { manual: "You set the progress", milestones: "From completed milestones", measurable: "Measurable" };

export default async function goals(view) {
  let list = [];
  let error = null;
  let filter = "active";
  const host = h("div");
  const statsHost = h("div", { class: "stats", style: { marginBottom: "16px" } });

  async function load() {
    clear(host).append(skeletonRows(3));
    try { list = await api.goals.list(); error = null; } catch (e) { error = e; }
    draw();
  }
  const refresh = async () => { events.emit("data"); await load(); };

  function countdown(g) {
    if (!g.target_date || g.status === "completed") return null;
    const d = diffDays(g.target_date, todayISO());
    return d < 0 ? `${plural(-d, "day")} overdue` : d === 0 ? "Due today" : `${plural(d, "day")} left`;
  }

  function milestoneRow(g, m) {
    const del = h("button", { class: "btn btn-ghost btn-icon btn-sm", type: "button", "aria-label": `Delete milestone ${m.title}`, onclick: async () => { try { await api.goals.removeMilestone(m.id); await refresh(); } catch (e) { toastError(e); } } }, icon("x", 16));
    return h("div", { class: `row${m.is_completed ? " is-done" : ""}`, style: { minHeight: "48px" } },
      h("button", { class: "checkbtn", type: "button", role: "checkbox", "aria-checked": String(m.is_completed), "aria-label": `${m.title}: ${m.is_completed ? "done" : "not done"}`, onclick: async () => { try { await api.goals.updateMilestone(m.id, { is_completed: !m.is_completed }); await refresh(); } catch (e) { toastError(e); } } }, icon("check", 16)),
      h("div", { class: "row-main" }, h("div", { class: "row-title" }, m.title), m.target_date ? h("div", { class: "row-meta" }, fmtDate(m.target_date)) : null), del);
  }

  function goalCard(g) {
    const more = h("button", { class: "btn btn-ghost btn-icon btn-sm", type: "button", "aria-label": `Actions for ${g.title}`, "aria-haspopup": "menu", onclick: () => openMenu(more, [
      { label: "Edit goal", icon: "edit", onClick: () => goalForm({ goal: g }) },
      g.status === "completed" ? { label: "Reopen", icon: "repeat", onClick: async () => { try { await api.goals.update(g.id, { status: "in_progress" }); await refresh(); } catch (e) { toastError(e); } } } : { label: "Mark complete", icon: "check", onClick: async () => { try { await api.goals.update(g.id, { status: "completed", ...(g.progress_mode === "manual" ? { progress_percent: 100 } : {}) }); await refresh(); } catch (e) { toastError(e); } } },
      "-", { label: "Delete…", icon: "trash", danger: true, onClick: async () => { if (!(await confirmDialog({ title: "Delete this goal?", message: `"${g.title}" and its milestones will be deleted.` }))) return; try { await api.goals.remove(g.id); toast("Goal deleted"); await refresh(); } catch (e) { toastError(e); } } },
    ]) }, icon("more", 18));
    const ms = input({ placeholder: "Add a milestone", maxlength: "200", "aria-label": `New milestone for ${g.title}` });
    const addMs = async () => { if (!ms.value.trim()) return; try { await api.goals.addMilestone(g.id, ms.value.trim()); await refresh(); } catch (e) { toastError(e); } };
    ms.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addMs(); } });
    const cd = countdown(g);
    return h("article", { class: "card" },
      h("div", { class: "row-gap", style: { alignItems: "flex-start" } }, h("div", { style: { flex: 1, minWidth: 0 } }, h("h3", { style: { fontSize: "18px", overflowWrap: "anywhere" } }, g.title),
        h("div", { class: "row-meta" }, chip(STATUS[g.status], TONE[g.status]), g.category ? chip(g.category) : null, g.target_date ? h("span", null, `Target ${fmtDate(g.target_date)}`) : null, cd ? h("span", { style: cd.includes("overdue") ? { color: "var(--danger)", fontWeight: 600 } : null }, cd) : null)), more),
      g.description ? h("p", { class: "muted", style: { marginTop: "8px" } }, g.description) : null,
      h("div", { style: { marginTop: "12px" } }, h("div", { class: "row-gap", style: { justifyContent: "space-between", marginBottom: "4px" } }, h("span", { class: "faint", style: { fontSize: "13px" } }, MODE[g.progress_mode]), h("strong", { class: "tnum" }, `${g.progress_percent}%`)), progressBar(g.progress_percent, `${g.title} progress`)),
      h("div", { style: { marginTop: "12px" } }, g.milestones.length ? h("div", { class: "card card-flush rows" }, g.milestones.map((m) => milestoneRow(g, m))) : null,
        h("div", { class: "row-gap", style: { marginTop: "8px" } }, ms, h("button", { class: "btn btn-secondary", type: "button", onclick: addMs }, "Add"))));
  }

  function draw() {
    if (error) { clear(host).append(errorState(error, load)); return; }
    const active = list.filter((g) => g.status === "in_progress" || g.status === "not_started");
    const done = list.filter((g) => g.status === "completed");
    const avg = active.length ? Math.round(active.reduce((a, g) => a + g.progress_percent, 0) / active.length) : null;
    clear(statsHost).append(
      statCard({ label: "Active goals", value: String(active.length), sub: avg == null ? "None in progress" : `Average ${avg}% complete` }),
      statCard({ label: "Completed", value: String(done.length), sub: "Goals finished" }),
      statCard({ label: "Milestones done", value: `${list.flatMap((g) => g.milestones).filter((m) => m.is_completed).length}/${list.flatMap((g) => g.milestones).length}`, sub: "Across all goals" }));
    const shown = filter === "active" ? active : filter === "completed" ? done : list;
    clear(host).append(shown.length ? h("div", { class: "grid-3", style: { gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))" } }, shown.map(goalCard))
      : h("div", { class: "card" }, emptyState({ icon: "goals", title: list.length ? `No ${filter} goals` : "No goals yet", text: "Pick something that matters, then break it into milestones.", action: h("button", { class: "btn btn-primary", type: "button", onclick: () => goalForm() }, "Create a goal") })));
  }

  view.replaceChildren(
    pageHeader({ eyebrow: "Plan", title: "Goals", module: "goals", subtitle: "Where you're heading, and the steps to get there.", actions: [h("button", { class: "btn btn-primary", type: "button", onclick: () => goalForm() }, icon("plus", 18), "New goal")] }),
    statsHost, h("div", { class: "toolbar" }, segmented([["active", "Active"], ["completed", "Completed"], ["all", "All"]], filter, (v) => { filter = v; draw(); }, "Goal filter")), host);
  await load();
}
