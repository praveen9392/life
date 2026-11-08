import { create } from "zustand";

export type ThemePreference = "light" | "dark" | "system";
export type ToastVariant = "info" | "success" | "error";

interface UIState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  /** Desktop sidebar collapsed to an icon-only rail (persisted). */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  /** Transient toast message (used for "coming soon" notices). */
  toast: string | null;
  toastVariant: ToastVariant;
  showToast: (message: string, variant?: ToastVariant) => void;
  clearToast: () => void;
}

const THEME_STORAGE_KEY = "life.theme";
const SIDEBAR_STORAGE_KEY = "life.sidebarCollapsed";

function readStoredTheme(): ThemePreference {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

function readStoredSidebarCollapsed(): boolean {
  const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  // No stored preference yet: start collapsed on narrow viewports, where the
  // expanded 240px rail would crowd the content. The sidebar is visible at
  // every width; only the default differs.
  return window.innerWidth < 768;
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
  sidebarCollapsed: readStoredSidebarCollapsed(),
  toggleSidebar: () =>
    set((state) => {
      const sidebarCollapsed = !state.sidebarCollapsed;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
      return { sidebarCollapsed };
    }),
  toast: null,
  toastVariant: "info",
  showToast: (message, variant = "info") => set({ toast: message, toastVariant: variant }),
  clearToast: () => set({ toast: null }),
}));

/** Convenience hook for "this feature isn't built yet" affordances. */
export function useComingSoon() {
  return useUIStore((state) => state.showToast);
}

/** Applies the theme preference to <html data-theme>, resolving "system". */
export function applyTheme(theme: ThemePreference): void {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolved;
}
