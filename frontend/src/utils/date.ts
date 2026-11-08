/**
 * Returns the local-calendar ISO date string (YYYY-MM-DD) for a Date.
 *
 * Unlike `date.toISOString().slice(0, 10)`, which formats in UTC and can
 * shift the result a day forward/back for users east/west of Greenwich,
 * this uses the date's local year/month/day.
 */
export function toISODate(day: Date): string {
  const year = day.getFullYear();
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(day.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

/**
 * Compact human-readable age of a timestamp ("just now", "5m ago", "3h ago",
 * "2d ago", then a calendar date — with the year added when it differs from
 * the current one). Returns "" for unparseable input so callers can omit it.
 */
export function formatRelativeTime(isoTimestamp: string, now: Date = new Date()): string {
  const then = new Date(isoTimestamp);
  if (Number.isNaN(then.getTime())) return "";

  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString(undefined, {
    year: sameYear ? undefined : "numeric",
    month: "short",
    day: "numeric",
  });
}
