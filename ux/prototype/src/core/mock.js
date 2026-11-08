/**
 * In-browser mock of the Life REST API for demo mode (no server, no backend).
 * Mirrors the response shapes and the behaviours the prototype relies on
 * (pagination, filters, archived notes hidden, 409 on duplicate folder/tag, computed
 * dashboard / analytics / calendar). Data is seeded relative to "today" and persisted in
 * localStorage so changes survive a reload. Reset via "Reset demo data" in the account menu.
 */
import { ApiError } from "./errors.js";
import { addDays, diffDays, isoDate, parseISO, startOfWeek, todayISO } from "./format.js";

const KEY = "life.proto.demo.v3";
const DEMO_PASSWORD = "demo-password-123";
const LATENCY_MS = 35;

/* ---------- storage ---------- */
let db = null;
const mem = {};
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return mem[k] ?? null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { mem[k] = v; } },
  remove: (k) => { try { localStorage.removeItem(k); } catch { delete mem[k]; } },
};
const save = () => store.set(KEY, JSON.stringify(db));
export function resetDemo() { store.remove(KEY); db = null; }

const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);
const nowIso = () => new Date().toISOString();
const clone = (v) => JSON.parse(JSON.stringify(v));

/* ---------- seed ---------- */
function seed() {
  const today = todayISO();
  const d = (n) => addDays(today, n);
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const ts = (n, h = 9) => { const x = parseISO(d(n)); x.setHours(h, 15, 0, 0); return x.toISOString(); };

  const tag = (name) => ({ id: uid(), name });
  const tags = [tag("work"), tag("home"), tag("health"), tag("learning")];
  const T = Object.fromEntries(tags.map((t) => [t.name, t.id]));

  const habit = (name, category, extra = {}) => ({
    id: uid(), name, description: null, category, icon: null, color: null, frequency_type: "daily", frequency_config: {},
    target_count: 1, start_date: d(-45), end_date: null, reminder_time: null, is_active: true, created_at: ts(-45), updated_at: ts(-45), ...extra,
  });
  const habits = [
    habit("Read 20 pages", "mind", { reminder_time: "21:00:00" }),
    habit("Morning run", "fitness", { frequency_type: "weekly", frequency_config: { weekdays: [0, 2, 4] }, reminder_time: "07:00:00" }),
    habit("Meditate", "mindfulness", { reminder_time: "07:30:00" }),
    habit("Drink 8 glasses of water", "health"),
    habit("Journal", "mind", { reminder_time: "22:00:00" }),
    habit("Stretch", "fitness", { frequency_type: "custom_days", frequency_config: { every_n_days: 2 } }),
  ];
  const habitLogs = {};
  const dowOf = (iso) => (parseISO(iso).getDay() + 6) % 7;
  for (const h of habits) {
    habitLogs[h.id] = {};
    for (let n = 45; n >= 0; n--) {
      const date = d(-n);
      const cfg = h.frequency_config;
      const sch = h.frequency_type === "weekly" ? cfg.weekdays.includes(dowOf(date)) : h.frequency_type === "custom_days" ? diffDays(date, h.start_date) % cfg.every_n_days === 0 : true;
      if (!sch) continue;
      const r = rnd();
      if (n === 0) { if (h.name === "Meditate" || h.name === "Drink 8 glasses of water") habitLogs[h.id][date] = "completed"; continue; }
      habitLogs[h.id][date] = r < 0.78 ? "completed" : r < 0.88 ? "skipped" : "missed";
    }
  }
  // Give two habits a clean current streak so the streak chips look alive.
  for (const name of ["Meditate", "Read 20 pages"]) {
    const h = habits.find((x) => x.name === name);
    for (let n = 1; n <= (name === "Meditate" ? 12 : 8); n++) habitLogs[h.id][d(-n)] = "completed";
  }

  const task = (title, due, extra = {}) => ({
    id: uid(), title, description: null, priority: "medium", status: "pending", list: "today", due_date: due, due_time: null,
    estimated_duration_minutes: null, is_recurring_template: false, recurrence_rule: null, recurrence_template_id: null, tag_ids: [],
    completed_at: null, created_at: ts(-5), updated_at: ts(-1), ...extra,
  });
  const tasks = [
    task("Ship the quarterly report", d(0), { priority: "high", due_time: "16:00:00", description: "Final numbers from finance, then send to the leadership group.", tag_ids: [T.work], estimated_duration_minutes: 90 }),
    task("Reply to Priya about the design review", d(0), { tag_ids: [T.work], estimated_duration_minutes: 15 }),
    task("Water the plants", d(0), { list: "today", recurrence_rule: { frequency: "daily" }, tag_ids: [T.home] }),
    task("Renew passport", d(-3), { priority: "urgent", description: "Appointment slots open on the 15th.", tag_ids: [T.home] }),
    task("Book dentist appointment", d(-1), { priority: "low", tag_ids: [T.health] }),
    task("Plan next week's sprint", d(2), { list: "upcoming", priority: "medium", tag_ids: [T.work] }),
    task("Buy a birthday gift for Sam", d(4), { list: "upcoming", tag_ids: [T.home] }),
    task("Finish the System Design course module", d(6), { list: "upcoming", priority: "high", tag_ids: [T.learning], status: "in_progress" }),
    task("Read the Rust book, chapter 4", d(-20), { list: "later", due_date: null, tag_ids: [T.learning] }),
    task("Clean out the garage", null, { list: "later", priority: "low", tag_ids: [T.home] }),
    task("Send invoices", d(0), { status: "completed", completed_at: ts(0, 8), priority: "high", tag_ids: [T.work] }),
    task("Morning workout", d(-1), { status: "completed", completed_at: ts(-1, 7), tag_ids: [T.health] }),
    task("Pay electricity bill", d(-2), { status: "completed", completed_at: ts(-2, 12), tag_ids: [T.home] }),
    task("Prepare the demo script", d(-4), { status: "completed", completed_at: ts(-4, 15), tag_ids: [T.work] }),
  ];

  const dir = (name) => ({ id: uid(), name, created_at: ts(-30), updated_at: ts(-2) });
  const dirs = [dir("Projects"), dir("Ideas"), dir("Journal")];
  const note = (title, content, extra = {}) => ({ id: uid(), title, content, category: null, directory_id: null, is_pinned: false, is_archived: false, tag_ids: [], created_at: ts(-10), updated_at: ts(-1), ...extra });
  const notes = [
    note("Welcome to Life", "# Welcome\n\nThis is a **demo workspace** with sample data. Everything you change stays in this browser.\n\n## Try this\n\n- Tick off a habit on **Today**\n- Press **Ctrl K** to search or jump anywhere\n- Open **Insights** to see your trends\n\n> Notes support markdown, so headings, lists and quotes just work.", { is_pinned: true, updated_at: ts(0, 8) }),
    note("Q4 product roadmap", "# Q4 roadmap\n\n## Themes\n\n1. Reliability first\n2. Faster onboarding\n3. Mobile polish\n\n## Risks\n\n- Hiring slips by a month\n- Third-party API changes\n\n```\nstatus: draft\nowner: Ava\n```", { directory_id: dirs[0].id, tag_ids: [T.work], updated_at: ts(-1, 17) }),
    note("Meeting notes - design review", "**Attendees:** Priya, Marco, Ava\n\n- Agreed on the new navigation groups\n- Command bar ships first\n- Follow-up: mobile tab bar spacing\n\n### Action items\n\n1. Ava - update the prototype\n2. Marco - estimate the API changes", { directory_id: dirs[0].id, tag_ids: [T.work], updated_at: ts(-2, 11) }),
    note("App ideas", "- A calm weekly review screen\n- Habit stacking suggestions\n- Voice capture for notes\n- Share a goal with a friend", { directory_id: dirs[1].id, updated_at: ts(-4, 20) }),
    note("Journal - this week", "Felt focused on Monday and slipped on Wednesday. The morning run is making the whole day easier. Keep the evening journal short: three lines is enough.", { directory_id: dirs[2].id, updated_at: ts(-1, 22) }),
    note("Groceries and errands", "- Oat milk\n- Coffee beans\n- Batteries\n- Post office before 5pm", { updated_at: ts(-3, 18) }),
  ];

  const metric = (type, value, unit, n, h = 8) => ({ id: uid(), metric_type: type, value, unit, recorded_at: ts(n, h), note: null, created_at: ts(n, h) });
  const health = [];
  for (let i = 0; i < 12; i++) health.push(metric("weight", Math.round((74.8 - i * 0.1 + (rnd() - 0.5) * 0.4) * 10) / 10, "kg", -(33 - i * 3)));
  for (let i = 0; i < 14; i++) health.push(metric("sleep", Math.round((6.4 + rnd() * 2) * 10) / 10, "hours", -i, 7));
  for (let i = 0; i < 10; i++) health.push(metric("steps", Math.round(5200 + rnd() * 6500), "steps", -i, 21));
  for (let i = 0; i < 8; i++) health.push(metric("water", Math.round(4 + rnd() * 5), "glasses", -i, 20));
  for (let i = 0; i < 6; i++) health.push(metric("resting_heart_rate", Math.round(56 + rnd() * 6), "bpm", -(i * 4), 8));

  const ex = (name, muscle_group, equipment) => ({ id: uid(), user_id: null, name, muscle_group, equipment });
  const exercises = [ex("Back Squat", "Legs", "Barbell"), ex("Bench Press", "Chest", "Barbell"), ex("Deadlift", "Back", "Barbell"), ex("Overhead Press", "Shoulders", "Barbell"), ex("Pull-up", "Back", "Bodyweight"), ex("Easy run", "Cardio", null)];
  const sessions = [];
  [0, 2, 4, 7, 9, 12, 16, 19, 23, 26].forEach((n, i) => {
    const sets = [];
    const picks = i % 2 === 0 ? [0, 1] : [2, 3, 4];
    picks.forEach((pi) => { for (let k = 1; k <= 3; k++) sets.push({ id: uid(), exercise_id: exercises[pi].id, set_number: k, reps: pi === 4 ? 6 + k : 8 - (k > 2 ? 1 : 0), weight: pi === 4 ? null : 40 + pi * 12 + i * 1.5 + k * 2.5, weight_unit: pi === 4 ? null : "kg", duration_seconds: null }); });
    sessions.push({ id: uid(), workout_id: null, performed_at: ts(-n, 18), duration_minutes: 45 + (i % 3) * 10, notes: i % 3 === 0 ? "Felt strong today" : null, sets, created_at: ts(-n, 19) });
  });

  const lesson = (title, position, status, dur) => ({ id: uid(), title, position, status, duration_minutes: dur, completed_at: status === "completed" ? ts(-3) : null });
  const course1 = { id: uid(), title: "System Design Fundamentals", provider: "Educative", start_date: d(-40), target_date: d(30), status: "in_progress", created_at: ts(-40), modules: [
    { id: uid(), title: "Scalability basics", position: 0, lessons: [lesson("Load balancing", 0, "completed", 25), lesson("Caching strategies", 1, "completed", 30), lesson("Database sharding", 2, "in_progress", 35)] },
    { id: uid(), title: "Reliability", position: 1, lessons: [lesson("Replication", 0, "not_started", 30), lesson("Failure modes", 1, "not_started", 20)] },
  ] };
  const course2 = { id: uid(), title: "Rust for Everyone", provider: "Self-paced", start_date: d(-12), target_date: d(60), status: "in_progress", created_at: ts(-12), modules: [
    { id: uid(), title: "Ownership", position: 0, lessons: [lesson("Moves and borrows", 0, "completed", 40), lesson("Lifetimes", 1, "not_started", 45)] },
  ] };
  const items = [
    { id: uid(), type: "book", title: "Designing Data-Intensive Applications", status: "in_progress", progress_percent: 45, created_at: ts(-30) },
    { id: uid(), type: "book", title: "The Pragmatic Programmer", status: "completed", progress_percent: 100, created_at: ts(-90) },
    { id: uid(), type: "technology", title: "PostgreSQL internals", status: "not_started", progress_percent: 0, created_at: ts(-5) },
  ];
  const learningSessions = [0, 1, 3, 4, 6, 8, 11, 14].map((n, i) => ({ id: uid(), course_id: i % 3 === 2 ? course2.id : course1.id, learning_item_id: null, topic: i % 4 === 0 ? "Review notes" : null, duration_minutes: 25 + (i % 4) * 10, session_date: d(-n), notes: null, created_at: ts(-n, 20) }));

  const ms = (title, done, n) => ({ id: uid(), title, target_date: n == null ? null : d(n), is_completed: done, completed_at: done ? ts(-6) : null });
  const goals = [
    { id: uid(), title: "Run a half marathon", description: "Autumn race. Build up to 15k first.", category: "Fitness", target_date: d(70), status: "in_progress", progress_mode: "milestones", progress_percent: 0, milestones: [ms("Run 5k without stopping", true, -30), ms("Run 10k", true, -5), ms("Run 15k", false, 25), ms("Race day", false, 70)], created_at: ts(-60) },
    { id: uid(), title: "Read 24 books this year", description: null, category: "Learning", target_date: d(55), status: "in_progress", progress_mode: "manual", progress_percent: 54, milestones: [], created_at: ts(-200) },
    { id: uid(), title: "Save 5,000 for the trip", description: "Monthly transfer on the 1st.", category: "Finance", target_date: d(110), status: "in_progress", progress_mode: "manual", progress_percent: 62, milestones: [], created_at: ts(-120) },
  ];

  const notifs = [
    { id: uid(), type: "task_due_soon", title: "Ship the quarterly report is due today", body: "Due at 4:00 pm.", related_entity_type: "task", related_entity_id: tasks[0].id, is_read: false, created_at: ts(0, 8) },
    { id: uid(), type: "task_overdue", title: "Renew passport is overdue", body: "It was due 3 days ago.", related_entity_type: "task", related_entity_id: tasks[3].id, is_read: false, created_at: ts(0, 7) },
    { id: uid(), type: "goal_deadline", title: "Run 15k milestone is coming up", body: "25 days left.", related_entity_type: "goal", related_entity_id: goals[0].id, is_read: true, created_at: ts(-1, 9) },
  ];

  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
  return {
    loggedIn: true, password: DEMO_PASSWORD,
    user: { id: uid(), email: "ava.morgan@example.com", full_name: "Ava Morgan", avatar_url: null, timezone: tz, theme_preference: "system",
      notification_preferences: { task_due_soon: true, habit_reminder: true, learning_reminder: true, workout_reminder: true, goal_deadline_approaching: true },
      onboarding_completed_at: nowIso(), created_at: ts(-90) },
    sessions: [
      { id: uid(), created_at: nowIso(), expires_at: ts(30), user_agent: globalThis.navigator?.userAgent ?? "Browser", ip_address: null, is_current: true },
      { id: uid(), created_at: ts(-6, 19), expires_at: ts(24), user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1", ip_address: null, is_current: false },
    ],
    tags, habits, habitLogs, tasks, dirs, notes, health, exercises, workoutSessions: sessions,
    courses: [course1, course2], learningItems: items, learningSessions, goals, notifications: notifs,
  };
}

function load() {
  if (db) return db;
  try { const raw = store.get(KEY); if (raw) { db = JSON.parse(raw); return db; } } catch { /* corrupt: reseed */ }
  db = seed();
  save();
  return db;
}

/* ---------- helpers ---------- */
const fail = (status, code, message, fields) => { throw new ApiError(status, code, message, fields); };
const notFound = (what = "Resource") => fail(404, "NOT_FOUND", `${what} not found`);
const required = (field, value, label) => { if (!String(value ?? "").trim()) fail(422, "VALIDATION_ERROR", "Invalid request data", { [field]: `${label} is required` }); };
const page = (items, q) => {
  const size = Math.max(1, Math.min(200, Number(q.get("page_size")) || 20));
  const p = Math.max(1, Number(q.get("page")) || 1);
  return { items: items.slice((p - 1) * size, p * size), total: items.length, page: p, page_size: size };
};
const dowOf = (iso) => (parseISO(iso).getDay() + 6) % 7;
const tagObjs = (ids = []) => ids.map((id) => db.tags.find((t) => t.id === id)).filter(Boolean).map((t) => ({ id: t.id, name: t.name }));
const shapeTask = (t) => { const { tag_ids, ...rest } = t; return { ...rest, tags: tagObjs(tag_ids) }; };
const shapeNote = (n) => { const { tag_ids, ...rest } = n; return { ...rest, tags: tagObjs(tag_ids) }; };
const liveNote = (id) => { const n = db.notes.find((x) => x.id === id && !x.is_archived); return n ?? notFound("Note"); };
const within = (iso, from, to) => iso >= from && iso <= to;

function scheduled(h, date) {
  if (date < h.start_date || (h.end_date && date > h.end_date)) return false;
  const cfg = h.frequency_config ?? {};
  if (h.frequency_type === "weekly") return (cfg.weekdays ?? []).includes(dowOf(date));
  if (h.frequency_type === "custom_days") return diffDays(date, h.start_date) % (cfg.every_n_days || 1) === 0;
  return true;
}

function streaks(h) {
  const logs = db.habitLogs[h.id] ?? {};
  const today = todayISO();
  let current = 0;
  for (let d = today, i = 0; i < 400 && d >= h.start_date; d = addDays(d, -1), i++) {
    if (!scheduled(h, d)) continue;
    const st = logs[d];
    if (st === "completed") current++;
    else if (st === "skipped" || st === "not_applicable") continue;
    else if (d === today) continue;
    else break;
  }
  let longest = 0, run = 0;
  for (let d = h.start_date; d <= today; d = addDays(d, 1)) {
    if (!scheduled(h, d)) continue;
    const st = logs[d];
    if (st === "completed") { run++; longest = Math.max(longest, run); } else if (st === "skipped" || st === "not_applicable") continue; else if (d === today) continue; else run = 0;
  }
  return { current_streak: current, longest_streak: Math.max(longest, current) };
}

const activeHabits = () => db.habits.filter((h) => h.is_active);
const goalProgress = (g) => (g.progress_mode === "milestones" ? (g.milestones.length ? Math.round((g.milestones.filter((m) => m.is_completed).length / g.milestones.length) * 100) : 0) : g.progress_percent);
const shapeGoal = (g) => ({ ...g, progress_percent: goalProgress(g) });
const courseProgress = (c) => { const ls = c.modules.flatMap((m) => m.lessons); return ls.length ? Math.round((ls.filter((l) => l.status === "completed").length / ls.length) * 100) : 0; };
const shapeCourse = ({ modules, ...c }) => ({ ...c, progress_percent: courseProgress({ modules }) });

function nextOccurrence(t) {
  const f = t.recurrence_rule?.frequency;
  if (!f || !t.due_date) return null;
  const nextDue = f === "daily" ? addDays(t.due_date, 1) : f === "weekly" ? addDays(t.due_date, 7) : addDays(t.due_date, 30);
  return { ...t, id: uid(), status: "pending", completed_at: null, due_date: nextDue, created_at: nowIso(), updated_at: nowIso() };
}

/* ---------- route table ---------- */
const routes = [];
const on = (method, pattern, fn, { auth = true } = {}) => routes.push({ method, auth, fn, re: new RegExp(`^${pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)")}$`) });

// auth
on("POST", "/api/v1/auth/register", ({ body }) => {
  if (!/^\S+@\S+\.\S+$/.test(body?.email ?? "")) fail(422, "VALIDATION_ERROR", "Invalid request data", { email: "Enter a valid email address" });
  if ((body?.password ?? "").length < 10) fail(422, "VALIDATION_ERROR", "Invalid request data", { password: "Use at least 10 characters" });
  db.loggedIn = true;
  db.user.email = body.email;
  if (body.full_name) db.user.full_name = body.full_name;
  return { user: db.user };
}, { auth: false });
on("POST", "/api/v1/auth/login", ({ body }) => {
  if (!body?.email || !body?.password) fail(401, "UNAUTHORIZED", "Invalid email or password");
  db.loggedIn = true;
  return { user: db.user };
}, { auth: false });
on("POST", "/api/v1/auth/refresh", () => (db.loggedIn ? { user: db.user } : fail(401, "UNAUTHORIZED", "Not signed in")), { auth: false });
on("POST", "/api/v1/auth/logout", () => { db.loggedIn = false; return { message: "Logged out" }; }, { auth: false });
on("POST", "/api/v1/auth/logout-all", () => { db.loggedIn = false; return { message: "Logged out everywhere" }; }, { auth: false });

// me
on("GET", "/api/v1/users/me", () => db.user);
on("PATCH", "/api/v1/users/me", ({ body }) => {
  for (const k of ["full_name", "timezone", "theme_preference", "notification_preferences"]) if (body[k] !== undefined) db.user[k] = body[k];
  return db.user;
});
on("POST", "/api/v1/users/me/onboarding", () => { db.user.onboarding_completed_at = nowIso(); return db.user; });
on("POST", "/api/v1/users/me/password", ({ body }) => {
  if (body.current_password !== db.password) fail(400, "VALIDATION_ERROR", "Current password is incorrect", { current_password: "Current password is incorrect" });
  if ((body.new_password ?? "").length < 10) fail(422, "VALIDATION_ERROR", "Invalid request data", { new_password: "Use at least 10 characters" });
  db.password = body.new_password;
  db.sessions = db.sessions.filter((s) => s.is_current);
  return { message: "Password changed" };
});
on("GET", "/api/v1/users/me/sessions", () => db.sessions);
on("DELETE", "/api/v1/users/me/sessions/:id", ({ params }) => { db.sessions = db.sessions.filter((s) => s.id !== params.id || s.is_current); return { message: "Session revoked" }; });
on("GET", "/api/v1/privacy/export", () => ({ exported_at: nowIso(), note: "Sample data exported from the Life demo.", user: db.user, tasks: db.tasks.map(shapeTask), habits: db.habits, habit_logs: db.habitLogs, notes: db.notes.map(shapeNote), note_directories: db.dirs, health_metrics: db.health, workout_sessions: db.workoutSessions, courses: db.courses, learning_items: db.learningItems, learning_sessions: db.learningSessions, goals: db.goals.map(shapeGoal) }));
on("DELETE", "/api/v1/privacy/account", ({ body }) => {
  if (body?.current_password !== db.password) fail(400, "VALIDATION_ERROR", "Current password is incorrect", { current_password: "Current password is incorrect" });
  resetDemo();
});

// tags
on("GET", "/api/v1/tags", () => db.tags);
on("POST", "/api/v1/tags", ({ body }) => {
  required("name", body.name, "Name");
  if (db.tags.some((t) => t.name.toLowerCase() === body.name.trim().toLowerCase())) fail(409, "CONFLICT", "A tag with that name already exists");
  const t = { id: uid(), name: body.name.trim() };
  db.tags.push(t);
  return t;
});

// tasks
on("GET", "/api/v1/tasks", ({ query: q }) => {
  const today = todayISO();
  const search = q.get("search")?.toLowerCase();
  let list = db.tasks.filter((t) => !t.is_recurring_template);
  if (q.get("status")) list = list.filter((t) => t.status === q.get("status"));
  if (q.get("list")) list = list.filter((t) => t.list === q.get("list"));
  if (q.get("priority")) list = list.filter((t) => t.priority === q.get("priority"));
  if (q.get("due_on")) list = list.filter((t) => t.due_date === q.get("due_on"));
  if (q.get("due_from")) list = list.filter((t) => t.due_date && t.due_date >= q.get("due_from"));
  if (q.get("due_before")) list = list.filter((t) => t.due_date && t.due_date <= q.get("due_before"));
  if (q.get("overdue") === "true") list = list.filter((t) => t.due_date && t.due_date < today && !["completed", "cancelled"].includes(t.status));
  if (search) list = list.filter((t) => t.title.toLowerCase().includes(search) || (t.description ?? "").toLowerCase().includes(search));
  list = [...list].sort((a, b) => (a.due_date === null) - (b.due_date === null) || (a.due_date ?? "").localeCompare(b.due_date ?? "") || b.created_at.localeCompare(a.created_at));
  const out = page(list, q);
  out.items = out.items.map(shapeTask);
  return out;
});
on("POST", "/api/v1/tasks", ({ body }) => {
  required("title", body.title, "Title");
  const t = { id: uid(), title: body.title.trim(), description: body.description ?? null, priority: body.priority ?? "medium", status: "pending", list: body.list ?? "today", due_date: body.due_date ?? null, due_time: body.due_time ?? null, estimated_duration_minutes: body.estimated_duration_minutes ?? null, is_recurring_template: false, recurrence_rule: body.recurrence_rule ?? null, recurrence_template_id: null, tag_ids: body.tag_ids ?? [], completed_at: null, created_at: nowIso(), updated_at: nowIso() };
  db.tasks.push(t);
  return shapeTask(t);
});
const updateTask = ({ params, body }) => {
  const t = db.tasks.find((x) => x.id === params.id) ?? notFound("Task");
  const wasDone = t.status === "completed";
  for (const k of ["title", "description", "priority", "list", "due_date", "due_time", "estimated_duration_minutes", "recurrence_rule", "tag_ids", "status"]) if (body[k] !== undefined) t[k] = body[k];
  if (t.status === "completed" && !wasDone) { t.completed_at = nowIso(); const next = nextOccurrence(t); if (next) db.tasks.push(next); }
  if (t.status !== "completed") t.completed_at = null;
  t.updated_at = nowIso();
  return shapeTask(t);
};
on("PATCH", "/api/v1/tasks/templates/:id", updateTask);
on("PATCH", "/api/v1/tasks/:id", updateTask);
on("DELETE", "/api/v1/tasks/:id", ({ params }) => { const n = db.tasks.length; db.tasks = db.tasks.filter((t) => t.id !== params.id); if (db.tasks.length === n) notFound("Task"); });

// habits
on("GET", "/api/v1/habits", () => db.habits);
on("POST", "/api/v1/habits", ({ body }) => {
  required("name", body.name, "Name");
  const h = { id: uid(), name: body.name.trim(), description: body.description ?? null, category: body.category ?? null, icon: null, color: null, frequency_type: body.frequency_type ?? "daily", frequency_config: body.frequency_config ?? {}, target_count: body.target_count ?? 1, start_date: body.start_date ?? todayISO(), end_date: body.end_date ?? null, reminder_time: body.reminder_time ?? null, is_active: true, created_at: nowIso(), updated_at: nowIso() };
  db.habits.push(h);
  db.habitLogs[h.id] = {};
  return h;
});
on("PATCH", "/api/v1/habits/:id", ({ params, body }) => {
  const h = db.habits.find((x) => x.id === params.id) ?? notFound("Habit");
  for (const k of ["name", "description", "category", "frequency_type", "frequency_config", "target_count", "end_date", "reminder_time", "is_active"]) if (body[k] !== undefined) h[k] = body[k];
  h.updated_at = nowIso();
  return h;
});
on("DELETE", "/api/v1/habits/:id", ({ params }) => { const n = db.habits.length; db.habits = db.habits.filter((h) => h.id !== params.id); delete db.habitLogs[params.id]; if (db.habits.length === n) notFound("Habit"); });
on("PUT", "/api/v1/habits/:id/log/:date", ({ params, body }) => {
  if (!db.habits.some((h) => h.id === params.id)) notFound("Habit");
  (db.habitLogs[params.id] ??= {})[params.date] = body.status;
  return { id: uid(), habit_id: params.id, log_date: params.date, status: body.status, note: body.note ?? null };
});
on("DELETE", "/api/v1/habits/:id/log/:date", ({ params }) => { if (db.habitLogs[params.id]) delete db.habitLogs[params.id][params.date]; });
on("GET", "/api/v1/habits/:id/history", ({ params, query: q }) => {
  const days = Number(q.get("days")) || 30;
  const from = addDays(todayISO(), -days);
  return Object.entries(db.habitLogs[params.id] ?? {}).filter(([date]) => date >= from).map(([date, status]) => ({ id: `${params.id}:${date}`, habit_id: params.id, log_date: date, status, note: null })).sort((a, b) => a.log_date.localeCompare(b.log_date));
});
on("GET", "/api/v1/habits/:id/streak", ({ params }) => streaks(db.habits.find((h) => h.id === params.id) ?? notFound("Habit")));

// notes (archived notes are hidden everywhere, exactly like the real API)
on("GET", "/api/v1/notes", ({ query: q }) => {
  const search = q.get("search")?.toLowerCase();
  let list = db.notes.filter((n) => !n.is_archived);
  if (q.get("unfiled") === "true") list = list.filter((n) => !n.directory_id);
  else if (q.get("directory_id")) list = list.filter((n) => n.directory_id === q.get("directory_id"));
  if (search) list = list.filter((n) => n.title.toLowerCase().includes(search) || n.content.toLowerCase().includes(search));
  const sort = q.get("sort") ?? "updated_at";
  const dir = q.get("order") === "asc" ? 1 : -1;
  list = [...list].sort((a, b) => (b.is_pinned - a.is_pinned) || dir * String(a[sort]).localeCompare(String(b[sort])));
  const out = page(list, q);
  out.items = out.items.map(shapeNote);
  return out;
});
on("GET", "/api/v1/notes/:id", ({ params }) => shapeNote(liveNote(params.id)));
on("POST", "/api/v1/notes", ({ body }) => {
  required("title", body.title, "Title");
  if (body.directory_id && !db.dirs.some((d) => d.id === body.directory_id)) notFound("Folder");
  const n = { id: uid(), title: body.title.trim(), content: body.content ?? "", category: body.category ?? null, directory_id: body.directory_id ?? null, is_pinned: !!body.is_pinned, is_archived: false, tag_ids: body.tag_ids ?? [], created_at: nowIso(), updated_at: nowIso() };
  db.notes.push(n);
  return shapeNote(n);
});
on("PATCH", "/api/v1/notes/:id", ({ params, body }) => {
  const n = liveNote(params.id);
  for (const k of ["title", "content", "category", "is_pinned", "is_archived", "directory_id", "tag_ids"]) if (body[k] !== undefined) n[k] = body[k];
  if (body.title !== undefined && !String(n.title).trim()) fail(422, "VALIDATION_ERROR", "Invalid request data", { title: "Title is required" });
  n.updated_at = nowIso();
  return shapeNote(n);
});
on("DELETE", "/api/v1/notes/:id", ({ params }) => { liveNote(params.id); db.notes = db.notes.filter((n) => n.id !== params.id); });

// note folders
const dirShape = (d) => ({ ...d, note_count: db.notes.filter((n) => n.directory_id === d.id && !n.is_archived).length });
on("GET", "/api/v1/note-directories", () => {
  const live = db.notes.filter((n) => !n.is_archived);
  return { items: db.dirs.map(dirShape), unfiled_count: live.filter((n) => !n.directory_id).length, total_count: live.length };
});
on("POST", "/api/v1/note-directories", ({ body }) => {
  required("name", body.name, "Name");
  if (db.dirs.some((d) => d.name.toLowerCase() === body.name.trim().toLowerCase())) fail(409, "CONFLICT", "A folder with that name already exists");
  const d = { id: uid(), name: body.name.trim(), created_at: nowIso(), updated_at: nowIso() };
  db.dirs.push(d);
  return dirShape(d);
});
on("PATCH", "/api/v1/note-directories/:id", ({ params, body }) => {
  const d = db.dirs.find((x) => x.id === params.id) ?? notFound("Folder");
  required("name", body.name, "Name");
  if (db.dirs.some((x) => x.id !== d.id && x.name.toLowerCase() === body.name.trim().toLowerCase())) fail(409, "CONFLICT", "A folder with that name already exists");
  d.name = body.name.trim();
  d.updated_at = nowIso();
  return dirShape(d);
});
on("DELETE", "/api/v1/note-directories/:id", ({ params }) => {
  if (!db.dirs.some((d) => d.id === params.id)) notFound("Folder");
  db.notes = db.notes.filter((n) => n.directory_id !== params.id);
  db.dirs = db.dirs.filter((d) => d.id !== params.id);
});
on("POST", "/api/v1/note-directories/:id/notes", ({ params, body }) => {
  if (!db.dirs.some((d) => d.id === params.id)) notFound("Folder");
  let moved = 0;
  for (const n of db.notes) if (body.note_ids.includes(n.id) && !n.is_archived) { n.directory_id = params.id; moved++; }
  return { moved };
});

// health
on("GET", "/api/v1/health/metrics", ({ query: q }) => {
  let list = db.health;
  if (q.get("metric_type")) list = list.filter((m) => m.metric_type === q.get("metric_type"));
  return page([...list].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at)), q);
});
on("POST", "/api/v1/health/metrics", ({ body }) => {
  if (typeof body.value !== "number" || Number.isNaN(body.value)) fail(422, "VALIDATION_ERROR", "Invalid request data", { value: "Enter a number" });
  required("unit", body.unit, "Unit");
  const m = { id: uid(), metric_type: body.metric_type, value: body.value, unit: body.unit, recorded_at: body.recorded_at ?? nowIso(), note: body.note ?? null, created_at: nowIso() };
  db.health.push(m);
  return m;
});
on("DELETE", "/api/v1/health/metrics/:id", ({ params }) => { const n = db.health.length; db.health = db.health.filter((m) => m.id !== params.id); if (db.health.length === n) notFound("Entry"); });

