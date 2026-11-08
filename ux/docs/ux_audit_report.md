# UX/UI Audit Report - Life (existing app)

Severity: **Critical** blocks an important workflow; **High** significantly hurts task completion or understanding; **Medium** adds friction or inconsistency; **Low** polish.
Basis: **Confirmed** = reproduced in the running app or proven in source; **Likely** = strong evidence, root cause not isolated.
Scope and coverage limits are in `screen_audit.md`. Accessibility ratios were not measured.

## Summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 1 | UX-001 |
| High | 5 | UX-002, UX-004, UX-012, UX-006, UX-032 |
| Medium | 15 | UX-003, UX-005, UX-007, UX-008, UX-009, UX-010, UX-011, UX-013, UX-014, UX-017, UX-018, UX-019, UX-026, UX-030, UX-031 |
| Low | 9 | UX-015, UX-016, UX-020, UX-021, UX-022, UX-023, UX-024, UX-025, UX-029 |

What is already good (keep): inline validation with clear messages, delete confirmation dialogs, URL-persisted filters, skip link and landmarks, Ctrl/Cmd+K search with grouped results, pattern-coded chart series (not colour alone), coherent dark theme, code-split routes, collapsible sidebar, mobile "More" sheet with feature parity.

## Findings

### Critical

**UX-001 - The session silently dies every 15 minutes.** *Confirmed.*
- Screens: all authenticated screens.
- Existing behaviour: the access cookie lives 15 minutes (`access_token_expire_minutes=15`). The frontend contains no call to `/api/v1/auth/refresh`; on any 401 `httpClient` runs `window.location.assign("/login")`.
- Evidence: source search (no refresh call in `frontend/src`); in my run the browser landed on `/login` mid-session; backend log shows `GET /api/v1/users/me 401 Missing access token` repeated while the saved refresh token was valid; a manual `POST /auth/refresh` returned 200 and issued a new session.
- Impact: a user who leaves a tab for a quarter-hour loses unsaved note edits and is bounced to login even though the 30-day session is still valid.
- Recommendation: on 401, call `/auth/refresh` once (single-flight), retry the original request, and only then redirect. Contract unchanged. (Implemented in the prototype client.)

### High

**UX-002 - Notes overflows horizontally at 320, 414 and 820 px.** *Confirmed* (scrollWidth 669>320, 669>414, 938>820). Cause not isolated; suspect fixed minimum widths in the two-pane layout and long unbroken titles **[hypothesis]**. Impact: on phones the whole page scrolls sideways and content is cut off. Recommendation: single-column mobile layout with truncating rows, `min-w-0` on flex children.

**UX-004 - Workout sets don't name their exercise.** *Confirmed.* Sessions list shows "Set 1 - 8 reps - 85 kg" for squats and bench alike. Impact: the log is illegible after the fact. Recommendation: group sets under exercise name with per-exercise summary.

**UX-006 - "Energy: Low" is an invented metric.** *Confirmed in source* (`deriveEnergyLabel(focusPercent)`; >=80 Optimal, >=50 Good, else Low). Focus %, Energy and the ring are one number shown three times; "Energy: Low" in red at 42% reads as a health judgement. Recommendation: remove; show one honest daily-progress number with its breakdown.

