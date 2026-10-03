import { motion } from "framer-motion";

/**
 * Ambient background: soft blurred color washes + a barely-visible dot grid,
 * themed via CSS custom properties so light and dark modes both look
 * intentional. Purely decorative - pointer-events:none, aria-hidden, and
 * every animated element is a GPU-friendly transform under
 * `MotionConfig reducedMotion="user"`.
 *
 * Performance notes: three fixed blurred blobs + one static pattern. The
 * float animations are slow `transform` translations only - no layout,
 * no paint thrash. On mobile (<768px) the third blob and grid are dropped
 * and opacities are halved.
 */
export function AmbientBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {/* Dot grid - very light, static */}
      <div
        className="absolute inset-0 hidden opacity-[0.4] md:block"
        style={{
          backgroundImage:
            "radial-gradient(rgb(var(--ambient-primary) / var(--ambient-opacity)) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Primary wash - top left */}
      <motion.div
        className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full blur-3xl md:h-[42rem] md:w-[42rem]"
        style={{
          background:
            "radial-gradient(circle, rgb(var(--ambient-primary) / var(--ambient-opacity-strong)), transparent 70%)",
        }}
        animate={{ x: [0, 30, 0], y: [0, 18, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Secondary wash - bottom right, warm */}
      <motion.div
        className="absolute -bottom-48 -right-40 h-[30rem] w-[30rem] rounded-full blur-3xl opacity-60 md:h-[38rem] md:w-[38rem] md:opacity-100"
        style={{
          background:
            "radial-gradient(circle, rgb(var(--ambient-secondary) / var(--ambient-opacity)), transparent 70%)",
        }}
        animate={{ x: [0, -24, 0], y: [0, -14, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Tertiary accent - center, desktop only, very subtle */}
      <motion.div
        className="absolute left-1/2 top-1/3 hidden h-[28rem] w-[28rem] -translate-x-1/2 rounded-full blur-3xl md:block"
        style={{
          background:
            "radial-gradient(circle, rgb(var(--ambient-tertiary) / var(--ambient-opacity)), transparent 70%)",
        }}
        animate={{ x: [0, 16, 0] }}
        transition={{ duration: 36, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
