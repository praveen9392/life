import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";

import { notificationsApi } from "./api";

const NOTIFICATIONS_QUERY_KEY = ["notifications"] as const;

/** Notification bell with unread badge + dropdown list. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: ({ signal }) => notificationsApi.list(signal),
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });

  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  });

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const unread = data?.unread_count ?? 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        className="relative rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-40 w-80 origin-top rounded-card border border-border bg-surface p-2 shadow-xl animate-scale-in">
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
          {!data || data.items.length === 0 ? (
            <p className="px-2 py-4 text-sm text-text-muted">You're all caught up.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {data.items.map((notification) => (
                <li
                  key={notification.id}
                  className={
                    notification.is_read
                      ? "rounded-lg px-2 py-1.5 opacity-60"
                      : "rounded-lg px-2 py-1.5"
                  }
                >
                  <p className="text-sm font-medium text-text">
                    {!notification.is_read ? (
                      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" aria-hidden />
                    ) : null}
                    {notification.title}
                  </p>
                  {notification.body ? (
                    <p className="mt-0.5 text-xs text-text-muted">{notification.body}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
