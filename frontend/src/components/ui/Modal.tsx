import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "../../utils/cn";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/** Accessible dialog built on Radix (focus trap, ESC, aria wiring for free),
 * styled with our design tokens. Becomes a full-screen sheet on mobile. */
export function Modal({ open, onOpenChange, title, description, children, className }: ModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            // scrollbar-gutter: stable reserves the scroll track so it can't
            // toggle on/off around the 90vh threshold - a toggling scrollbar
            // changes content width, reflows wrapping text, and oscillates
            // layout (observed as un-clickable buttons in mobile E2E).
            "fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto [scrollbar-gutter:stable] rounded-t-card border border-border bg-surface p-6 shadow-xl",
            "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-card",
            // Mobile: bottom-sheet slide-up; desktop: centered zoom-in.
            "data-[state=open]:animate-sheet-in md:data-[state=open]:animate-modal-in",
            className,
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold text-text">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-text-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
