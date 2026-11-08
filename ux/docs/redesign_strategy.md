# Redesign Strategy - Life

Decided only after the audit (`existing_system_analysis.md`, `screen_audit.md`, `ux_audit_report.md`). Every decision below cites the finding it answers.

## 1. What the product is, and what that implies

Life is one person's daily operating system: a **daily loop** (do today's habits and tasks), a **weekly rhythm** (plan, review), and a **personal archive** (notes, health, workouts, learning, goals). The current UI treats all ten modules as equal siblings in a flat SaaS sidebar with gamified metrics (Energy, Streak Shields). The redesign makes the product feel like a calm personal notebook that happens to be powerful:

1. **Today is the home.** One screen answers "what should I do now?" and shows true progress.
2. **Capture is instant.** One command bar and one Quick Add reach anything.
3. **Review is honest.** Numbers say what they measure; no invented scores.
4. **The same patterns everywhere.** One page header, one list row, one modal, one date format.

## 2. Design direction - "Paper & Ink, Evergreen accent"

Not another indigo-on-slate dashboard. A warm, editorial, low-noise language:

- **Surface:** warm paper (`#F6F3EC`) with white cards and hairline borders instead of heavy shadows; dark mode is warm graphite (`#14130F`), not blue-black.
- **Ink and accent:** near-black ink for text; one confident accent, **evergreen** (`#2F6B57`, dark mode `#6FC3A4`) used only for primary actions, focus, and "done". Warm **amber** for streaks/attention, **clay red** for overdue/destructive.
- **Module identity (subtle):** each module owns a small colour dot used in the sidebar, page eyebrow, and chart series - never as a page background - so context is clear without a rainbow UI.
- **Type:** system UI sans for interface; a serif display face (`"Iowan Old Style", "Palatino Linotype", Georgia, serif`) only for page titles and the big numbers, which gives the "notebook" voice. No web-font download (offline-safe, fast).
- **Density:** comfortable on desktop, 44 px touch targets on mobile, 16 px base text, 12 px floor (answers the 10-11 px labels in UX accessibility notes).
- **Shape:** 10 px card radius, 8 px controls, 999 px chips. One elevation for menus/modals.

## 3. Design tokens (implemented in `prototype/assets/styles/tokens.css`)

| Token group | Values |
|---|---|
| Space | 4-pt scale: 4, 8, 12, 16, 20, 24, 32, 48, 64 |
| Radius | 6, 8, 10 (cards), 999 |
| Type scale | 12, 13, 14, 16, 18, 22, 28, 36 (serif display); line-heights 1.3 / 1.5 |
| Colour roles | `bg`, `surface`, `surface-2`, `line`, `ink`, `ink-2` (muted), `accent`, `accent-ink`, `warn`, `danger`, `ok`, 7 module colours; paired light/dark |
| Motion | 120 ms (hover), 200 ms (UI), 320 ms (sheets), `cubic-bezier(.2,.8,.2,1)`; all disabled under `prefers-reduced-motion` |
| Focus | 2 px accent ring + 2 px offset on every interactive element |

## 4. Information architecture (answers UX-013, UX-022, UX-025, UX-030)

Flat 10-item sidebar becomes **five labelled groups**, same ten destinations plus Settings:

- **Today** - Today (was Dashboard)
- **Plan** - Tasks, Calendar, Goals
- **Routines** - Habits, Learning, Workouts, Health
- **Capture** - Notes
- **Review** - Insights (was Analytics)
- Footer: avatar menu -> Settings, Log out everywhere, Log out.

Jargon renamed to plain language: Dashboard -> Today, Analytics -> Insights, Pillars -> Category, "Priority Sprint" banner removed, "Master Workspace" removed.

**Command bar (Ctrl/Cmd+K)** replaces the header search box: type to search everything (existing `/search` API) *or* run actions ("New task", "Go to Habits", "Toggle dark mode"). **Quick Add (`+`)** becomes a chooser: Task, Habit, Note, Health log, Workout, Goal (answers UX-030).

**Mobile:** 5-column bottom bar - Today, Tasks, a raised **+** (Quick Add chooser), Habits, More - with "More" opening a full sheet containing every other destination (Notes, Health, Workouts, Goals, Calendar, Insights, Settings) plus Log out. No feature is more than two taps away (preserves the existing guarantee).

## 5. Component strategy