// workouts
on("GET", "/api/v1/exercises", ({ query: q }) => { const s = q.get("search")?.toLowerCase(); return db.exercises.filter((e) => !s || e.name.toLowerCase().includes(s)); });
on("POST", "/api/v1/exercises", ({ body }) => {
  required("name", body.name, "Name");
  if (db.exercises.some((e) => e.name.toLowerCase() === body.name.trim().toLowerCase())) fail(409, "CONFLICT", "That exercise already exists");
  const e = { id: uid(), user_id: db.user.id, name: body.name.trim(), muscle_group: body.muscle_group ?? null, equipment: body.equipment ?? null };
  db.exercises.push(e);
  return e;
});
on("GET", "/api/v1/workout-sessions", ({ query: q }) => page([...db.workoutSessions].sort((a, b) => b.performed_at.localeCompare(a.performed_at)), q));
on("POST", "/api/v1/workout-sessions", ({ body }) => {
  const s = { id: uid(), workout_id: null, performed_at: body.performed_at ?? nowIso(), duration_minutes: body.duration_minutes ?? null, notes: body.notes ?? null, sets: (body.sets ?? []).map((x) => ({ id: uid(), exercise_id: x.exercise_id, set_number: x.set_number, reps: x.reps ?? null, weight: x.weight ?? null, weight_unit: x.weight_unit ?? null, duration_seconds: x.duration_seconds ?? null })), created_at: nowIso() };
  db.workoutSessions.push(s);
  return s;
});
on("DELETE", "/api/v1/workout-sessions/:id", ({ params }) => { const n = db.workoutSessions.length; db.workoutSessions = db.workoutSessions.filter((s) => s.id !== params.id); if (db.workoutSessions.length === n) notFound("Workout"); });

