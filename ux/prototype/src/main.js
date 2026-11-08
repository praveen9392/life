import { ApiError, API_BASE, setSessionLostHandler } from "./core/api.js";
import { h, events } from "./core/dom.js";
import { currentPath, navigate, reload, route, startRouter } from "./core/router.js";
import { applyTheme, clearSession, loadUser, session, storedTheme } from "./core/session.js";
import { errorState, skeletonRows } from "./core/ui.js";
import { bindShortcuts, mountShell } from "./shell.js";

const root = document.getElementById("root");
applyTheme(storedTheme());
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (document.documentElement.dataset.themePref === "system") applyTheme("system");
});

// Static dynamic-import map (no computed specifier) so the standalone build can inline every page.
const PAGES = {
  onboarding: () => import("./pages/onboarding.js"),
  today: () => import("./pages/today.js"),
  tasks: () => import("./pages/tasks.js"),
  habits: () => import("./pages/habits.js"),
  notes: () => import("./pages/notes.js"),
  health: () => import("./pages/health.js"),
  workouts: () => import("./pages/workouts.js"),
  learning: () => import("./pages/learning.js"),
  goals: () => import("./pages/goals.js"),
  calendar: () => import("./pages/calendar.js"),
  insights: () => import("./pages/insights.js"),
  settings: () => import("./pages/settings.js"),
  notfound: () => import("./pages/notfound.js"),
};
const page = (file) => PAGES[file] ?? (() => import("./pages/notfound.js"));
route("/", null, { redirect: "/app" });
route("/login", () => import("./pages/auth.js").then((m) => ({ default: m.loginPage })), { guestOnly: true, title: "Log in" });
route("/register", () => import("./pages/auth.js").then((m) => ({ default: m.registerPage })), { guestOnly: true, title: "Create account" });
route("/onboarding", page("onboarding"), { authed: true, bare: true, title: "Welcome" });
route("/app", page("today"), { authed: true, title: "Today" });
route("/app/tasks", page("tasks"), { authed: true, title: "Tasks" });
route("/app/habits", page("habits"), { authed: true, title: "Habits" });
route("/app/notes", page("notes"), { authed: true, title: "Notes" });
route("/app/health", page("health"), { authed: true, title: "Health" });
route("/app/workouts", page("workouts"), { authed: true, title: "Workouts" });
route("/app/learning", page("learning"), { authed: true, title: "Learning" });
route("/app/goals", page("goals"), { authed: true, title: "Goals" });
route("/app/calendar", page("calendar"), { authed: true, title: "Calendar" });
route("/app/insights", page("insights"), { authed: true, title: "Insights" });
route("/app/settings", page("settings"), { authed: true, title: "Settings" });
route("/app/analytics", null, { redirect: "/app/insights" });
route("/app/profile", null, { redirect: "/app/settings" });
route("*", () => import("./pages/notfound.js"), { title: "Page not found" });

let shell = null;
let token = 0;
let cleanup = null;
let refreshing = false;

function showFatal(e, retry) {
  shell = null;
  root.replaceChildren(h("main", { style: { minHeight: "100vh", display: "grid", placeItems: "center" } }, errorState(e, retry)));
}

async function render(r, path) {
  const mine = ++token;
  const isRefresh = refreshing;
  refreshing = false;
  const stale = () => mine !== token;
  if (!isRefresh) { try { cleanup?.(); } catch { /* page cleanup must not block navigation */ } cleanup = null; }
  if (r.redirect) { navigate(r.redirect, { replace: true }); return; }

  if (r.authed || r.guestOnly) {
    if (!session.user) {
      try { await loadUser(); } catch (e) {
        if (stale()) return;
        if (e instanceof ApiError && e.status === 401) { if (r.authed) { navigate("/login", { replace: true }); return; } }
        else { showFatal(e, () => reload()); return; }
      }
    }
    if (stale()) return;
    if (r.guestOnly && session.user) { navigate("/app", { replace: true }); return; }
  }

  let outlet;
  if (r.authed && !r.bare) {
    if (!shell) shell = mountShell(root);
    shell.setActive(path);
    outlet = shell.outlet;
  } else {
    shell = null;
    outlet = root;
  }

  document.title = `${r.title ?? "Life"} - Life`;
  const view = h("div", { class: isRefresh ? "" : "view-enter" });
  if (!isRefresh) {
    view.append(skeletonRows(5));
    outlet.replaceChildren(view);
  }
  const target = isRefresh ? h("div") : view;
  const ctx = { user: session.user, navigate, stale, setTitle: (t) => { document.title = `${t} - Life`; } };
  try {
    const mod = await r.loader();
    if (stale()) return;
    const cl = await mod.default(target, ctx);
    if (stale()) { cl?.(); return; }
    cleanup = cl ?? null;
    if (isRefresh) {
      const y = window.scrollY;
      outlet.replaceChildren(target);
      window.scrollTo(0, y);
    }
    if (!isRefresh) {
      window.scrollTo(0, 0);
      (document.getElementById("page-title") ?? outlet).focus?.({ preventScroll: true });
    }
  } catch (e) {
    if (stale()) return;
    if (e instanceof ApiError && e.status === 401) return;
    console.error("[Life prototype] page failed to render:", e);
    outlet.replaceChildren(h("div", { class: "view-enter" }, errorState(e, () => reload())));
  }
}

setSessionLostHandler(() => {
  clearSession();
  shell = null;
  // Compare against the router's path (hash-based on file://), not location.pathname —
  // otherwise the file:// build loops forever trying to reach /login.
  if (!/^\/(login|register)/.test(currentPath())) navigate("/login", { replace: true });
});
events.on("session-ended", () => { clearSession(); shell = null; navigate("/login", { replace: true }); });
events.on("refresh", () => { refreshing = true; reload(); });
events.on("open-note", (id) => navigate(`/app/notes?note=${id}`));
bindShortcuts();
startRouter(render);
console.info(`[Life prototype] API: ${API_BASE}`);
