import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, NavLink, useLocation, useOutlet } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Calendar,
  CheckSquare,
  ChevronsLeft,
  ChevronsRight,
  Dumbbell,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MoreHorizontal,
  Notebook,
  Plus,
  Repeat2,
  Settings,
  Target,
  Zap,
} from "lucide-react";

import { useLogout, useCurrentUser } from "../../features/auth/hooks";
import { useDashboardSummary } from "../../features/dashboard/hooks";
import { useTasks } from "../../features/tasks/hooks";
import { NotificationBell } from "../../features/notifications/NotificationBell";
import { GlobalSearch } from "../../features/search/GlobalSearch";
import { useMenuKeyboard } from "../../hooks/useMenuKeyboard";
import { useUIStore } from "../../stores/uiStore";
import { Modal } from "../ui/Modal";
import { ThemeToggle } from "../ui/ThemeToggle";
import { AmbientBackground } from "./AmbientBackground";
import { Toast } from "./Toast";
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
  { to: "/app", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/tasks", label: "Tasks", icon: ListChecks },
  { to: "/app/habits", label: "Habits", icon: Repeat2 },
  { to: "/app/learning", label: "Learning", icon: BookOpen },
];

const MORE_ITEMS = [
  { to: "/app/notes", label: "Notes", icon: Notebook },
  { to: "/app/health", label: "Health", icon: HeartPulse },
  { to: "/app/workouts", label: "Workouts", icon: Dumbbell },
  { to: "/app/goals", label: "Goals", icon: Target },
  { to: "/app/calendar", label: "Calendar", icon: Calendar },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/app/profile", label: "Profile", icon: Settings },
];

/** Optional right-side badge for a nav item (count / streak). */
type NavBadge = { label: string; className: string } | null;

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    // `relative` hosts the active indicator bar via the `after:` pseudo element.
    "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    isActive
      ? "bg-accent/10 text-accent after:absolute after:right-0 after:top-1/2 after:h-5 after:w-1 after:-translate-y-1/2 after:rounded-full after:bg-accent"
      : "text-text-muted hover:bg-surface-hover hover:text-text",
  );
}

/** Icon-only variant used while the sidebar is collapsed: centered icon,
 * same active indicator, accessible name supplied by aria-label/title. */
function collapsedNavLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "relative flex items-center justify-center rounded-lg p-2 text-sm transition-colors",
    isActive
      ? "bg-accent/10 text-accent after:absolute after:right-0 after:top-1/2 after:h-5 after:w-1 after:-translate-y-1/2 after:rounded-full after:bg-accent"
      : "text-text-muted hover:bg-surface-hover hover:text-text",
  );
}

/** Avatar + name button that opens a dropdown with the account summary and
 * the Log out action - the logout affordance lives inside the user menu
 * instead of cluttering the header as a separate button. */