// learning
const course = (id) => db.courses.find((c) => c.id === id) ?? notFound("Course");
const lessonById = (id) => { for (const c of db.courses) for (const m of c.modules) { const l = m.lessons.find((x) => x.id === id); if (l) return l; } return notFound("Lesson"); };
on("GET", "/api/v1/learning/items", () => db.learningItems);
on("POST", "/api/v1/learning/items", ({ body }) => { required("title", body.title, "Title"); const i = { id: uid(), type: body.type, title: body.title.trim(), status: "not_started", progress_percent: 0, created_at: nowIso() }; db.learningItems.push(i); return i; });
on("PATCH", "/api/v1/learning/items/:id", ({ params, body }) => { const i = db.learningItems.find((x) => x.id === params.id) ?? notFound("Item"); for (const k of ["title", "status", "progress_percent"]) if (body[k] !== undefined) i[k] = body[k]; return i; });
on("DELETE", "/api/v1/learning/items/:id", ({ params }) => { db.learningItems = db.learningItems.filter((i) => i.id !== params.id); });
on("GET", "/api/v1/learning/courses", () => db.courses.map(shapeCourse));
on("POST", "/api/v1/learning/courses", ({ body }) => { required("title", body.title, "Title"); const c = { id: uid(), title: body.title.trim(), provider: body.provider ?? null, start_date: body.start_date ?? null, target_date: body.target_date ?? null, status: "not_started", created_at: nowIso(), modules: [] }; db.courses.push(c); return shapeCourse(c); });
on("GET", "/api/v1/learning/courses/:id", ({ params }) => { const c = course(params.id); return { ...shapeCourse(c), modules: clone(c.modules) }; });
on("PATCH", "/api/v1/learning/courses/:id", ({ params, body }) => { const c = course(params.id); for (const k of ["title", "provider", "status", "start_date", "target_date"]) if (body[k] !== undefined) c[k] = body[k]; return shapeCourse(c); });
on("DELETE", "/api/v1/learning/courses/:id", ({ params }) => { course(params.id); db.courses = db.courses.filter((c) => c.id !== params.id); });
on("POST", "/api/v1/learning/courses/:id/modules", ({ params, body }) => { const c = course(params.id); required("title", body.title, "Title"); const m = { id: uid(), title: body.title.trim(), position: c.modules.length, lessons: [] }; c.modules.push(m); return m; });
on("POST", "/api/v1/learning/modules/:id/lessons", ({ params, body }) => {
  required("title", body.title, "Title");
  for (const c of db.courses) { const m = c.modules.find((x) => x.id === params.id); if (m) { const l = { id: uid(), title: body.title.trim(), position: m.lessons.length, status: "not_started", duration_minutes: body.duration_minutes ?? null, completed_at: null }; m.lessons.push(l); return l; } }
  return notFound("Module");
});
on("PATCH", "/api/v1/learning/lessons/:id", ({ params, body }) => {
  const l = lessonById(params.id);
  if (body.title !== undefined) l.title = body.title;
  if (body.status !== undefined) { l.status = body.status; l.completed_at = body.status === "completed" ? nowIso() : null; }
  return l;
});
on("GET", "/api/v1/learning/sessions", ({ query: q }) => page([...db.learningSessions].sort((a, b) => b.session_date.localeCompare(a.session_date) || b.created_at.localeCompare(a.created_at)), q));
on("POST", "/api/v1/learning/sessions", ({ body }) => {
  if (!body.duration_minutes || body.duration_minutes < 1) fail(422, "VALIDATION_ERROR", "Invalid request data", { duration_minutes: "Enter the minutes studied" });
  const s = { id: uid(), course_id: body.course_id ?? null, learning_item_id: body.learning_item_id ?? null, topic: body.topic ?? null, duration_minutes: body.duration_minutes, session_date: body.session_date ?? todayISO(), notes: body.notes ?? null, created_at: nowIso() };
  db.learningSessions.push(s);
  return s;
});
on("DELETE", "/api/v1/learning/sessions/:id", ({ params }) => { db.learningSessions = db.learningSessions.filter((s) => s.id !== params.id); });

