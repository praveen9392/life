import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";

import { useMenuKeyboard } from "../../hooks/useMenuKeyboard";
import { cn } from "../../utils/cn";
import type { Notification } from "./api";
import { useMarkAllRead, useMarkNotificationRead, useNotifications } from "./hooks";

const ROUTE_BY_ENTITY_TYPE: Record<string, string> = {
  task: "/app/tasks",
  habit: "/app/habits",
  goal: "/app/goals",
  note: "/app/notes",
  course: "/app/learning",
  learning_item: "/app/learning",
  workout: "/app/workouts",
  health_metric: "/app/health",
  health: "/app/health",
  event: "/app/calendar",
  calendar_event: "/app/calendar",
};

function resolveNotificationRoute(notification: Notification): string | null {
  const entityType = notification.related_entity_type?.toLowerCase();
  if (!entityType) return null;
  const route = ROUTE_BY_ENTITY_TYPE[entityType];
  if (!route) return null;
  if (entityType === "note" && notification.related_entity_id) {
    return `${route}?note=${encodeURIComponent(notification.related_entity_id)}`;
  }
  return route;
}

/** Notification bell with unread badge + dropdown list. */
export function NotificationBell() {
  const navigate = useNavigate();
  const { open, setOpen, close, containerRef, triggerRef, menuRef, onMenuKeyDown } = useMenuKeyboard();

  const notificationsQuery = useNotifications();
  const markAll = useMarkAllRead();
  const markRead = useMarkNotificationRead();
  const { data, isPending, isError } = notificationsQuery;

  const unread = data?.unread_count ?? 0;

  const openNotification = (notification: Notification) => {
    if (!notification.is_read) markRead.mutate(notification.id);
    close();
    const route = resolveNotificationRoute(notification);
    if (route) void navigate(route);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-danger-contrast">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={menuRef}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-11 z-40 w-[min(20rem,calc(100vw-1.5rem))] origin-top rounded-card border border-border bg-surface p-2 shadow-xl animate-scale-in focus:outline-none"
        >
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-sm font-semibold text-text">Notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                Mark all read
              </button>
            ) : null}
          </div>
          {isError ? (
            <p role="alert" className="px-2 py-4 text-sm text-danger">
              Couldn't load notifications.
            </p>
          ) : isPending ? (
            <p className="px-2 py-4 text-sm text-text-muted">Loading…</p>
          ) : !data || data.items.length === 0 ? (
            <p className="px-2 py-4 text-sm text-text-muted">You're all caught up.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto" role="menu" aria-label="Notifications">
              {data.items.map((notification) => (
                <li key={notification.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => openNotification(notification)}
                    className={cn(
                      "w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-hover focus:bg-surface-hover focus:outline-none",
                      notification.is_read && "opacity-60",
                    )}
                  >
                    <span className="block text-sm font-medium text-text">
                      {!notification.is_read ? (
                        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" aria-hidden />
                      ) : null}
                      {notification.title}
                    </span>
                    {notification.body ? (
                      <span className="mt-0.5 block text-xs text-text-muted">{notification.body}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
