import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Sparkles } from "lucide-react";

import { useUIStore, type ToastVariant } from "../../stores/uiStore";
import { cn } from "../../utils/cn";

const TOAST_DURATION_MS = 2600;

const VARIANT_STYLES: Record<ToastVariant, { icon: typeof Sparkles; border: string; iconTone: string }> = {
  info: { icon: Sparkles, border: "border-accent/30", iconTone: "text-accent" },
  success: { icon: CheckCircle2, border: "border-success/40", iconTone: "text-success-text" },
  error: { icon: AlertCircle, border: "border-danger/40", iconTone: "text-danger" },
};

/** Global transient toast, rendered once inside AppShell. */
export function Toast() {
  const message = useUIStore((state) => state.toast);
  const variant = useUIStore((state) => state.toastVariant);
  const clearToast = useUIStore((state) => state.clearToast);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(clearToast, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [message, clearToast]);

  const { icon: Icon, border, iconTone } = VARIANT_STYLES[variant];
  const isError = variant === "error";

  return (
    <AnimatePresence>
      {message ? (
        <motion.div
          key={`${variant}:${message}`}
          role={isError ? "alert" : "status"}
          aria-live={isError ? "assertive" : "polite"}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={cn(
            "fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full border bg-surface px-4 py-2.5 text-sm font-medium text-text shadow-xl md:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]",
            border,
          )}
        >
          <Icon className={cn("h-4 w-4 shrink-0", iconTone)} aria-hidden />
          {message}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