// goals
const goal = (id) => db.goals.find((g) => g.id === id) ?? notFound("Goal");
on("GET", "/api/v1/goals", () => db.goals.map(shapeGoal));
on("POST", "/api/v1/goals", ({ body }) => { required("title", body.title, "Title"); const g = { id: uid(), title: body.title.trim(), description: body.description ?? null, category: body.category ?? null, target_date: body.target_date ?? null, status: "not_started", progress_mode: body.progress_mode ?? "manual", progress_percent: 0, milestones: [], created_at: nowIso() }; db.goals.push(g); return shapeGoal(g); });
on("PATCH", "/api/v1/goals/milestones/:id", ({ params, body }) => {
  for (const g of db.goals) { const m = g.milestones.find((x) => x.id === params.id); if (m) { if (body.title !== undefined) m.title = body.title; if (body.is_completed !== undefined) { m.is_completed = body.is_completed; m.completed_at = body.is_completed ? nowIso() : null; } return m; } }
  return notFound("Milestone");
});
on("DELETE", "/api/v1/goals/milestones/:id", ({ params }) => { for (const g of db.goals) g.milestones = g.milestones.filter((m) => m.id !== params.id); });
on("PATCH", "/api/v1/goals/:id", ({ params, body }) => { const g = goal(params.id); for (const k of ["title", "description", "category", "target_date", "status", "progress_mode", "progress_percent"]) if (body[k] !== undefined) g[k] = body[k]; return shapeGoal(g); });
on("DELETE", "/api/v1/goals/:id", ({ params }) => { goal(params.id); db.goals = db.goals.filter((g) => g.id !== params.id); });
on("POST", "/api/v1/goals/:id/milestones", ({ params, body }) => { const g = goal(params.id); required("title", body.title, "Title"); const m = { id: uid(), title: body.title.trim(), target_date: body.target_date ?? null, is_completed: false, completed_at: null }; g.milestones.push(m); return m; });