One implementation each, reused everywhere: `PageHeader` (eyebrow, serif title, subtitle, one primary action - fixes UX-020), `Card`, `Stat`, `Button` (primary/secondary/ghost/danger, 2 sizes), `Field` (label, hint, inline error), `Select`, `Chip`, `Progress`, `Ring`, `Row` (list item with leading control, title that truncates with `min-w-0`, meta, trailing actions - fixes UX-002/UX-003 class of bugs), `Modal` (centred on desktop, bottom sheet on mobile), `ConfirmDialog` (for every destructive action), `Toast` (single success/error pattern, replaces "Saved" text variants), `Menu`, `Tabs`/`Segmented`, `EmptyState` (icon, sentence, action), `Skeleton`, `Charts` (line, bar, sparkline, heat strip - SVG, no dependency), `DateText` (one formatter - fixes UX-014).

## 6. Fixes designed into the redesign (audit -> design response)

| Finding | Design response |
|---|---|
| UX-001 session dies | API client: single-flight `/auth/refresh` on 401, retry once, then login |
| UX-002 notes overflow | Notes is a 3-pane grid on desktop, 2 on tablet, stack on mobile; every row truncates |
| UX-003 stat strip | Stats use an auto-fit grid (min 150 px) |
| UX-004 sets without exercise | Session card groups sets under exercise name with best set |
| UX-005 duplicate keys | Key by exercise id |
| UX-006/007 invented metrics | Removed. Today shows one progress ring with breakdown (habits x/y, tasks x/y). "Streak" shown as best current streak with the habit's name |
| UX-008 completed-today | Counted from `completed_at` (client-side from a bounded completed list) and labelled "Completed today" |
| UX-009 Morning/Evening tabs | Reminder time added to habit form; tabs appear only when at least one habit has a reminder |
| UX-010 health defects | Unit printed once; chart with padded axes; tabs cover every API metric type |
| UX-011 theme | Toggle persists to profile (`PATCH /users/me`) and local cache |
| UX-012 clipped grid | 7 equal day columns that fit; today highlighted; mobile switches to a day list |
| UX-013 many percents | One hero metric per screen, scoped secondaries with explicit window ("last 30 days") |
| UX-014 dates | `DateText`: Today / Tomorrow / Yesterday / `Sat 28 Nov` / `28 Nov 2027`; inputs keep native pickers |
| UX-015 sessions | User-agent parsed to "Browser on OS", current device pinned first |
| UX-017 calendar dead end | Selecting a day opens a side panel listing that day's tasks (from `GET /tasks?due_on=`) plus habit/workout/learning counts, with links |
| UX-018/019 hidden capabilities | Workout date, learning session course select + history list, habit reminder, goal edit with manual progress slider, course edit |
| UX-023 | Settings: "Log out everywhere" (existing endpoint) |
| UX-026 trend | Straight segments, gaps rendered as hollow points, legend by pattern + colour |
| UX-030 | Quick Add chooser |

## 7. Interaction and motion

Purposeful, short, and always skippable: route content fades/rises 8 px (200 ms); modals scale/slide; sheets slide up (320 ms); checkbox completes with a soft row fade; progress rings and bars ease from previous value; hover raises borders (not shadows); skeletons shimmer. `prefers-reduced-motion: reduce` removes all transform/transition. No parallax, no looping decoration (the existing animated "ambient background" is dropped - it adds paint cost and no information).

## 8. Responsive strategy

Breakpoints: 600 (phone->tablet), 960 (tablet->desktop). Desktop: sidebar (collapsible) + content max 1120 px; page-level two-column layouts where it aids scanning (Today, Notes, Calendar). Tablet: sidebar collapses to icon rail. Phone: bottom tabs, sheets instead of dialogs, tables become row lists, filters become horizontal scroll chips. Verified at 320, 414, 820, 1366, 1800 in the validation pass.

## 9. Important decisions and trade-offs

1. **Prototype, not a rewrite of `frontend/`.** The user asked for a prototype in `ux/`. The production app keeps running untouched and the user's uncommitted edits to `frontend/` are not at risk. The prototype is a **working client** against the real REST API, not a static mock.
2. **No build step.** Vanilla ES modules + CSS so it opens with any static server and has no dependency/supply-chain surface. Trade-off: no React component reuse; the design system (tokens, patterns, copy, IA) is what ports over to the React app.
3. **API contract unchanged.** Every call uses the existing endpoints, cookies and CSRF header. Where the redesign wants data the API does not provide (e.g. completed-today by `completed_at`), it is derived client-side and flagged in `functionality_mapping.md`.
4. **Requires CORS for the prototype origin.** The backend allow-lists origins; run it with `ALLOWED_ORIGINS` including the prototype's origin (documented in `ux/README.md`).
5. **Out of scope / unverifiable:** avatar upload (needs S3), password reset (no backend endpoint), real-time notifications (backend generates them lazily on read - ADR-002).
