/** Types hand-aligned with the backend's Pydantic schemas (see
 * ARCHITECTURE.md "API Contracts" - updated alongside any backend change). */

export type ThemePreference = "light" | "dark" | "system";

export interface NotificationPreferences {
  task_due_soon: boolean;
  habit_reminder: boolean;
  learning_reminder: boolean;
  workout_reminder: boolean;
  goal_deadline_approaching: boolean;
}

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  timezone: string;
  theme_preference: ThemePreference;
  notification_preferences: NotificationPreferences;
  onboarding_completed_at: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  created_at: string;
  expires_at: string;
  user_agent: string | null;
  ip_address: string | null;
  is_current: boolean;
}