// notifications
on("GET", "/api/v1/notifications", () => { const items = [...db.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at)); return { items, unread_count: items.filter((n) => !n.is_read).length }; });
on("POST", "/api/v1/notifications/read-all", () => { let n = 0; for (const x of db.notifications) if (!x.is_read) { x.is_read = true; n++; } return { marked_read: n }; });
on("POST", "/api/v1/notifications/:id/read", ({ params }) => { const n = db.notifications.find((x) => x.id === params.id) ?? notFound("Notification"); n.is_read = true; return n; });

// search
on("GET", "/api/v1/search", ({ query: q }) => {
  const term = (q.get("q") ?? "").toLowerCase().trim();
  const hit = (s) => (s ?? "").toLowerCase().includes(term);
  const snip = (s) => (s ? s.replace(/\s+/g, " ").slice(0, 90) : null);
  const results = {
    tasks: db.tasks.filter((t) => hit(t.title) || hit(t.description)).slice(0, 6).map((t) => ({ entity_type: "task", id: t.id, title: t.title, snippet: snip(t.description) })),
    habits: db.habits.filter((h) => hit(h.name)).slice(0, 6).map((h) => ({ entity_type: "habit", id: h.id, title: h.name, snippet: h.category })),
    notes: db.notes.filter((n) => !n.is_archived && (hit(n.title) || hit(n.content))).slice(0, 6).map((n) => ({ entity_type: "note", id: n.id, title: n.title, snippet: snip(n.content) })),
    goals: db.goals.filter((g) => hit(g.title) || hit(g.description)).slice(0, 6).map((g) => ({ entity_type: "goal", id: g.id, title: g.title, snippet: snip(g.description) })),
    learning: db.courses.filter((c) => hit(c.title)).slice(0, 6).map((c) => ({ entity_type: "course", id: c.id, title: c.title, snippet: c.provider })),
  };
  for (const k of Object.keys(results)) if (!results[k].length) delete results[k];
  return { query: q.get("q") ?? "", results, total: Object.values(results).reduce((a, b) => a + b.length, 0) };
});

