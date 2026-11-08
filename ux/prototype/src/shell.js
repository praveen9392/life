import { api, DEMO_MODE } from "./core/api.js";
import { resetDemo } from "./core/mock.js";
import { h, clear, events, debounce } from "./core/dom.js";
import { icon } from "./core/icons.js";
import { navigate } from "./core/router.js";
import { session, toggleTheme } from "./core/session.js";
import { relTime } from "./core/format.js";
import { openMenu, openModal, openPopover, closeMenu, toast, toastError, confirmDialog, emptyState } from "./core/ui.js";
import { taskForm, habitForm, goalForm, healthForm, workoutForm, noteForm } from "./forms.js";

export const NAV = [
  { group: "Today", items: [{ to: "/app", label: "Today", icon: "today", mod: "today" }] },
  { group: "Plan", items: [
    { to: "/app/tasks", label: "Tasks", icon: "tasks", mod: "tasks", badge: true },
    { to: "/app/calendar", label: "Calendar", icon: "calendar", mod: "calendar" },
    { to: "/app/goals", label: "Goals", icon: "goals", mod: "goals" }] },
  { group: "Routines", items: [
    { to: "/app/habits", label: "Habits", icon: "habits", mod: "habits" },
    { to: "/app/learning", label: "Learning", icon: "learning", mod: "learning" },
    { to: "/app/workouts", label: "Workouts", icon: "workouts", mod: "workouts" },
    { to: "/app/health", label: "Health", icon: "health", mod: "health" }] },
  { group: "Capture", items: [{ to: "/app/notes", label: "Notes", icon: "notes", mod: "notes" }] },
  { group: "Review", items: [{ to: "/app/insights", label: "Insights", icon: "insights", mod: "insights" }] },
];
const ALL_ITEMS = NAV.flatMap((g) => g.items);

export const CREATE_ACTIONS = [
  { id: "task", label: "New task", icon: "tasks", run: () => taskForm(), page: "/app/tasks" },
  { id: "habit", label: "New habit", icon: "habits", run: () => habitForm(), page: "/app/habits" },
  { id: "note", label: "New note", icon: "notes", run: () => noteForm(), page: "/app/notes" },
  { id: "health", label: "Log health metric", icon: "health", run: () => healthForm(), page: "/app/health" },
  { id: "workout", label: "Log workout", icon: "workouts", run: () => workoutForm(), page: "/app/workouts" },
  { id: "goal", label: "New goal", icon: "goals", run: () => goalForm(), page: "/app/goals" },
];

export async function logout(all = false) {
  try { await (all ? api.auth.logoutAll() : api.auth.logout()); } catch (e) { toastError(e); return; }
  events.emit("session-ended");
}

function quickAdd(anchor) {
  openMenu(anchor, [{ head: "Create" }, ...CREATE_ACTIONS.map((a) => ({ label: a.label, icon: a.icon, onClick: a.run }))]);
}

function userMenu(anchor) {
  const u = session.user;
  openMenu(anchor, [
    { head: u.full_name ? `${u.full_name} - ${u.email}` : u.email },
    { label: "Settings", icon: "settings", href: "/app/settings" },
    { label: document.documentElement.dataset.theme === "dark" ? "Switch to light mode" : "Switch to dark mode", icon: document.documentElement.dataset.theme === "dark" ? "sun" : "moon", onClick: () => toggleTheme().catch(toastError) },
    ...(DEMO_MODE ? [{ label: "Reset demo data", icon: "repeat", onClick: async () => {
      if (await confirmDialog({ title: "Reset demo data?", message: "This restores the original sample data and discards everything you changed in this demo.", confirmLabel: "Reset", danger: false })) { resetDemo(); location.reload(); }
    } }] : []),
    "-",
    { label: "Log out everywhere", icon: "logout", onClick: async () => { if (await confirmDialog({ title: "Log out everywhere?", message: "This ends every session on every device, including this one.", confirmLabel: "Log out everywhere" })) logout(true); } },
    { label: "Log out", icon: "logout", danger: true, onClick: () => logout(false) },
  ]);
}

