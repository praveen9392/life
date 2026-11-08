import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useUIStore } from "../../stores/uiStore";
import { AUTH_QUERY_KEY } from "../auth/hooks";
import { profileApi, type ProfileUpdateInput } from "./api";

// Prefixed to avoid colliding with workouts' SESSIONS_QUERY_KEY export.
export const PROFILE_SESSIONS_QUERY_KEY = ["profile", "sessions"] as const;

/**
 * Persists profile changes to the backend AND, when a theme preference is
 * part of the update, applies it to the live `uiStore` immediately.
 *
 * This fixes a real bug: previously `theme_preference` was saved server-side
 * but the onboarding wizard (and now the Profile page) never called
 * `useUIStore`'s `setTheme`, so the chosen theme only took effect after a
 * full reload re-read `user.theme_preference` - which, in fact, never
 * actually happens anywhere either, since nothing synced the store from the
 * server value on load. The theme choice now applies instantly, matching
 * the live preview the radio buttons imply.
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const setTheme = useUIStore((state) => state.setTheme);
  return useMutation({
    mutationFn: (input: ProfileUpdateInput) => profileApi.update(input),
    onSuccess: (user, variables) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, user);
      if (variables.theme_preference) {
        setTheme(variables.theme_preference);
      }
    },
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => profileApi.completeOnboarding(),
    onSuccess: (user) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, user);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { current_password: string; new_password: string }) =>
      profileApi.changePassword(input),
  });
}

export function useSessions() {
  return useQuery({
    queryKey: PROFILE_SESSIONS_QUERY_KEY,
    queryFn: () => profileApi.listSessions(),
    staleTime: 60 * 1000,
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => profileApi.revokeSession(sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROFILE_SESSIONS_QUERY_KEY });
    },
  });
}

export function useExportData() {
  return useMutation({
    mutationFn: () => profileApi.exportData(),
    onSuccess: (data) => {
      // Trigger a browser download of the exported JSON snapshot.
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "life-export.json";
      link.click();
      URL.revokeObjectURL(url);
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { current_password: string }) => profileApi.deleteAccount(input),
    onSuccess: () => {
      queryClient.clear();
      window.location.href = "/login";
    },
  });
}