// dashboard / analytics / calendar (computed)
on("GET", "/api/v1/dashboard/summary", () => {
  const today = todayISO();
  const weekStart = startOfWeek(today);
  const habitsToday = activeHabits().map((h) => ({ habit: h, is_due: scheduled(h, today), status: db.habitLogs[h.id]?.[today] ?? null }));
  const due = habitsToday.filter((x) => x.is_due);
  const todays = db.tasks.filter((t) => t.due_date === today && t.status !== "cancelled" && !t.is_recurring_template);
  const done = todays.filter((t) => t.status === "completed");
  const open = (t) => !["completed", "cancelled"].includes(t.status);
  const dueCount = due.length + todays.length;
  const completed = due.filter((x) => x.status === "completed").length + done.length;
  return {
    today,
    habits_completed_today: due.filter((x) => x.status === "completed").length, habits_due_today: due.length,
    tasks_completed_today: done.length, tasks_due_today: todays.length,
    daily_progress_percent: dueCount ? Math.floor((completed / dueCount) * 100) : 0,
    habits: habitsToday,
    tasks_today: todays.map(shapeTask),
    tasks_upcoming: db.tasks.filter((t) => t.due_date && t.due_date > today && open(t)).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5).map(shapeTask),
    tasks_overdue: db.tasks.filter((t) => t.due_date && t.due_date < today && open(t)).sort((a, b) => a.due_date.localeCompare(b.due_date)).map(shapeTask),
    recent_notes_count: db.notes.filter((n) => !n.is_archived && n.updated_at >= addDays(today, -7)).length,
    learning_minutes_this_week: db.learningSessions.filter((s) => s.session_date >= weekStart).reduce((a, s) => a + s.duration_minutes, 0),
    workout_sessions_this_week: db.workoutSessions.filter((s) => isoDate(new Date(s.performed_at)) >= weekStart).length,
    best_current_streak: Math.max(0, ...activeHabits().map((h) => streaks(h).current_streak)),
  };
});