async function notificationsPopover(anchor, onChange) {
  const list = h("div", { style: { maxHeight: "60vh", overflowY: "auto" } }, h("div", { class: "empty", style: { padding: "24px" } }, h("div", { class: "spinner" })));
  const readAll = h("button", { class: "btn btn-ghost btn-sm", type: "button" }, "Mark all read");
  const head = h("div", { class: "card-head", style: { padding: "12px 16px" } }, h("h2", { style: { flex: 1 } }, "Notifications"), readAll);
  openPopover(anchor, [head, list]);
  const draw = (data) => {
    clear(list);
    readAll.disabled = data.unread_count === 0;
    if (!data.items.length) { list.append(emptyState({ icon: "bell", title: "You're all caught up", text: "Reminders for due tasks and goals show up here." })); return; }
    list.append(h("div", { class: "rows" }, data.items.map((n) => h("button", {
      type: "button", class: "row", style: { width: "100%", border: 0, textAlign: "left", alignItems: "flex-start" },
      onclick: async () => { if (!n.is_read) { try { await api.notifications.read(n.id); onChange(); } catch (e) { toastError(e); } } closeMenu(); },
    }, h("span", { class: "dot", style: { marginTop: "7px", background: n.is_read ? "var(--line-strong)" : "var(--accent)" } }),
    h("div", { class: "row-main" }, h("div", { class: "row-title", style: { fontWeight: n.is_read ? 500 : 700 } }, n.title), n.body ? h("div", { class: "row-meta" }, n.body) : null, h("div", { class: "row-meta" }, relTime(n.created_at)))))));
  };
  try {
    let data = await api.notifications.list();
    draw(data);
    readAll.onclick = async () => { try { await api.notifications.readAll(); data = await api.notifications.list(); draw(data); onChange(); } catch (e) { toastError(e); } };
  } catch (e) { clear(list).append(emptyState({ icon: "alert", title: "Couldn't load notifications", text: "Try again in a moment." })); }
}

/* ---------- Command bar ---------- */
const ENTITY = (key) => {
  const k = key.toLowerCase();
  if (k.includes("task")) return { icon: "tasks", label: "Tasks", href: (r) => `/app/tasks?search=${encodeURIComponent(r.title)}` };
  if (k.includes("habit")) return { icon: "habits", label: "Habits", href: () => "/app/habits" };
  if (k.includes("note")) return { icon: "notes", label: "Notes", href: (r) => `/app/notes?note=${r.id}` };
  if (k.includes("goal")) return { icon: "goals", label: "Goals", href: () => "/app/goals" };
  if (k.includes("course") || k.includes("learn")) return { icon: "learning", label: "Learning", href: () => "/app/learning" };
  if (k.includes("workout") || k.includes("exercise")) return { icon: "workouts", label: "Workouts", href: () => "/app/workouts" };
  if (k.includes("health")) return { icon: "health", label: "Health", href: () => "/app/health" };
  return { icon: "list", label: key, href: () => "/app" };
};

export function openCommandBar() {
  const returnFocus = document.activeElement;
  const field = h("input", { type: "search", role: "combobox", "aria-expanded": "true", "aria-controls": "cmd-list", "aria-label": "Search or run a command", placeholder: "Search everything, or type a command…", autocomplete: "off", spellcheck: "false" });
  const list = h("div", { class: "cmd-list", id: "cmd-list", role: "listbox" });
  const box = h("div", { class: "cmd", role: "dialog", "aria-modal": "true", "aria-label": "Command bar" }, field, list);
  const backdrop = h("div", { class: "backdrop cmd-backdrop" }, box);
  let results = [];
  let active = 0;
  let abort;

  const staticItems = (q) => {
    const query = q.toLowerCase();
    const actions = [
      ...CREATE_ACTIONS.map((a) => ({ group: "Create", label: a.label, icon: a.icon, run: a.run })),
      { group: "Actions", label: document.documentElement.dataset.theme === "dark" ? "Switch to light mode" : "Switch to dark mode", icon: "moon", run: () => toggleTheme().catch(toastError) },
      { group: "Actions", label: "Log out", icon: "logout", run: () => logout(false) },
    ];
    const go = ALL_ITEMS.concat([{ to: "/app/settings", label: "Settings", icon: "settings" }]).map((n) => ({ group: "Go to", label: n.label, icon: n.icon, run: () => navigate(n.to) }));
    return [...actions, ...go].filter((i) => !query || i.label.toLowerCase().includes(query)).slice(0, query ? 8 : 14);
  };

  const draw = () => {
    clear(list);
    let lastGroup = "";
    results.forEach((item, i) => {
      if (item.group !== lastGroup) { list.append(h("div", { class: "cmd-group", role: "presentation" }, item.group)); lastGroup = item.group; }
      list.append(h("button", { type: "button", class: "cmd-item", role: "option", id: `cmd-${i}`, "aria-selected": String(i === active), onclick: () => choose(item), onmousemove: () => { if (active !== i) { active = i; mark(); } } },
        icon(item.icon, 18), h("span", { style: { flex: 1, minWidth: 0 } }, h("div", { class: "truncate" }, item.label), item.snippet ? h("div", { class: "snip truncate" }, item.snippet) : null)));
    });
    if (!results.length) list.append(h("div", { class: "empty", style: { padding: "28px" } }, h("p", null, field.value.trim().length < 2 ? "Type at least 2 characters to search." : "No matches.")));
    field.setAttribute("aria-activedescendant", results.length ? `cmd-${active}` : "");
  };
  const mark = () => {
    list.querySelectorAll(".cmd-item").forEach((el, i) => el.setAttribute("aria-selected", String(i === active)));
    list.querySelector(`#cmd-${active}`)?.scrollIntoView({ block: "nearest" });
    field.setAttribute("aria-activedescendant", `cmd-${active}`);
  };
  const close = () => { abort?.abort(); backdrop.remove(); document.body.style.overflow = ""; returnFocus?.isConnected && returnFocus.focus(); };
  const choose = (item) => { close(); item.run(); };

  const search = debounce(async () => {
    const q = field.value.trim();
    abort?.abort();
    if (q.length < 2) { results = staticItems(q); active = 0; draw(); return; }
    abort = new AbortController();
    try {
      const res = await api.search(q, abort.signal);
      const found = Object.entries(res.results ?? {}).flatMap(([key, items]) => {
        const meta = ENTITY(key);
        return items.map((r) => ({ group: meta.label, label: r.title, snippet: r.snippet, icon: meta.icon, run: () => navigate(meta.href(r)) }));
      });
      results = [...found.slice(0, 12), ...staticItems(q)];
    } catch (e) {
      if (e?.name === "AbortError") return;
      results = staticItems(q);
    }
    active = 0;
    draw();
  }, 200);

  field.addEventListener("input", () => { results = staticItems(field.value.trim()); active = 0; draw(); search(); });
  field.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(results.length - 1, active + 1); mark(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); mark(); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[active]) choose(results[active]); }
    else if (e.key === "Escape") { e.stopPropagation(); close(); }
  });
  backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(); });
  results = staticItems("");
  draw();
  document.body.append(backdrop);
  document.body.style.overflow = "hidden";
  field.focus();
}

