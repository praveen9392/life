import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AppRouter } from "./app/router/AppRouter";
import { ThemeProvider } from "./app/providers/ThemeProvider";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Global defaults per the performance strategy: no aggressive
      // refetching, bounded retries, stale-while-revalidate feel.
      staleTime: 30 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {/* reducedMotion="user" respects the OS prefers-reduced-motion
            setting across every framer-motion animation in the app. */}
        <MotionConfig reducedMotion="user">
          <AppRouter />
        </MotionConfig>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