on("GET", "/api/v1/analytics/summary", ({ query: q }) => {
  const today = todayISO();
  const period = q.get("period") === "month" ? "month" : "week";
  const start = period === "week" ? startOfWeek(today) : `${today.slice(0, 7)}-01`;
  const end = period === "week" ? addDays(start, 6) : isoDate(new Date(parseISO(start).getFullYear(), parseISO(start).getMonth() + 1, 0));
  let totalDone = 0, totalExp = 0;
  const habits = activeHabits().map((h) => {
    let completed = 0, expected = 0;
    for (let d = start; d <= end && d <= today; d = addDays(d, 1)) {
      if (!scheduled(h, d)) continue;
      const st = db.habitLogs[h.id]?.[d];
      if (st === "skipped" || st === "not_applicable") continue;
      expected++;
      if (st === "completed") completed++;
    }
    totalDone += completed; totalExp += expected;
    return { habit_id: h.id, name: h.name, completed, expected, rate_percent: expected ? Math.round((completed / expected) * 100) : 0, current_streak: streaks(h).current_streak };
  });
  const dueTasks = db.tasks.filter((t) => t.due_date && within(t.due_date, start, end) && t.status !== "cancelled");
  const doneTasks = dueTasks.filter((t) => t.status === "completed");
  const ls = db.learningSessions.filter((s) => within(s.session_date, start, end));
  const active = db.goals.filter((g) => ["in_progress", "not_started"].includes(g.status));
  return {
    period, start_date: start, end_date: end,
    habit_completion_percent: totalExp ? Math.round((totalDone / totalExp) * 100) : 0, habits,
    tasks_due: dueTasks.length, tasks_completed: doneTasks.length, task_completion_percent: dueTasks.length ? Math.round((doneTasks.length / dueTasks.length) * 100) : 0,
    learning_minutes: ls.reduce((a, s) => a + s.duration_minutes, 0), learning_sessions: ls.length,
    workout_sessions: db.workoutSessions.filter((s) => within(isoDate(new Date(s.performed_at)), start, end)).length,
    goals_active: active.length, goals_average_progress: active.length ? Math.round(active.reduce((a, g) => a + goalProgress(g), 0) / active.length) : 0,
    best_current_streak: Math.max(0, ...activeHabits().map((h) => streaks(h).current_streak)),
  };
});