/* ---------- Shell ---------- */
export function mountShell(root) {
  const collapsedKey = "life.proto.collapsed";
  const app = h("div", { class: `app${localStorage.getItem(collapsedKey) === "1" ? " collapsed" : ""}` });
  const badges = new Map();

  const navLink = (item) => {
    const badge = item.badge ? h("span", { class: "badge", hidden: true }) : null;
    if (badge) badges.set(item.to, badge);
    return h("a", { class: "nav-link", href: item.to, "data-link": "", "data-to": item.to, style: { "--mod": `var(--m-${item.mod})` }, title: item.label },
      h("span", { class: "nav-icon" }, icon(item.icon, 20)), h("span", { class: "txt" }, item.label), badge);
  };
  const collapseBtn = h("button", { class: "nav-link", type: "button", "aria-label": "Collapse sidebar", title: "Collapse sidebar", onclick: () => {
    const on = app.classList.toggle("collapsed");
    localStorage.setItem(collapsedKey, on ? "1" : "0");
    collapseBtn.setAttribute("aria-label", on ? "Expand sidebar" : "Collapse sidebar");
  } }, h("span", { class: "nav-icon" }, icon("left", 20)), h("span", { class: "txt collapse-label" }, "Collapse"));

  const sidebar = h("aside", { class: "sidebar" },
    h("a", { class: "brand", href: "/app", "data-link": "", "aria-label": "Life - Today" }, h("span", { class: "brand-mark" }, icon("bolt", 18)), h("span", { class: "brand-name" }, "Life")),
    h("nav", { "aria-label": "Main" }, NAV.map((g) => h("div", { class: "nav-group" }, h("div", { class: "nav-label" }, g.group), g.items.map(navLink)))),
    h("div", { class: "sidebar-foot" }, navLink({ to: "/app/settings", label: "Settings", icon: "settings", mod: "calendar" }), collapseBtn));

  const bellDot = h("span", { class: "bell-dot", hidden: true });
  const bell = h("button", { class: "btn btn-ghost btn-icon icon-btn", type: "button", "aria-label": "Notifications", "aria-haspopup": "dialog", onclick: () => notificationsPopover(bell, refreshBell) }, icon("bell", 20), bellDot);
  const themeBtn = h("button", { class: "btn btn-ghost btn-icon", type: "button", onclick: () => toggleTheme().catch(toastError) });
  const syncThemeBtn = () => {
    const dark = document.documentElement.dataset.theme === "dark";
    themeBtn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    clear(themeBtn).append(icon(dark ? "sun" : "moon", 20));
  };
  new MutationObserver(syncThemeBtn).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  syncThemeBtn();
  const avatar = h("button", { class: "avatar", type: "button", "aria-label": "Account menu", "aria-haspopup": "menu", onclick: () => userMenu(avatar) });
  const syncAvatar = () => { avatar.textContent = (session.user?.full_name || session.user?.email || "?").trim()[0].toUpperCase(); };
  syncAvatar();
  events.on("user", syncAvatar);

  const addBtn = h("button", { class: "btn btn-primary", type: "button", "aria-haspopup": "menu", onclick: () => quickAdd(addBtn) }, icon("plus", 18), h("span", { class: "add-label" }, "Quick add"));
  const trigger = h("button", { class: "cmd-trigger", type: "button", "aria-label": "Search or run a command", onclick: openCommandBar }, icon("search", 18), h("span", null, "Search or jump to…"), h("kbd", null, /Mac/.test(navigator.platform) ? "⌘K" : "Ctrl K"));
  const topbar = h("header", { class: "topbar" },
    h("a", { class: "brand-mobile", href: "/app", "data-link": "" }, h("span", { class: "brand-mark", style: { width: "28px", height: "28px" } }, icon("bolt", 16)), h("span", { class: "brand-name", style: { fontSize: "20px" } }, "Life")),
    trigger, h("span", { class: "spacer" }),
    DEMO_MODE ? h("span", { class: "chip chip-warn demo-chip", title: "Running on built-in sample data. Changes stay in this browser; use the account menu to reset." }, "Demo data") : null,
    addBtn, bell, themeBtn, avatar);

  const main = h("main", { class: "content", id: "main", tabindex: "-1" });

  const tab = (to, label, ic) => h("a", { href: to, "data-link": "", "data-to": to }, icon(ic, 22), label);
  const moreBtn = h("button", { type: "button", "aria-haspopup": "dialog", onclick: () => openMore() }, icon("more", 22), "More");
  const tabbar = h("nav", { class: "tabbar", "aria-label": "Primary" },
    tab("/app", "Today", "today"), tab("/app/tasks", "Tasks", "tasks"),
    h("button", { type: "button", class: "fab", "aria-label": "Quick add", "aria-haspopup": "menu", onclick: (e) => quickAdd(e.currentTarget) }, h("span", { class: "circle" }, icon("plus", 24)), h("span", { class: "sr-only" }, "Quick add")),
    tab("/app/habits", "Habits", "habits"), moreBtn);

  function openMore() {
    const grid = h("div", { class: "grid-3", style: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } }, [...ALL_ITEMS, { to: "/app/settings", label: "Settings", icon: "settings", mod: "calendar" }].map((n) =>
      h("a", { class: "card", href: n.to, "data-link": "", style: { display: "flex", alignItems: "center", gap: "12px", textDecoration: "none", color: "var(--ink)", padding: "14px", "--mod": `var(--m-${n.mod})` }, onclick: () => dlg.close() },
        h("span", { style: { color: "var(--mod)" } }, icon(n.icon, 22)), h("strong", null, n.label))));
    const out = h("button", { class: "btn btn-secondary", type: "button", onclick: () => { dlg.close(); logout(false); } }, icon("logout", 18), "Log out");
    const dlg = openModal({ title: "More", body: [grid, out] });
  }

  app.append(sidebar, h("div", { class: "main-col" }, topbar, main), tabbar);
  root.replaceChildren(h("a", { class: "skip-link", href: "#main", onclick: (e) => { e.preventDefault(); main.focus(); } }, "Skip to content"), app);

  async function refreshBadges() {
    try {
      const [pending, notes] = await Promise.all([api.tasks.list({ status: "pending", page_size: 1 }), api.notifications.list()]);
      const b = badges.get("/app/tasks");
      if (b) { b.textContent = String(pending.total); b.hidden = pending.total === 0; }
      bellDot.textContent = notes.unread_count > 9 ? "9+" : String(notes.unread_count);
      bellDot.hidden = notes.unread_count === 0;
    } catch { /* badges are best-effort */ }
  }
  const refreshBell = refreshBadges;
  events.on("data", debounce(refreshBadges, 400));
  refreshBadges();

  return {
    outlet: main,
    setActive(path) {
      app.querySelectorAll("[data-to]").forEach((a) => {
        const to = a.dataset.to;
        const on = to === "/app" ? path === "/app" : path === to || path.startsWith(`${to}/`);
        if (on) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      });
    },
  };
}

export function bindShortcuts() {
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (!document.querySelector(".cmd")) openCommandBar();
    }
  });
}
