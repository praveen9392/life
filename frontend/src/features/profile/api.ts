import { httpClient } from "../../services/api/httpClient";
import type { NotificationPreferences, Session, ThemePreference, User } from "../../types/user";

export interface ProfileUpdateInput {
  full_name?: string | null;
  timezone?: string;
  theme_preference?: ThemePreference;
  notification_preferences?: NotificationPreferences;
}

export const profileApi = {
  update: (input: ProfileUpdateInput) => httpClient.patch<User>("/api/v1/users/me", input),
  completeOnboarding: () => httpClient.post<User>("/api/v1/users/me/onboarding"),
  changePassword: (input: { current_password: string; new_password: string }) =>
    httpClient.post<{ message: string }>("/api/v1/users/me/password", input),
  listSessions: () => httpClient.get<Session[]>("/api/v1/users/me/sessions"),
  revokeSession: (sessionId: string) =>
    httpClient.delete<{ message: string }>(`/api/v1/users/me/sessions/${sessionId}`),
  exportData: () => httpClient.get<Record<string, unknown>>("/api/v1/privacy/export"),
  deleteAccount: () => httpClient.delete("/api/v1/privacy/account"),
};
