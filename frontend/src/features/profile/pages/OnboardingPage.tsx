import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { useCurrentUser } from "../../auth/hooks";
import { useCompleteOnboarding, useUpdateProfile } from "../hooks";
import type { NotificationPreferences, ThemePreference } from "../../../types/user";
import { TIMEZONES } from "../../../utils/timezones";

function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Steps 3-5 (initial habits/goals/learning interests) are wired in Phases 7
 * and 9 per the implementation plan; this wizard ships the account steps
 * now and is fully skippable at every step. */
export default function OnboardingPage() {
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const completeOnboarding = useCompleteOnboarding();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(user?.full_name ?? "");
  const [timezone, setTimezone] = useState(user?.timezone ?? guessTimezone());
  const [theme, setTheme] = useState<ThemePreference>(user?.theme_preference ?? "system");
  const [notifications, setNotifications] = useState<NotificationPreferences>(
    user?.notification_preferences ?? {
      task_due_soon: true,
      habit_reminder: true,
      learning_reminder: true,
      workout_reminder: true,
      goal_deadline_approaching: true,
    },
  );

  async function saveAndFinish() {
    try {
      await updateProfile.mutateAsync({
        full_name: name || null,
        timezone,
        theme_preference: theme,
        notification_preferences: notifications,
      });
      await completeOnboarding.mutateAsync();
      void navigate("/app", { replace: true });
    } catch {
      // Failure is surfaced via the mutations' isError state below.
    }
  }

  async function skipAll() {
    try {
      await completeOnboarding.mutateAsync();
      void navigate("/app", { replace: true });
    } catch {
      // Failure is surfaced via the mutation's isError state below.
    }
  }

  const saveFailed = updateProfile.isError || completeOnboarding.isError;

  const steps = [
    // Step 1: name + timezone
    <div key="who" className="space-y-4">
      <Input
        label="What should we call you?"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Your name"
        maxLength={200}
      />
      <div>
        <label htmlFor="onboarding-timezone" className="label">
          Your timezone
        </label>
        <select
          id="onboarding-timezone"
          className="input"
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
        >
          {[...new Set([timezone, ...TIMEZONES])].map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-text-muted">Drives "today", streaks, and reminders.</p>
      </div>
    </div>,
    // Step 2: theme
    <fieldset key="theme" className="space-y-3">
      <legend className="label">Pick a theme</legend>
      {(["light", "dark", "system"] as ThemePreference[]).map((option) => (
        <label
          key={option}
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm capitalize hover:bg-surface-hover has-[:checked]:border-accent"
        >
          <input
            type="radio"
            name="theme"
            value={option}
            checked={theme === option}
            onChange={() => setTheme(option)}
            className="h-4 w-4 accent-[rgb(var(--color-accent))]"
          />
          {option}
        </label>
      ))}
    </fieldset>,
    // Step 3: notification preferences
    <fieldset key="notifications" className="space-y-3">
      <legend className="mb-1 text-sm text-text-muted">
        Choose which in-app notifications you want (you can change this anytime).
      </legend>
      {(Object.keys(notifications) as (keyof NotificationPreferences)[]).map((key) => (
        <label
          key={key}
          className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-4 py-3 text-sm capitalize hover:bg-surface-hover"
        >
          {key.replaceAll("_", " ")}
          <input
            type="checkbox"
            checked={notifications[key]}
            onChange={(event) => setNotifications({ ...notifications, [key]: event.target.checked })}
            className="h-4 w-4 accent-[rgb(var(--color-accent))]"
          />
        </label>
      ))}
    </fieldset>,
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-text">Set up your account</h1>
          <p className="mt-1 text-sm text-text-muted">
            Step {step + 1} of {steps.length} - everything is optional and skippable.
          </p>
          <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-hover"
            role="progressbar"
            aria-valuenow={step + 1}
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-label="Onboarding progress"
          >
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>
        <div className="card space-y-6">{steps[step]}</div>
        {saveFailed ? (
          <p role="alert" className="mt-3 text-center text-sm text-danger">
            Couldn't save your setup. Check your connection and try again.
          </p>
        ) : null}
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={skipAll}
            className="text-sm text-text-muted hover:text-text hover:underline"
          >
            Skip for now
          </button>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            ) : null}
            <Button
              onClick={() => (step < steps.length - 1 ? setStep(step + 1) : void saveAndFinish())}
              isLoading={updateProfile.isPending || completeOnboarding.isPending}
            >
              {step < steps.length - 1 ? "Continue" : "Finish"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
