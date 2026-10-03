import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, NavLink, useLocation, useOutlet } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Calendar,
  CheckSquare,
  Dumbbell,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MoreHorizontal,
  Notebook,
  Repeat2,
  Settings,
  Target,
} from "lucide-react";

import { useLogout } from "../../features/auth/hooks";
import { useCurrentUser } from "../../features/auth/hooks";
import { NotificationBell } from "../../features/notifications/NotificationBell";
import { GlobalSearch } from "../../features/search/GlobalSearch";
import { Modal } from "../ui/Modal";
import { ThemeToggle } from "../ui/ThemeToggle";
import { AmbientBackground } from "./AmbientBackground";
import { cn } from "../../utils/cn";

const NAV_ITEMS = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/app/habits", label: "Habits", icon: Repeat2 },
  { to: "/app/notes", label: "Notes", icon: Notebook },
  { to: "/app/health", label: "Health", icon: HeartPulse },
  { to: "/app/workouts", label: "Workouts", icon: Dumbbell },
  { to: "/app/learning", label: "Learning", icon: BookOpen },
  { to: "/app/goals", label: "Goals", icon: Target },
  { to: "/app/calendar", label: "Calendar", icon: Calendar },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3 },
];

// The 4 highest-frequency sections get a dedicated bottom tab; everything
// else (full desktop-sidebar parity) lives behind the "More" sheet so no
// feature is ever more than two taps away on mobile.
const MOBILE_TABS = [
  { to: "/app", label: "Home", icon: LayoutDashboard },
  { to: "/app/tasks", label: "Tasks", icon: ListChecks },
  { to: "/app/habits", label: "Habits", icon: Repeat2 },
  { to: "/app/learning", label: "Learn", icon: BookOpen },
];

const MORE_ITEMS = [
  { to: "/app/notes", label: "Notes", icon: Notebook },
  { to: "/app/health", label: "Health", icon: HeartPulse },
  { to: "/app/workouts", label: "Workouts", icon: Dumbbell },
  { to: "/app/goals", label: "Goals", icon: Target },
  { to: "/app/calendar", label: "Calendar", icon: Calendar },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/app/profile", label: "Profile & settings", icon: Settings },
];

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    isActive ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-surface-hover hover:text-text",
  );
}

/** Application shell: desktop = sidebar + header + content; mobile =
 * compact header + bottom tab bar + content (per the responsive strategy). */
export function AppShell() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const location = useLocation();
  const outlet = useOutlet();
  const [moreOpen, setMoreOpen] = useState(false);
  const isMoreActive = MORE_ITEMS.some((item) => location.pathname.startsWith(item.to));

  return (
    <div className="relative flex min-h-screen bg-bg">
      <AmbientBackground />
      {/* Skip link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-contrast"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface p-4 md:flex">
        <div className="mb-6 px-2 text-lg font-semibold text-text">Life</div>
        <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/app"} className={navLinkClass}>
              <item.icon className="h-4 w-4" aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 border-t border-border pt-4">
          <NavLink to="/app/profile" className={navLinkClass}>
            <Settings className="h-4 w-4" aria-hidden />
            Profile
          </NavLink>
        </div>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/80 px-3 backdrop-blur sm:px-4">
          <div className="shrink-0 font-semibold text-text md:hidden">Life</div>
          <div className="hidden md:block">
            <GlobalSearch />
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {/* Icon-only on mobile that expands into a full-width overlay
                instead of a fixed-width input - the fixed input was the
                root cause of the 390px overflow bug. */}
            <div className="md:hidden">
              <GlobalSearch compact />
            </div>
            <NotificationBell />
            <ThemeToggle />
            <button
              type="button"
              onClick={() => logout.mutate()}
              className="hidden rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-surface-hover hover:text-text md:inline-block"
            >
              Log out
            </button>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-contrast">
              {user?.full_name?.[0]?.toUpperCase() ?? user?.email[0].toUpperCase() ?? "U"}
            </div>
          </div>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:pb-6">
          {/* Route-level fade+slide transition; respects reduced-motion via
              MotionConfig in main.tsx. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-border bg-surface md:hidden"
      >
        {MOBILE_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === "/app"}
            className={({ isActive }) =>
              cn(
                "flex min-w-[64px] flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-xs",
                isActive ? "text-accent" : "text-text-muted",
              )
            }
          >
            <tab.icon className="h-5 w-5" aria-hidden />
            {tab.label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn(
            "flex min-w-[64px] flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-xs",
            isMoreActive ? "text-accent" : "text-text-muted",
          )}
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
          More
        </button>
      </nav>

      {/* "More" sheet - full desktop-sidebar parity on mobile, since the
          bottom tab bar only has room for 4 dedicated destinations. */}
      <Modal open={moreOpen} onOpenChange={setMoreOpen} title="More">
        <nav aria-label="More sections" className="grid grid-cols-2 gap-2">
          {MORE_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMoreOpen(false)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border border-border px-3 py-4 text-sm font-medium transition-colors",
                location.pathname.startsWith(item.to)
                  ? "border-accent bg-accent/10 text-accent"
                  : "text-text hover:bg-surface-hover",
              )}
            >
              <item.icon className="h-5 w-5" aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => {
            setMoreOpen(false);
            logout.mutate();
          }}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-danger hover:bg-surface-hover"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Log out
        </button>
      </Modal>
    </div>
  );
}
