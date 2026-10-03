import { httpClient } from "../../services/api/httpClient";

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationList {
  items: Notification[];
  unread_count: number;
}

export const notificationsApi = {
  list: (signal?: AbortSignal) => httpClient.get<NotificationList>("/api/v1/notifications", signal),
  markRead: (notificationId: string) =>
    httpClient.post<Notification>(`/api/v1/notifications/${notificationId}/read`),
  markAllRead: () =>
    httpClient.post<{ marked_read: number }>("/api/v1/notifications/read-all"),
};
