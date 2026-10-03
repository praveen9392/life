import { Moon, Sun } from "lucide-react";

import { useUIStore } from "../../stores/uiStore";
import { cn } from "../../utils/cn";

/** Light/dark toggle. "System" is honored at startup and via the OS
 * listener in ThemeProvider; this control switches between light and dark
 * explicitly (the full three-way preference lives in Profile/Onboarding). */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text",
        className,
      )}
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
    </button>
  );
}
