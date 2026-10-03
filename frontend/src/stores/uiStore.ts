import { create } from "zustand";

export type ThemePreference = "light" | "dark" | "system";

interface UIState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

const THEME_STORAGE_KEY = "life.theme";

function readStoredTheme(): ThemePreference {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

/**
 * UI state only (theme, sidebar) - server state lives exclusively in
 * TanStack Query (see ARCHITECTURE.md "Frontend State Architecture").
 */
export const useUIStore = create<UIState>((set) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    set({ theme });
  },
}));

/** Applies the theme preference to <html data-theme>, resolving "system". */
export function applyTheme(theme: ThemePreference): void {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolved;
}
