export const NOTIFICATION_LABELS = {
  task_due_soon: "Tasks due soon",
  habit_reminder: "Habit reminders",
  learning_reminder: "Learning reminders",
  workout_reminder: "Workout reminders",
  goal_deadline_approaching: "Goal deadlines approaching",
};

export function timezones(current) {
  let list = [];
  try { list = Intl.supportedValuesOf("timeZone"); } catch { list = ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"]; }
  if (!list.includes("UTC")) list = ["UTC", ...list];
  return [...new Set([current, ...list].filter(Boolean))];
}

export const guessTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
