const pad = (n) => String(n).padStart(2, "0");

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const todayISO = () => isoDate(new Date());

/** Parse YYYY-MM-DD as a local date (avoids the UTC off-by-one of `new Date(str)`). */
export function parseISO(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
export function diffDays(aIso, bIso) {
  return Math.round((parseISO(aIso) - parseISO(bIso)) / 86400000);
}
/** Monday of the week containing `iso`. */
export function startOfWeek(iso) {
  const d = parseISO(iso);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return isoDate(d);
}

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const DAYMONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const LONG = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

/** One date style everywhere: Today / Tomorrow / Yesterday / Sat 28 Nov / 28 Nov 2027. */
export function fmtDate(iso) {
  if (!iso) return "";
  const delta = diffDays(iso, todayISO());
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta === -1) return "Yesterday";
  const d = parseISO(iso);
  if (Math.abs(delta) < 7) return `${WEEKDAY.format(d)} ${DAYMONTH.format(d)}`;
  if (d.getFullYear() === new Date().getFullYear()) return `${WEEKDAY.format(d)} ${DAYMONTH.format(d)}`;
  return `${DAYMONTH.format(d)} ${d.getFullYear()}`;
}
export const fmtLongDate = (iso) => LONG.format(parseISO(iso));
export const fmtMonth = (iso) => MONTH.format(parseISO(iso));
export const fmtDayMonth = (iso) => DAYMONTH.format(parseISO(iso));
export const weekdayShort = (iso) => WEEKDAY.format(parseISO(iso));

export function fmtTime(hhmmss) {
  if (!hhmmss) return "";
  const [h, m] = hhmmss.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function relTime(isoTs) {
  const diff = (Date.now() - new Date(isoTs).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return fmtDate(isoDate(new Date(isoTs)));
}

export function fmtDateTime(isoTs) {
  const d = new Date(isoTs);
  return `${fmtDate(isoDate(d))}, ${d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })}`;
}

export function fmtDuration(min) {
  if (min == null) return "";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Mozilla/5.0 (Windows NT 10.0 ...) Chrome/123" -> "Chrome on Windows". */
export function parseUA(ua) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /python|curl|node|HeadlessChrome/i.test(ua) ? "Script" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Percent that is never NaN/Infinity/>100; null when nothing was expected. */
export function pct(done, total) {
  if (!total || total <= 0) return null;
  return Math.min(100, Math.round((done / total) * 100));
}
