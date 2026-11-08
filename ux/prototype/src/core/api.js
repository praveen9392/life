/**
 * API client for the existing Life REST contract (cookies + X-CSRF-Token, `{error:{...}}` envelope).
 * Redesign fix (UX-001): a 401 triggers one single-flight `POST /auth/refresh` and a retry before
 * the user is sent to /login. Contract is unchanged.
 */
import { ApiError } from "./errors.js";
import { mockRequest } from "./mock.js";

export { ApiError };

const safeStorage = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  remove: (k) => { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

const params = new URLSearchParams(location.search);
if (params.get("api")) { safeStorage.set("life.proto.api", params.get("api")); safeStorage.remove("life.proto.mode"); }
if (params.get("demo") === "1") safeStorage.set("life.proto.mode", "demo");
if (params.get("demo") === "0") safeStorage.remove("life.proto.mode");
/** Demo mode: no backend at all - a built-in mock API with sample data. Always on when opened as a file. */
export const DEMO_MODE = location.protocol === "file:" || safeStorage.get("life.proto.mode") === "demo";
export const API_BASE = (safeStorage.get("life.proto.api") || "http://localhost:8000").replace(/\/$/, "");

let onSessionLost = () => {};
export const setSessionLostHandler = (fn) => { onSessionLost = fn; };

const cookie = (name) => {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
};

let refreshing = null;
function refreshSession() {
  refreshing ??= fetch(`${API_BASE}/api/v1/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-Token": cookie("csrf_token") ?? "" },
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

export async function request(path, { method = "GET", body, signal, retry = true } = {}) {
  if (DEMO_MODE) {
    try { return await mockRequest(path, { method, body }); } catch (err) {
      if (err instanceof ApiError && err.status === 401 && !path.includes("/auth/")) onSessionLost();
      throw err;
    }
  }
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    const csrf = cookie("csrf_token");
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, credentials: "include", signal, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the server. Check that the API is running and allows this origin.");
  }
  if (res.status === 401 && retry && !path.includes("/auth/")) {
    if (await refreshSession()) return request(path, { method, body, signal, retry: false });
    onSessionLost();
  }
  if (res.status === 204) return undefined;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? "UNKNOWN_ERROR", e?.message ?? "Something went wrong. Please try again.", e?.fields);
  }
  return data;
}

const get = (p, signal) => request(p, { signal });
const post = (p, body) => request(p, { method: "POST", body });
const patch = (p, body) => request(p, { method: "PATCH", body });
const put = (p, body) => request(p, { method: "PUT", body });
const del = (p, body) => request(p, { method: "DELETE", body });
const qs = (o) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "" && v !== false) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
};

export const api = {
  auth: {
    register: (b) => post("/api/v1/auth/register", b),
    login: (b) => post("/api/v1/auth/login", b),
    logout: () => post("/api/v1/auth/logout"),
    logoutAll: () => post("/api/v1/auth/logout-all"),
  },
  me: {
    get: () => get("/api/v1/users/me"),
    update: (b) => patch("/api/v1/users/me", b),
    onboard: () => post("/api/v1/users/me/onboarding"),
    password: (b) => post("/api/v1/users/me/password", b),
    sessions: () => get("/api/v1/users/me/sessions"),
    revoke: (id) => del(`/api/v1/users/me/sessions/${id}`),
    export: () => get("/api/v1/privacy/export"),
    deleteAccount: (b) => del("/api/v1/privacy/account", b),
  },
  dashboard: () => get("/api/v1/dashboard/summary"),
  analytics: (period) => get(`/api/v1/analytics/summary?period=${period}`),
  calendar: (start, end) => get(`/api/v1/calendar?start=${start}&end=${end}`),
  search: (q, signal) => get(`/api/v1/search?q=${encodeURIComponent(q)}`, signal),
  notifications: {
    list: () => get("/api/v1/notifications"),
    read: (id) => post(`/api/v1/notifications/${id}/read`),
    readAll: () => post("/api/v1/notifications/read-all"),
  },
  tags: { list: () => get("/api/v1/tags"), create: (name) => post("/api/v1/tags", { name }) },
  tasks: {
    list: (p = {}) => get(`/api/v1/tasks${qs(p)}`),
    create: (b) => post("/api/v1/tasks", b),
    update: (id, b) => patch(`/api/v1/tasks/${id}`, b),
    updateTemplate: (id, b) => patch(`/api/v1/tasks/templates/${id}`, b),
    remove: (id) => del(`/api/v1/tasks/${id}`),
  },
  habits: {
    list: () => get("/api/v1/habits"),
    create: (b) => post("/api/v1/habits", b),
    update: (id, b) => patch(`/api/v1/habits/${id}`, b),
    remove: (id) => del(`/api/v1/habits/${id}`),
    log: (id, date, status, note) => put(`/api/v1/habits/${id}/log/${date}`, { status, note }),
    unlog: (id, date) => del(`/api/v1/habits/${id}/log/${date}`),
    history: (id, days = 30) => get(`/api/v1/habits/${id}/history?days=${days}`),
    streak: (id) => get(`/api/v1/habits/${id}/streak`),
  },
  notes: {
    list: (p = {}) => get(`/api/v1/notes${qs({ page_size: 100, ...p })}`),
    get: (id) => get(`/api/v1/notes/${id}`),
    create: (b) => post("/api/v1/notes", b),
    update: (id, b) => patch(`/api/v1/notes/${id}`, b),
    remove: (id) => del(`/api/v1/notes/${id}`),
  },
  folders: {
    list: () => get("/api/v1/note-directories"),
    create: (name) => post("/api/v1/note-directories", { name }),
    rename: (id, name) => patch(`/api/v1/note-directories/${id}`, { name }),
    remove: (id) => del(`/api/v1/note-directories/${id}`),
    move: (id, note_ids) => post(`/api/v1/note-directories/${id}/notes`, { note_ids }),
  },
  health: {
    list: (type) => get(`/api/v1/health/metrics${qs({ page_size: 100, metric_type: type })}`),
    create: (b) => post("/api/v1/health/metrics", b),
    remove: (id) => del(`/api/v1/health/metrics/${id}`),
  },
  workouts: {
    exercises: (search) => get(`/api/v1/exercises${qs({ search })}`),
    createExercise: (b) => post("/api/v1/exercises", b),
    sessions: () => get("/api/v1/workout-sessions?page_size=100"),
    createSession: (b) => post("/api/v1/workout-sessions", b),
    removeSession: (id) => del(`/api/v1/workout-sessions/${id}`),
  },
  learning: {
    items: () => get("/api/v1/learning/items"),
    createItem: (b) => post("/api/v1/learning/items", b),
    updateItem: (id, b) => patch(`/api/v1/learning/items/${id}`, b),
    removeItem: (id) => del(`/api/v1/learning/items/${id}`),
    courses: () => get("/api/v1/learning/courses"),
    course: (id) => get(`/api/v1/learning/courses/${id}`),
    createCourse: (b) => post("/api/v1/learning/courses", b),
    updateCourse: (id, b) => patch(`/api/v1/learning/courses/${id}`, b),
    removeCourse: (id) => del(`/api/v1/learning/courses/${id}`),
    addModule: (courseId, title) => post(`/api/v1/learning/courses/${courseId}/modules`, { title }),
    addLesson: (moduleId, title) => post(`/api/v1/learning/modules/${moduleId}/lessons`, { title }),
    updateLesson: (id, b) => patch(`/api/v1/learning/lessons/${id}`, b),
    sessions: () => get("/api/v1/learning/sessions?page_size=50"),
    logSession: (b) => post("/api/v1/learning/sessions", b),
    removeSession: (id) => del(`/api/v1/learning/sessions/${id}`),
  },
  goals: {
    list: () => get("/api/v1/goals"),
    create: (b) => post("/api/v1/goals", b),
    update: (id, b) => patch(`/api/v1/goals/${id}`, b),
    remove: (id) => del(`/api/v1/goals/${id}`),
    addMilestone: (id, title) => post(`/api/v1/goals/${id}/milestones`, { title }),
    updateMilestone: (id, b) => patch(`/api/v1/goals/milestones/${id}`, b),
    removeMilestone: (id) => del(`/api/v1/goals/milestones/${id}`),
  },
};
