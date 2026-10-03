import { useEffect } from "react";

import { applyTheme, useUIStore } from "../../stores/uiStore";

/** Applies the persisted theme preference (light/dark/system) to the
 * document and keeps it in sync with OS-level changes while on "system". */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((state) => state.theme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyTheme("system");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [theme]);

  return <>{children}</>;
}