**UX-012 - The most important habit column is clipped.** *Confirmed* (today's column cut off at 1366 px, light and dark). The weekly grid scrolls horizontally inside its card and the current day sits at the clipped end. Recommendation: fixed-width day cells that fit, today emphasised and always visible; stack on narrow screens.

### Medium

- **UX-003 Dashboard stat strip breaks at 414 px.** *Confirmed (screenshot).* Labels wrap per character. Use a 2-column grid below `md`.
- **UX-005 Duplicate React keys on Workouts.** *Confirmed (console).* `key={record.exerciseName}` with fallback "Unknown exercise" while the exercise catalog is still loading. Key by exercise id.
- **UX-007 "Streak Shields / Protection" has no meaning.** *Confirmed in source:* counts habits with a >=7-day streak. No mechanic protects a streak. Rename to what it is ("habits on a 7+ day streak") or drop.
- **UX-008 "Completed Today" counts the wrong set.** *Confirmed in source:* `status=completed & due_on=today`; tasks completed today but due on another day are excluded though the card says "Completed at 9:41 AM". Count by `completed_at` date (needs a backend filter, or derive client-side from a bounded list).
- **UX-009 Morning/Evening habit tabs are unreachable.** *Confirmed in source:* they filter on `reminder_time`, which no form sets. Either add a reminder-time field or remove the tabs.
- **UX-010 Health page defects.** *Confirmed:* summary prints "8200 steps steps"; chart Y-axis labels clipped; tabs omit `resting_heart_rate` and `custom` (those entries only appear under All).
- **UX-011 Theme choice does not stick.** *Confirmed (source + observation):* header toggle writes localStorage only; `useSyncThemeFromProfile` re-applies the server preference at each page load, so a toggled dark theme reverts to the profile value after reload. Persist the toggle to the profile.
- **UX-013 Three different percentages on one page.** *Confirmed:* 84% weekly, 38% last-30-days, 50% today. Labelled, but the relationship is unexplained. Show one hero metric plus clearly scoped secondaries.
- **UX-014 Date formats are inconsistent.** *Confirmed:* `2026-11-05` (tasks/goals), `Sat 28 Nov`, `8 Nov`, `08/11/2026` (profile), `Sunday, November 8`, native `dd-mm-yyyy` inputs. Adopt one relative-aware formatter.
- **UX-017 Calendar Day view is a dead end.** *Confirmed:* shows counts only; no items, no links. (The API returns counts; tasks for a date are available via `GET /tasks?due_on=`.)
- **UX-018 Capabilities the API offers but forms hide.** *Confirmed in source:* workout date (`performed_at`) cannot be set (cannot log yesterday's session); learning sessions cannot attach a course; learning-session history is not listed; habit reminder time.
- **UX-019 Goals and courses cannot be edited.** *Confirmed in source:* no update calls in `goalsApi` or `learningApi` for goals/courses though PATCH endpoints exist; manual-mode goals therefore have no way to move their progress.
- **UX-026 Analytics trend misrepresents sparse data.** *Confirmed (screenshot):* smooth interpolation draws waves between daily points; tasks line has gaps. Use straight segments and mark empty days.
- **UX-030 Quick Add only creates tasks.** *Confirmed:* links to `/app/tasks?new=1`. People also capture notes, health logs and habits. Make Quick Add a type chooser.

### Low

- **UX-015** Sessions list prints raw user-agent text; two rows look identical. Parse to "Chrome on Windows".
- **UX-016** Disabled "Create task" gives no reason; register password rule shown only after failing.
- **UX-020** Page-header primary buttons differ in size/weight (Add Task large; New note, Log workout, New goal small).
- **UX-021** Notes rail: "Unfiled" label is centred while siblings are left-aligned.
- **UX-022** Jargon and filler copy: "Focus Sequence Active", "sequenced for optimal output", "Master Workspace", "Pillars".
- **UX-023** Backend features with no UI: logout-everywhere, avatar upload.
- **UX-024** Login/register: no show-password, no brand moment, no password reset (backend also lacks reset).
- **UX-025** Mobile: Profile is an orphaned tile at the end of the More grid; account menu lacks Settings.
- **UX-029** Heatmap rows wrap unevenly, no date labels/tooltips visible in capture.

### Added during prototype validation (found in the existing app's API behaviour)

- **UX-031 - Analytics percentages disagree with each other.** *Confirmed from API JSON (`audit-screens/after/api-analytics-week.json`).* Per-habit entries count skipped days as expected (an all-skipped habit shows `completed 0 / expected 6, 0%`), while the overall `habit_completion_percent` excludes them (88% = 15/17; the summed per-habit ratio is 15/22 = 68%). The same screen therefore shows two different definitions of "completion". Recommendation: pick one definition (excluding skipped days is the kinder one) and apply it everywhere.
- **UX-032 - Archiving a note is a one-way door.** *Confirmed:* `NoteRepository._base_query` excludes archived notes from list, get, update and delete, so `PATCH /notes/{id}` on an archived note returns 404 and nothing in the UI can restore or even delete it. The current app's Archive button gives no warning. Recommendation: warn before archiving, and/or add an archived-notes view. (The prototype warns explicitly; it cannot offer undo because the API forbids it.)

## Accessibility observations (not a WCAG evaluation)
- Positive: skip link, `nav`/`main` landmarks, `role="switch"` theme toggle with state label, menu keyboard handling, `aria-label` on icon buttons, reduced-motion handling via MotionConfig (per source comment).
- Concerns: many 10-11 px labels (`text-[10px]`, `text-[11px]` in sidebar subtitle, user email, badges); disabled primary buttons without explanation (UX-016); colour-only status in the habit grid beyond the legend **[I]**; focus-return after dialogs not inspected.

## Responsive observations
No overflow at any viewport except Notes (UX-002). Mobile has bottom tabs + More sheet (good) but the dashboard stat strip breaks at 414 (UX-003) and tablet (820) keeps the desktop sidebar, shrinking content width.

## Consistency observations
Two button scales, three success-feedback patterns (toast, "Saved" text, none), five date formats (UX-014), mixed card paddings, centred vs left labels (UX-021).