function UserMenu() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const { open, setOpen, close, containerRef, triggerRef, menuRef, onMenuKeyDown } = useMenuKeyboard();

  const initial = user?.full_name?.[0]?.toUpperCase() ?? user?.email[0].toUpperCase() ?? "U";

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={cn(
          "flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition-colors hover:bg-surface-hover",
          open && "bg-surface-hover",
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-contrast">
          {initial}
        </span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block max-w-[120px] truncate text-xs font-semibold text-text">
            {user?.full_name?.split(" ")[0] ?? "You"}
          </span>
          <span className="block max-w-[140px] truncate text-[10px] text-text-muted">
            {user?.email}
          </span>
        </span>
      </button>
      {open ? (
        <div
          ref={menuRef}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-11 z-40 w-56 origin-top-right rounded-card border border-border bg-surface p-2 shadow-xl animate-scale-in focus:outline-none"
        >
          <div className="border-b border-border px-2 pb-2 pt-1">
            <p className="truncate text-sm font-semibold text-text">{user?.full_name ?? "You"}</p>
            <p className="truncate text-xs text-text-muted">{user?.email}</p>
          </div>
          <div role="menu" aria-label="Account">
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              close();
              logout.mutate();
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-danger transition-colors hover:bg-surface-hover focus:bg-surface-hover focus:outline-none"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Log out
          </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Application shell: desktop = sidebar + header + content; mobile =
 * compact header + bottom tab bar + content (per the responsive strategy). */
export function AppShell() {
  const logout = useLogout();
  const location = useLocation();
  const outlet = useOutlet();
  const [moreOpen, setMoreOpen] = useState(false);
  const isMoreActive = MORE_ITEMS.some((item) => location.pathname.startsWith(item.to));
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);

  // Lightweight badge data for the sidebar. The pending-task count comes from
  // the paginated tasks endpoint (total field), the habit streak badge from
  // the aggregated dashboard summary - both cached and shared with the pages,
  // so this adds no extra backend endpoints.
  const pendingTasksQuery = useTasks({ status: "pending", page_size: 1 });
  const summaryQuery = useDashboardSummary();
  const tasksBadge: NavBadge =
    pendingTasksQuery.data && pendingTasksQuery.data.total > 0
      ? { label: String(pendingTasksQuery.data.total), className: "bg-surface-hover text-text-muted" }
      : null;
  const bestStreak = summaryQuery.data?.best_current_streak ?? 0;
  const habitsBadge: NavBadge =
    bestStreak > 0
      ? { label: `${bestStreak}d`, className: "bg-warning/10 text-warning-text" }
      : null;

  const badgesByPath: Record<string, NavBadge> = {
    "/app/tasks": tasksBadge,
    "/app/habits": habitsBadge,
  };

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

      {/* Desktop sidebar - visible at every width (collapsed icon rail on
          narrow viewports by default), collapsible via the footer chevron. */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen md:flex shrink-0 flex-col border-r border-border bg-surface p-4 transition-[width] duration-200",
          sidebarCollapsed ? "w-[68px]" : "w-60",
        )}
      >
        {/* Logo + collapse toggle (top) */}
        <div className={cn("mb-6", sidebarCollapsed ? "px-0" : "px-2")}>
          <div
            className={cn(
              "flex items-center",
              sidebarCollapsed ? "flex-col gap-2" : "justify-between gap-2",
            )}
          >
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-contrast">
                <Zap className="h-4 w-4" aria-hidden />
              </div>
              {!sidebarCollapsed ? <span className="text-lg font-semibold text-text">Life</span> : null}
            </div>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={sidebarCollapsed}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
            >
              {sidebarCollapsed ? (
                <ChevronsRight className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronsLeft className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
          {!sidebarCollapsed ? (
            <p className="mt-1 pl-9 text-[11px] text-text-muted">Master Workspace</p>
          ) : null}
        </div>

        {/* Main navigation */}
        <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const badge = badgesByPath[item.to];
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/app"}
                className={sidebarCollapsed ? collapsedNavLinkClass : navLinkClass}
                title={sidebarCollapsed ? item.label : undefined}
                aria-label={sidebarCollapsed ? item.label : undefined}
              >
                <span className="relative">
                  <item.icon className="h-4 w-4" aria-hidden />
                  {sidebarCollapsed && badge ? (
                    <span
                      className={cn(
                        "absolute -right-3 -top-2 rounded-full border border-bg px-1 py-0.5 text-[9px] font-semibold leading-none",
                        badge.className,
                      )}
                    >
                      {badge.label}
                    </span>
                  ) : null}
                </span>
                {!sidebarCollapsed ? (
                  <>
                    <span className="truncate">{item.label}</span>
                    {badge ? (
                      <span
                        className={cn(
                          "ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none",
                          badge.className,
                        )}
                      >
                        {badge.label}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer nav */}
        <div className="mt-4 border-t border-border pt-4">
          <NavLink
            to="/app/profile"
            className={sidebarCollapsed ? collapsedNavLinkClass : navLinkClass}
            title={sidebarCollapsed ? "Profile" : undefined}
            aria-label={sidebarCollapsed ? "Profile" : undefined}
          >
            <Settings className="h-4 w-4" aria-hidden />
            {!sidebarCollapsed ? <span className="truncate">Profile</span> : null}
          </NavLink>
        </div>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* Header: logo | centered search | actions */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/80 px-3 backdrop-blur sm:px-4">
          <div className="flex shrink-0 items-center gap-1.5 md:hidden">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-accent-contrast">
              <Zap className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="font-semibold text-text">Life</span>
          </div>
          <div className="hidden min-w-0 flex-1 justify-center md:flex">
            <GlobalSearch />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            {/* Icon-only on mobile that expands into a full-width overlay
                instead of a fixed-width input - the fixed input was the
                root cause of the 390px overflow bug. */}
            <div className="md:hidden">
              <GlobalSearch compact />
            </div>
            <Link
              to="/app/tasks?new=1"
              aria-label="Quick Add"
              className="inline-flex h-9 w-9 items-center justify-center gap-1.5 rounded-lg bg-accent text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover md:h-auto md:w-auto md:px-3 md:py-1.5"
            >
              <Plus className="h-4 w-4" aria-hidden />
              <span className="hidden md:inline">Quick Add</span>
            </Link>
            <NotificationBell />
            <ThemeToggle />
            <UserMenu />
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

      {/* Mobile bottom navigation - phones only; at sm+ the (collapsible)
          sidebar is the navigation, so the tab bar would be redundant. */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-center justify-around border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
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
        <nav aria-label="More sections" className="grid grid-cols-2 gap-2 pb-[env(safe-area-inset-bottom)]">
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

      <Toast />
    </div>
  );
}
