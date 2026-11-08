# Screen-by-Screen Audit - Life (existing app)

Method: isolated stack (API `:8002` on `life_test`, Vite `:5175`), one seeded user with data in every module (habits with 30 days of logs, tasks incl. overdue/recurring/completed, 3 notes + 2 folders + tag, 7 health metrics, 3 workout sessions, 1 course with module/lessons, 3 learning sessions, 2 goals). Every route was captured at 320 / 414 / 820 / 1366 / 1800 px (`ux/audit/screens/current/`), then an interaction pass was run (`ux/audit/screens/interactions/`).

Finding IDs (`UX-nnn`) are defined with severity in `ux_audit_report.md`.

## Coverage - what I actually looked at

| Evidence | Viewed by me | Not viewed (data only) |
|---|---|---|
| 1366 px, all 12 authed routes | Yes - dashboard, tasks, habits, notes, health, workouts, learning, goals, calendar, analytics, profile, onboarding | - |
| 414 px | dashboard, habits, notes | all other routes (overflow numbers only) |
| 820 px | notes | all other routes (overflow numbers only) |
| 320 px, 1800 px | none | overflow numbers + console errors only |
| Interactions | analytics (settled), task modal, search results, notes preview, delete confirm, calendar day, notification bell, login wrong-password, register validation, mobile More sheet, mobile task modal, mobile note editor, mobile workouts, heatmap, workout modal, learning expanded course, dark dashboard/habits/analytics | account menu, search no-result/1-char, health forms, goal/habit modals, calendar week, collapsed sidebar, 404, profile bottom, task filters (captured, not inspected) |

Scroll inspection: full-page screenshots were taken and viewed for the 1366 routes; the 414 and 820 views above were also full-page. Fixed/sticky elements appear mid-page in full-page captures (capture artifact).

Automated evidence (`ux/audit/screens/current/report.json`): horizontal overflow on `/app/notes` at 320 (669>320), 414 (669>414), 820 (938>820); one console error on `/app/workouts` at 820 and 1800 (duplicate React key). Every other route/viewport: no overflow, no console errors, no failed requests. A 404 route renders the not-found page without redirect.

---

## 1. Login `/login`
- Centered card (Email, Password, Log in, "Create one" link); wrong password -> inline red "Invalid email or password" under the password field. **Good: clear error, no field wipe.**
- No show-password control, no "forgot password" (the backend has no reset endpoint either **[V]**), no brand mark or product context; the page is visually the plainest in the app (UX-024).
- 401 for a wrong password is the expected server response.

## 2. Register `/register`
- Empty submit shows inline errors per field ("Enter a valid email address", "Use at least 10 characters"). **Good.** Error text is 12 px; password rule is only revealed after failing, not before (UX-016).

## 3. Onboarding `/onboarding`
- Standalone full-screen wizard, 3 steps (name + timezone, theme, notifications). Minimal and fine; no progress preview of what the app does **[I]**.

## 4. Dashboard `/app`
- Hero: date chip, "Good morning, Ava", summary sentence, three pills (Focus 42%, Energy: Low, 14-day streak), progress ring 42%.
- Habits Today (tabs All/Morning/Evening) and Focus Tasks (list with priority chips, overdue first, completed struck through, "Plan ahead").
- Observations: "Energy: Low" and "Focus: 42%" are the same number thresholded (code: `deriveEnergyLabel`) (UX-006). Morning/Evening tabs can never contain UI-created habits (UX-009). Task rows show ISO dates (`Due 2026-11-05`) (UX-014). A completed task sits in the middle of the "remaining" list. At 414 px the bottom stat strip wraps labels one character per line ("NOTES & IDEAS", "complete d") (UX-003).
- Good: single summary request, skeleton states exist in code, ring animates.

## 5. Tasks `/app/tasks`
- Header with Add Task (large button), summary line, 4 stat pills (Due Today, In Progress, Completed Today, Overdue), search, filter groups (Due date, Status, Priority), "Today's Priority Sprint" banner, list grouped by Overdue / Today / Upcoming.
- Observations: "Completed Today" is computed as completed **and due today** (`useTasks({status:"completed", due_on:today})`), so a task completed this morning but due yesterday is excluded even though its card says "Completed at 9:41 AM" (UX-008). Banner copy ("Focus Sequence Active... sequenced for optimal output") is jargon (UX-022). Delete shows a confirm dialog **[V - good]**. New-task modal: Create disabled while title is empty, no explanation (UX-016); default list "Upcoming".
- Filter state persists in the URL (`?status=pending`) **[V - good]**.

