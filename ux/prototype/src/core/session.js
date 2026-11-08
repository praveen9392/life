import { api } from "./api.js";
import { events } from "./dom.js";

export const session = { user: null };

const THEME_KEY = "life.proto.theme";

export function applyTheme(pref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themePref = pref;
}
export const storedTheme = () => localStorage.getItem(THEME_KEY) || "system";

export async function loadUser() {
  session.user = await api.me.get();
  localStorage.setItem(THEME_KEY, session.user.theme_preference);
  applyTheme(session.user.theme_preference);
  return session.user;
}

export function setUser(user) {
  session.user = user;
  localStorage.setItem(THEME_KEY, user.theme_preference);
  applyTheme(user.theme_preference);
  events.emit("user", user);
}

/** Persists the theme to the profile (UX-011) and applies it immediately. */
export async function setTheme(pref) {
  applyTheme(pref);
  localStorage.setItem(THEME_KEY, pref);
  const user = await api.me.update({ theme_preference: pref });
  session.user = user;
  events.emit("user", user);
}

export function toggleTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  return setTheme(dark ? "light" : "dark");
}

export function clearSession() {
  session.user = null;
}
