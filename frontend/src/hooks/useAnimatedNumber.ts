import { useEffect, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

/**
 * Smoothly animates a number toward `target` - used for counters and
 * progress percentages so values visibly count up instead of snapping.
 * Returns the target immediately when reduced motion is preferred.
 */
export function useAnimatedNumber(target: number, duration = 0.8): number {
  const reducedMotion = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const controls = animate(0, target, {
      duration,
      ease: "easeOut",
      onUpdate: (latest) => setValue(latest),
    });
    return () => controls.stop();
  }, [target, reducedMotion, duration]);

  return reducedMotion ? target : Math.round(value);
}