## 6. Habits `/app/habits`
- Title with two chips (5 Active Habits, 84% Weekly Consistency), search, pillar filter, Weekly/Heatmap switch, New habit. Four cards (Today's Target 2/4, Current Best Streak 14 Days, Consistency Score 38%, Streak Shields 2). Weekly grid: habit name+pillar, target, streak, Mon..Sun cells.
- Observations: the **today column is clipped** at 1366 px inside a horizontally scrolling card (light and dark) (UX-012). Three different percentages in one view (84% weekly, 38% 30-day, 50% today) (UX-013). "Streak Shields / Protection" = number of habits with a >=7 day streak; no protection mechanic exists (UX-007). Heatmap rows wrap irregularly, have no month/date labels visible and no tooltips in the capture (UX-029). Weekly habit "Gym" shows "14d" streak.

## 7. Notes `/app/notes`
- Folder rail (All, Unfiled, folders with counts), list with search and sort, editor pane with Write/Preview, tags, pin/archive/delete, expand-to-reader; mobile shows list and editor as separate views with "Back to notes".
- Observations: **horizontal overflow at 320/414/820** (UX-002). "Unfiled" label is centered while sibling rail items are left-aligned (UX-021). Mermaid and markdown render correctly in Preview **[V - good]**. Write mode is a monospace textarea with no formatting help **[V]**.

## 8. Health `/app/health`
- Tabs All/Weight/Water/Sleep/Steps, trend chart, entry list with delete, log form.
- Observations: summary reads "latest: 8200 steps steps" (unit + type both printed) (UX-010). Chart Y-axis labels are clipped at the left edge (UX-010). `resting_heart_rate` and `custom` types exist in the API but have no tab; the entry I seeded is only visible under All (UX-010).

## 9. Workouts `/app/workouts`
- Weekly frequency bar chart (8 weeks), Personal records chips, session cards with sets.
- Observations: **set rows do not say which exercise** ("Set 1 - 8 reps - 85 kg" repeated for squat and bench) (UX-004). Chart has no Y-axis or values. Log-workout modal has no date field though the API accepts `performed_at` (UX-018). Console warns of duplicate keys (UX-005). Header button is smaller than Tasks' Add Task (UX-020).

## 10. Learning `/app/learning`
- Log-session form (Topic, Minutes), Courses (add, expandable with modules and lessons), Learning items (type select + title).
- Observations: logged sessions (3 sessions, 135 min) are not listed anywhere on the page. The course progress bar touches its meta line. "Add module" wraps to two lines. Headline "17% through your current learning goals" blends courses and items. Session form cannot attach a course although the API supports it (UX-018).

## 11. Goals `/app/goals`
- Goal cards with category, target date (`due 2027-02-06` raw ISO), progress and milestones.
- Observations: no way to edit a goal or set manual progress (frontend `goalsApi` has no update, backend has `PATCH /goals/{id}`) (UX-019). Raw ISO date (UX-014). Sparse page with large empty area.

## 12. Calendar `/app/calendar`
- Month grid with per-day counts; Week and Day views.
- Observations: Day view is a single small card of counts, with no list of that day's actual tasks/habits or link to them (API returns counts only) (UX-017). Whether clicking a month cell navigates anywhere was **not verified** (my selector missed; N).

## 13. Analytics `/app/analytics`
- Week/Month, six KPI cards, completion trend (tasks solid/circles, habits dashed/squares - pattern-coded, good), per-habit rates.
- Observations: charts render correctly once settled. (An earlier capture caught them mid-animation; that is not a defect.) The habits series uses smooth curve interpolation, which draws a wave between daily values and the tasks series has gaps on days with no tasks due (UX-026).

## 14. Profile & settings `/app/profile`
- Stacked cards: Profile (name, timezone), Preferences (theme radios, 5 notification checkboxes), Security (password, active sessions), Privacy (export, delete with typed confirmation + password). Mobile logout lives here.
- Observations: session rows show a raw user-agent string, two rows are indistinguishable (UX-015). Dates use locale format `08/11/2026` (UX-014). Theme set by the header toggle is not persisted and is overridden by the server preference on reload (UX-011). Logout-everywhere (API exists) and avatar upload (API exists) are not offered (UX-023).

## 15. Global shell
- Skip link, labelled landmarks, collapsible sidebar, Ctrl/Cmd+K focuses search **[V]**, grouped search results **[V]**, notification dropdown with "Mark all read" **[V]**, Quick Add always opens the **task** modal (`/app/tasks?new=1`) regardless of what you want to create (UX-030).
- **Session expiry:** after 15 minutes every API call returns 401 and the app hard-redirects to `/login` (UX-001). Observed in my own run: the browser landed on `/login` mid-session and the backend log shows `GET /users/me 401 Missing access token` while the 30-day refresh token was still valid.

## 16. States observed
Loading: spinner fallback + skeletons exist. Empty: present in code for most lists **[I]**. Error: route error boundary, inline form errors. Success: toast + "Saved" text (inconsistent between pages). Dark mode: works and looks coherent when toggled in-session **[V]**; contrast not measured.
