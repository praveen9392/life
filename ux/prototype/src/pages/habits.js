import { api } from "../core/api.js";
import { heatStrip } from "../core/charts.js";
import { debounce, events, h, clear } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { addDays, diffDays, fmtDayMonth, isoDate, parseISO, pct, plural, startOfWeek, todayISO, weekdayShort } from "../core/format.js";
import { chip, confirmDialog, emptyState, errorState, input, openMenu, pageHeader, progressBar, segmented, select, statCard, toast, toastError } from "../core/ui.js";
import { habitForm } from "../forms.js";

const HISTORY_DAYS = 100;
const dow = (iso) => (parseISO(iso).getDay() + 6) % 7;

function scheduled(habit, date) {
  if (date < habit.start_date || (habit.end_date && date > habit.end_date)) return false;
  const cfg = habit.frequency_config ?? {};
  if (habit.frequency_type === "weekly") return (cfg.weekdays ?? []).includes(dow(date));
  if (habit.frequency_type === "custom_days") return diffDays(date, habit.start_date) % (cfg.every_n_days || 1) === 0;
  return true;
}

export default async function habits(view) {
  const today = todayISO();
  const list = (await api.habits.list()).filter((x) => x.is_active);
  const logs = new Map();
  const streaks = new Map();
  let weekStart = startOfWeek(today);
  let mode = "week";
  const filter = { text: "", category: "" };

  const loadAll = async () => {
    await Promise.all(list.map(async (hb) => {
      const [hist, streak] = await Promise.all([api.habits.history(hb.id, HISTORY_DAYS).catch(() => []), api.habits.streak(hb.id).catch(() => ({ current_streak: 0, longest_streak: 0 }))]);
      logs.set(hb.id, new Map(hist.map((l) => [l.log_date, l.status])));
      streaks.set(hb.id, streak);
    }));
  };
  await loadAll();

  const statsHost = h("div", { class: "stats", style: { marginBottom: "16px" } });
  const bodyHost = h("div");
  const weekLabel = h("strong", { role: "status", "aria-live": "polite", style: { minWidth: "150px", textAlign: "center" } });

  const statusOf = (hb, date) => logs.get(hb.id)?.get(date) ?? null;
  const visible = () => list.filter((hb) => (!filter.category || hb.category === filter.category) && (!filter.text || hb.name.toLowerCase().includes(filter.text.toLowerCase())));

  function windowRate(habitsList, from, to) {
    let done = 0, expected = 0;
    for (const hb of habitsList) {
      for (let d = from; d <= to && d <= today; d = addDays(d, 1)) {
        if (!scheduled(hb, d)) continue;
        const st = statusOf(hb, d);
        if (st === "skipped" || st === "not_applicable") continue;
        expected += 1;
        if (st === "completed") done += 1;
      }
    }
    return { done, expected, percent: pct(done, expected) };
  }

  function drawStats() {
    const dueToday = list.filter((hb) => scheduled(hb, today));
    const doneToday = dueToday.filter((hb) => statusOf(hb, today) === "completed").length;
    let best = { n: 0, name: "" };
    for (const hb of list) { const n = streaks.get(hb.id)?.current_streak ?? 0; if (n > best.n) best = { n, name: hb.name }; }
    const week = windowRate(list, weekStart, addDays(weekStart, 6));
    const month = windowRate(list, addDays(today, -29), today);
    clear(statsHost).append(
      statCard({ label: "Today", value: `${doneToday}/${dueToday.length}`, sub: dueToday.length ? "habits done" : "Nothing scheduled" }),
      statCard({ label: "Best current streak", value: best.n ? plural(best.n, "day") : "0", sub: best.n ? best.name : "Complete a habit to start one" }),
      statCard({ label: "Selected week", value: week.percent == null ? "-" : `${week.percent}%`, sub: week.expected ? `${week.done} of ${week.expected} completed` : "Nothing scheduled yet" }),
      statCard({ label: "Last 30 days", value: month.percent == null ? "-" : `${month.percent}%`, sub: month.expected ? `${month.done} of ${month.expected} completed` : "No data yet" }));
  }

  async function setLog(hb, date, status) {
    const map = logs.get(hb.id);
    const prev = map.get(date) ?? null;
    if (status === null) map.delete(date); else map.set(date, status);
    draw();
    try {
      if (status === null) await api.habits.unlog(hb.id, date); else await api.habits.log(hb.id, date, status);
      api.habits.streak(hb.id).then((s) => { streaks.set(hb.id, s); drawStats(); drawBody(); }).catch(() => {});
      events.emit("data");
    } catch (e) {
      if (prev === null) map.delete(date); else map.set(date, prev);
      draw(); toastError(e);
    }
  }

  async function removeHabit(hb) {
    if (!(await confirmDialog({ title: "Delete this habit?", message: `"${hb.name}" and its entire history will be permanently deleted.` }))) return;
    try { await api.habits.remove(hb.id); list.splice(list.indexOf(hb), 1); toast("Habit deleted"); events.emit("data"); draw(); } catch (e) { toastError(e); }
  }

  function dayCell(hb, date) {
    const sch = scheduled(hb, date);
    const st = statusOf(hb, date);
    const future = date > today;
    const label = `${hb.name}, ${weekdayShort(date)} ${fmtDayMonth(date)}`;
    const cell = h("div", { class: `cell dcell${date === today ? " today" : ""}`, "data-day": weekdayShort(date) });
    if (!sch && !st) { cell.append(h("span", { class: "faint", "aria-label": `${label}: not scheduled`, title: "Not scheduled" }, "·")); return cell; }
    const btn = h("button", { class: "checkbtn", type: "button", role: "checkbox", "aria-checked": String(st === "completed"), "data-state": st === "skipped" ? "skipped" : "", disabled: future, "aria-label": `${label}: ${st === "completed" ? "done" : st === "skipped" ? "skipped" : st === "missed" ? "missed" : "not done"}`,
      style: st === "missed" ? { borderColor: "var(--danger)" } : null,
      onclick: () => setLog(hb, date, st === "completed" ? null : "completed"),
      oncontextmenu: (e) => { e.preventDefault(); menuFor(btn, hb, date, st); },
      onkeydown: (e) => { if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); menuFor(btn, hb, date, st); } } }, icon(st === "skipped" ? "skip" : "check", 16));
    cell.append(btn);
    return cell;
  }

  function menuFor(anchor, hb, date, st) {
    openMenu(anchor, [
      { head: `${hb.name} - ${weekdayShort(date)} ${fmtDayMonth(date)}` },
      { label: "Mark complete", icon: "check", onClick: () => setLog(hb, date, "completed") },
      { label: "Skip this day", icon: "skip", onClick: () => setLog(hb, date, "skipped") },
      ...(st ? [{ label: "Clear entry", icon: "x", onClick: () => setLog(hb, date, null) }] : []),
    ], { align: "start" });
  }

  function habitMenu(anchor, hb) {
    openMenu(anchor, [{ label: "Edit habit", icon: "edit", onClick: () => habitForm({ habit: hb }) }, "-", { label: "Delete…", icon: "trash", danger: true, onClick: () => removeHabit(hb) }]);
  }

  function nameCell(hb) {
    const s = streaks.get(hb.id)?.current_streak ?? 0;
    const more = h("button", { class: "btn btn-ghost btn-icon btn-sm", type: "button", "aria-label": `Actions for ${hb.name}`, "aria-haspopup": "menu", onclick: () => habitMenu(more, hb) }, icon("more", 18));
    return h("div", { class: "cell name" }, h("div", { class: "row-gap", style: { width: "100%", minWidth: 0 } },
      h("div", { style: { flex: 1, minWidth: 0 } }, h("div", { class: "row-title truncate" }, hb.name),
        h("div", { class: "row-meta" }, hb.category ? h("span", null, hb.category) : null, s > 0 ? h("span", { class: "chip chip-warn" }, icon("flame", 12), plural(s, "day")) : null,
          hb.frequency_type === "weekly" ? h("span", null, "Weekdays") : hb.frequency_type === "custom_days" ? h("span", null, `Every ${hb.frequency_config.every_n_days} days`) : null)),
      more));
  }

  function drawWeek() {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    weekLabel.textContent = weekStart === startOfWeek(today) ? "This week" : `${fmtDayMonth(weekStart)} – ${fmtDayMonth(days[6])}`;
    const rows = visible();
    if (!rows.length) return emptyState({ icon: "habits", title: list.length ? "No habits match" : "No habits yet", text: list.length ? "Try a different search or category." : "Build a routine one small habit at a time.", action: list.length ? null : h("button", { class: "btn btn-primary", type: "button", onclick: () => habitForm() }, "Create a habit") });
    const head = h("div", { class: "board-row board-head" }, h("div", { class: "cell hd name", style: { placeItems: "center start" } }, "Habit"), ...days.map((d) => h("div", { class: `cell hd${d === today ? " today" : ""}` }, weekdayShort(d), h("b", null, parseISO(d).getDate()))));
    return h("div", { class: "card card-flush board", role: "table", "aria-label": "Weekly habit board" }, head, ...rows.map((hb) => h("div", { class: "board-row", role: "row" }, nameCell(hb), ...days.map((d) => dayCell(hb, d)))));
  }

  function drawHistory() {
    const rows = visible();
    if (!rows.length) return emptyState({ icon: "habits", title: "No habits to show", text: "Create a habit to see its history." });
    const start = addDays(startOfWeek(today), -77);
    return h("div", { class: "stack" }, rows.map((hb) => {
      const cells = [];
      for (let d = start; d <= today; d = addDays(d, 1)) {
        const st = statusOf(hb, d);
        cells.push({ date: d, status: st === "not_applicable" ? "na" : st ?? (scheduled(hb, d) ? null : "na") });
      }
      const rate = windowRate([hb], addDays(today, -29), today);
      const s = streaks.get(hb.id) ?? { current_streak: 0, longest_streak: 0 };
      const months = h("div", { class: "faint", style: { fontSize: "12px", display: "flex", justifyContent: "space-between", marginTop: "4px" } }, h("span", null, fmtDayMonth(start)), h("span", null, "Today"));
      const more = h("button", { class: "btn btn-ghost btn-icon btn-sm", type: "button", "aria-label": `Actions for ${hb.name}`, "aria-haspopup": "menu", onclick: () => habitMenu(more, hb) }, icon("more", 18));
      return h("section", { class: "card" }, h("div", { class: "row-gap", style: { marginBottom: "12px" } },
        h("div", { style: { flex: 1, minWidth: 0 } }, h("h2", { class: "truncate", style: { fontSize: "16px" } }, hb.name), h("div", { class: "row-meta" }, hb.category ? h("span", null, hb.category) : null,
          h("span", null, `Streak ${s.current_streak}, best ${s.longest_streak}`), h("span", null, rate.percent == null ? "No data in 30 days" : `${rate.percent}% in last 30 days`))), more),
        heatStrip(cells, 0, `${hb.name}: last 12 weeks, completed days highlighted`), months);
    }), h("div", { class: "legend" }, [["var(--accent)", "Completed"], ["var(--warn)", "Skipped"], ["var(--danger)", "Missed"]].map(([c, t]) => h("span", null, h("i", { style: { background: c } }), t)), h("span", null, h("i", { style: { background: "var(--surface-2)", border: "1px solid var(--line)" } }), "No entry")));
  }

  function drawBody() { clear(bodyHost).append(mode === "week" ? drawWeek() : drawHistory()); }
  function draw() { drawStats(); drawBody(); }

  const categories = [...new Set(list.map((x) => x.category).filter(Boolean))];
  const search = input({ type: "search", placeholder: "Search habits", "aria-label": "Search habits" });
  search.addEventListener("input", debounce(() => { filter.text = search.value.trim(); drawBody(); }, 150));
  const catSel = categories.length ? select([["", "All categories"], ...categories.map((c) => [c, c])], "", { "aria-label": "Category", style: { width: "auto" }, onchange: (e) => { filter.category = e.target.value; drawBody(); } }) : null;
  const weekNav = h("div", { class: "row-gap" },
    h("button", { class: "btn btn-secondary btn-icon btn-sm", type: "button", "aria-label": "Previous week", onclick: () => { if (diffDays(weekStart, today) > -(HISTORY_DAYS - 7)) { weekStart = addDays(weekStart, -7); draw(); } } }, icon("left", 18)),
    weekLabel,
    h("button", { class: "btn btn-secondary btn-icon btn-sm", type: "button", "aria-label": "Next week", onclick: () => { if (weekStart < startOfWeek(today)) { weekStart = addDays(weekStart, 7); draw(); } } }, icon("right", 18)),
    h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { weekStart = startOfWeek(today); draw(); } }, "Today"));
  const modeSeg = segmented([["week", "Week"], ["history", "History"]], mode, (v) => { mode = v; weekNav.hidden = v !== "week"; drawBody(); }, "Habit view");

  view.replaceChildren(
    pageHeader({ eyebrow: "Routines", title: "Habits", module: "habits", subtitle: list.length ? `${plural(list.length, "active habit")}` : "Small daily actions, tracked kindly.", actions: [h("button", { class: "btn btn-primary", type: "button", onclick: () => habitForm() }, icon("plus", 18), "New habit")] }),
    statsHost,
    h("div", { class: "toolbar" }, modeSeg, weekNav, h("span", { class: "spacer" }), h("div", { style: { minWidth: "180px" } }, search), catSel),
    h("p", { class: "faint", style: { fontSize: "13px", margin: "-4px 0 12px" } }, "Click a day to complete it. Right-click (or press the Menu key) to skip or clear."),
    bodyHost);
  draw();
}
