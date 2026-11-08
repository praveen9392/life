import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { useUIStore } from "../../stores/uiStore";
import { authApi, type LoginInput, type RegisterInput } from "./api";

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

export function useCurrentUser() {
  return useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: () => authApi.me(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

// The user id whose server-side theme_preference was last applied to the
// uiStore. Module-level (not state) so it survives remounts within a session.
let themeSyncedForUserId: string | null = null;

/**
 * Hydrates `uiStore.theme` from `user.theme_preference` once per signed-in
 * user - previously the server preference was saved but never read back, so
 * it only applied to the onboarding/profile live-preview, not on load.
 * Syncing only on a user-id change means a later explicit toggle in the
 * same session is never fought and overwritten.
 */
export function useSyncThemeFromProfile() {
  const { data: user } = useCurrentUser();

  useEffect(() => {
    if (!user || themeSyncedForUserId === user.id) return;
    themeSyncedForUserId = user.id;
    if (useUIStore.getState().theme !== user.theme_preference) {
      useUIStore.getState().setTheme(user.theme_preference);
    }
  }, [user]);
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (data) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, data.user);
      void queryClient.invalidateQueries();
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: (data) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, data.user);
      void queryClient.invalidateQueries();
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      queryClient.clear();
      void navigate("/login");
    },
  });
}