on("GET", "/api/v1/calendar", ({ query: q }) => {
  const start = q.get("start"), end = q.get("end");
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const tasksDue = db.tasks.filter((t) => t.due_date === d && t.status !== "cancelled");
    const hDue = activeHabits().filter((h) => scheduled(h, d));
    days.push({
      date: d, tasks_due: tasksDue.length, tasks_completed: tasksDue.filter((t) => t.status === "completed").length,
      habits_due: hDue.length, habits_completed: hDue.filter((h) => db.habitLogs[h.id]?.[d] === "completed").length,
      workout_sessions: db.workoutSessions.filter((s) => isoDate(new Date(s.performed_at)) === d).length,
      learning_minutes: db.learningSessions.filter((s) => s.session_date === d).reduce((a, s) => a + s.duration_minutes, 0),
      milestones_due: db.goals.flatMap((g) => g.milestones).filter((m) => m.target_date === d && !m.is_completed).length,
    });
  }
  return { start_date: start, end_date: end, days };
});

/* ---------- entry point ---------- */
export async function mockRequest(path, { method = "GET", body } = {}) {
  load();
  await new Promise((r) => setTimeout(r, LATENCY_MS));
  const [pathname, qs = ""] = path.split("?");
  const query = new URLSearchParams(qs);
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = pathname.match(r.re);
    if (!m) continue;
    if (r.auth && !db.loggedIn) fail(401, "UNAUTHORIZED", "Not authenticated");
    const result = r.fn({ params: m.groups ?? {}, query, body: body ?? {} });
    if (db) save();
    return result === undefined ? undefined : clone(result);
  }
  return fail(404, "NOT_FOUND", `No demo route for ${method} ${pathname}`);
}
