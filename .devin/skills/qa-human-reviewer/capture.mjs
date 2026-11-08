// Template for the qa-human-reviewer skill. Copy to frontend/.audit/capture.mjs and run with node.
// Env: OUT_DIR (output folder), SKIP_SEED=1 (reuse existing data), AUDIT_EMAIL, APP_URL, API_URL, ROUTES (comma list).
import { chromium } from "@playwright/test";
import fs from "node:fs";

const APP = process.env.APP_URL ?? "http://localhost:5174";
const API = process.env.API_URL ?? "http://localhost:8001";
const OUT = process.env.OUT_DIR ?? "audit-screens/before";
const SKIP_SEED = process.env.SKIP_SEED === "1";
const EMAIL = process.env.AUDIT_EMAIL ?? "audit.user@example.com";
const PASSWORD = "AuditPassw0rd!x";
const VIEWPORTS = [
  { name: "320", width: 320, height: 640 },
  { name: "414", width: 414, height: 800 },
  { name: "820", width: 820, height: 1100 },
  { name: "1366", width: 1366, height: 800 },
  { name: "1800", width: 1800, height: 1000 },
];
const ROUTES = (process.env.ROUTES ??
  "/app,/app/tasks,/app/habits,/app/notes,/app/health,/app/workouts,/app/learning,/app/goals,/app/calendar,/app/analytics,/app/profile,/onboarding").split(",");

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
const page = await ctx.newPage();
const consoleErrors = [];
const failedRequests = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(`${page.url()} :: ${m.text()}`));
page.on("response", (r) => r.status() >= 400 && failedRequests.push(`${r.status()} ${r.request().method()} ${r.url()}`));

async function api(method, path, body) {
  const cookies = await ctx.cookies(API);
  const csrf = cookies.find((c) => c.name === "csrf_token")?.value;
  const res = await ctx.request.fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}), Origin: APP },
    data: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok() && !(path.includes("register") && res.status() === 409)) console.log("API FAIL", method, path, res.status(), text.slice(0, 200));
  return text ? JSON.parse(text) : null;
}

const reg = await api("POST", "/api/v1/auth/register", { email: EMAIL, password: PASSWORD, full_name: "Audit User" });
await api("POST", "/api/v1/auth/login", { email: EMAIL, password: PASSWORD });

if (!SKIP_SEED && reg?.user) {
  const mk = (name, extra = {}) => api("POST", "/api/v1/habits", { name, start_date: iso(daysAgo(30)), category: "health", ...extra });
  const read = await mk("Read 20 pages");
  const gym = await mk("Gym", { frequency_type: "weekly", frequency_config: { weekdays: [0, 2, 4] }, target_count: 1 });
  const fresh = await mk("Meditate", { start_date: iso(new Date()) });
  const skipper = await mk("Cold plunge");
  const longName = await mk("An extremely long habit name that should truncate gracefully in charts and lists on narrow screens");
  const log = (h, n, status) => api("PUT", `/api/v1/habits/${h.id}/log/${iso(daysAgo(n))}`, { status });
  for (let n = 1; n <= 20; n++) await log(read, n, n % 4 === 0 ? "missed" : "completed");
  for (let n = 0; n <= 6; n++) await log(read, n, "completed");
  for (let n = 1; n <= 14; n++) await log(gym, n, "completed");
  for (let n = 1; n <= 10; n++) await log(skipper, n, "skipped");
  for (let n = 1; n <= 5; n++) await log(longName, n, "completed");
  await log(fresh, 0, "completed");
  const t = (title, due) => api("POST", "/api/v1/tasks", { title, due_date: iso(daysAgo(due)), list: "today" });
  const t1 = await t("Ship report", 0); await t("Email team", 0); await t("Overdue thing", 3);
  const t4 = await t("Done earlier", 1);
  for (const x of [t1, t4]) if (x) await api("PATCH", `/api/v1/tasks/${x.id}`, { status: "completed" });
}

for (const [file, path] of [
  ["api-analytics-week.json", "/api/v1/analytics/summary?period=week"],
  ["api-analytics-month.json", "/api/v1/analytics/summary?period=month"],
  ["api-dashboard.json", "/api/v1/dashboard/summary"],
]) fs.writeFileSync(`${OUT}/${file}`, JSON.stringify(await api("GET", path), null, 2));

const report = [];
for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  for (const route of ROUTES) {
    consoleErrors.length = 0;
    await page.goto(APP + route, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1200);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    await page.screenshot({ path: `${OUT}/${route.replace(/\//g, "_")}__${vp.name}.png`, fullPage: true });
    report.push({ route, vp: vp.name, overflow: o.sw > o.cw + 1 ? `OVERFLOW ${o.sw}>${o.cw}` : "ok", url: page.url().replace(APP, ""), consoleErrors: [...consoleErrors] });
  }
}
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ report, failedRequests }, null, 2));
console.log(JSON.stringify(report.filter((r) => r.overflow !== "ok" || r.consoleErrors.length || r.url !== r.route), null, 1));
console.log("failed requests:", failedRequests.slice(0, 20));
await browser.close();
