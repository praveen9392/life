import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { ApiError } from "../../../services/api/httpClient";
import type { NotificationPreferences, ThemePreference } from "../../../types/user";
import { useCurrentUser, useLogout } from "../../auth/hooks";
import { useChangePassword, useDeleteAccount, useExportData, useRevokeSession, useSessions, useUpdateProfile } from "../hooks";

const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Current password is required"),
    new_password: z.string().min(10, "Use at least 10 characters").max(128),
  })
  .refine((data) => data.current_password !== data.new_password, {
    message: "The new password must be different",
    path: ["new_password"],
  });

type PasswordForm = z.infer<typeof passwordSchema>;

const TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function ProfileInfoSection() {
  const { data: user } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ full_name: string; timezone: string }>({
    values: { full_name: user?.full_name ?? "", timezone: user?.timezone ?? "UTC" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false);
    try {
      await updateProfile.mutateAsync({ full_name: values.full_name, timezone: values.timezone });
      setSaved(true);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Update failed";
      setError("root", { message });
    }
  });

  if (!user) return null;

  return (
    <section className="card" aria-labelledby="profile-info-heading">
      <h2 id="profile-info-heading" className="mb-4 text-lg font-semibold text-text">
        Profile
      </h2>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-xl font-semibold text-accent-contrast">
            {(user.full_name ?? user.email)[0].toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-text">{user.email}</p>
            <p className="text-xs text-text-muted">Email cannot be changed in this version.</p>
          </div>
        </div>
        <Input label="Name" error={errors.full_name?.message} {...register("full_name")} />
        <div>
          <label htmlFor="timezone" className="label">
            Timezone
          </label>
          <select id="timezone" className="input" {...register("timezone")}>
            {[...new Set([user.timezone, ...TIMEZONES])].map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-text-muted">
            Used for "today" boundaries, streaks, and reminders.
          </p>
        </div>
        {errors.root ? (
          <p role="alert" className="text-sm text-danger">
            {errors.root.message}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <Button type="submit" isLoading={isSubmitting}>
            Save changes
          </Button>
          {saved ? (
            <span className="text-sm text-success" role="status">
              Saved
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}

const NOTIFICATION_LABELS: Record<keyof NotificationPreferences, string> = {
  task_due_soon: "Task due soon",
  habit_reminder: "Habit reminders",
  learning_reminder: "Learning reminders",
  workout_reminder: "Workout reminders",
  goal_deadline_approaching: "Goal deadline approaching",
};

/** Theme + notification preferences - mirrors the one-time onboarding
 * wizard's UI (same fields, same `useUpdateProfile` mutation) so these
 * choices remain reachable after onboarding is skipped or completed. */
function PreferencesSection() {
  const { data: user } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  const setThemePreference = (theme: ThemePreference) => {
    setSaved(false);
    updateProfile.mutate(
      { theme_preference: theme },
      { onSuccess: () => setSaved(true) },
    );
  };

  const toggleNotification = (key: keyof NotificationPreferences) => {
    setSaved(false);
    updateProfile.mutate(
      {
        notification_preferences: {
          ...user.notification_preferences,
          [key]: !user.notification_preferences[key],
        },
      },
      { onSuccess: () => setSaved(true) },
    );
  };

  return (
    <section className="card" aria-labelledby="preferences-heading">
      <h2 id="preferences-heading" className="mb-4 text-lg font-semibold text-text">
        Preferences
      </h2>

      <fieldset className="space-y-3">
        <legend className="label">Theme</legend>
        <div className="grid grid-cols-3 gap-2">
          {(["light", "dark", "system"] as ThemePreference[]).map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm capitalize hover:bg-surface-hover has-[:checked]:border-accent has-[:checked]:bg-accent/5"
            >
              <input
                type="radio"
                name="profile-theme"
                value={option}
                checked={user.theme_preference === option}
                onChange={() => setThemePreference(option)}
                className="h-4 w-4 accent-[rgb(var(--color-accent))]"
              />
              {option}
            </label>
          ))}
        </div>
        <p className="text-xs text-text-muted">Applies immediately, on this device and account-wide.</p>
      </fieldset>

      <fieldset className="mt-6 space-y-2">
        <legend className="label">Notifications</legend>
        {(Object.keys(user.notification_preferences) as (keyof NotificationPreferences)[]).map((key) => (
          <label
            key={key}
            className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-4 py-3 text-sm hover:bg-surface-hover"
          >
            {NOTIFICATION_LABELS[key]}
            <input
              type="checkbox"
              checked={user.notification_preferences[key]}
              onChange={() => toggleNotification(key)}
              className="h-4 w-4 accent-[rgb(var(--color-accent))]"
            />
          </label>
        ))}
      </fieldset>
      {saved ? (
        <p className="mt-3 text-sm text-success" role="status">
          Saved
        </p>
      ) : null}
      {updateProfile.isError ? (
        <p role="alert" className="mt-3 text-sm text-danger">{updateProfile.error.message}</p>
      ) : null}
    </section>
  );
}

function SecuritySection() {
  const sessions = useSessions();
  const revokeSession = useRevokeSession();
  const changePassword = useChangePassword();
  const [passwordChanged, setPasswordChanged] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setPasswordChanged(false);
    try {
      await changePassword.mutateAsync(values);
      setPasswordChanged(true);
      reset();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Password change failed";
      setError("root", { message });
    }
  });

  return (
    <section className="card" aria-labelledby="security-heading">
      <h2 id="security-heading" className="mb-4 text-lg font-semibold text-text">
        Security
      </h2>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          error={errors.current_password?.message}
          {...register("current_password")}
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          error={errors.new_password?.message}
          {...register("new_password")}
        />
        {errors.root ? (
          <p role="alert" className="text-sm text-danger">
            {errors.root.message}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" isLoading={isSubmitting}>
            Change password
          </Button>
          {passwordChanged ? (
            <span className="text-sm text-success" role="status">
              Changed - log in again on other devices
            </span>
          ) : null}
        </div>
      </form>

      <h3 className="mb-2 mt-6 text-sm font-semibold text-text">Active sessions</h3>
      <ul className="space-y-2">
        {(sessions.data ?? []).map((session) => (
          <li
            key={session.id}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-text">
                {session.user_agent?.slice(0, 60) ?? "Unknown device"}
              </p>
              <p className="text-xs text-text-muted">
                {new Date(session.created_at).toLocaleString()}
                {session.is_current ? " - this device" : ""}
              </p>
            </div>
            {!session.is_current ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => revokeSession.mutate(session.id)}
                isLoading={revokeSession.isPending && revokeSession.variables === session.id}
              >
                Revoke
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PrivacySection() {
  const exportData = useExportData();
  const deleteAccount = useDeleteAccount();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  return (
    <section className="card" aria-labelledby="privacy-heading">
      <h2 id="privacy-heading" className="mb-4 text-lg font-semibold text-text">
        Privacy & data
      </h2>
      <p className="mb-4 text-sm text-text-muted">
        Export a complete copy of your data, or permanently delete your account and everything in it.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => exportData.mutate()} isLoading={exportData.isPending}>
          Export my data
        </Button>
        {confirming ? (
          <div className="flex flex-1 items-center gap-2">
            <Input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder='Type "delete" to confirm'
              aria-label="Confirm account deletion"
            />
            <Button
              variant="danger"
              disabled={confirmText !== "delete"}
              isLoading={deleteAccount.isPending}
              onClick={() => deleteAccount.mutate()}
            >
              Delete forever
            </Button>
            <Button variant="ghost" onClick={() => { setConfirming(false); setConfirmText(""); }}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="ghost" className="text-danger" onClick={() => setConfirming(true)}>
            Delete account…
          </Button>
        )}
      </div>
      {exportData.isError ? (
        <p role="alert" className="mt-3 text-sm text-danger">{exportData.error.message}</p>
      ) : null}
    </section>
  );
}

export default function ProfilePage() {
  const logout = useLogout();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">Profile & settings</h1>
        {/* Mobile logout lives here - the header button is hidden on small screens. */}
        <Button variant="secondary" size="sm" onClick={() => logout.mutate()} isLoading={logout.isPending}>
          Log out
        </Button>
      </div>
      <ProfileInfoSection />
      <PreferencesSection />
      <SecuritySection />
      <PrivacySection />
    </div>
  );
}
