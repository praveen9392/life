# Engineering Checklist

Final state after the review pass. PASS / PARTIAL / FAIL / N-A.

## Architecture
- [x] PASS — Layered boundaries (routes → services → repositories) respected in all changes
- [x] PASS — Feature-foldered frontend; server state in TanStack Query; Zustand UI-only
- [x] PASS — Lazy routes with error boundaries at root + `/app`
- [x] PARTIAL — Full pagination migration (5 routes done; rest bounded but not `Page`-shaped)

## Clean code
- [x] PASS — No dead code left (deleted, not commented)
- [x] PASS — Naming consistent with codebase conventions
- [x] PASS — No duplicated logic (shared `build_page`, `useDebouncedValue`, `toISODate`, `ErrorState`)
- [x] PASS — Functions small and single-purpose

## Frontend
- [x] PASS — Loading/error/empty states via `QueryStateBoundary` (+ `isEmpty`) everywhere
- [x] PASS — No fabricated data in UI
- [x] PASS — Debounced search; no request flooding
- [x] PASS — Timezone-safe local date handling (habits/calendar)
- [x] PASS — Unused dependencies removed (9)

## Backend
- [x] PASS — Thin routes; validation via Pydantic schemas (mass-assignment safe)
- [x] PASS — Transactions/flush discipline; refresh-before-serialize on `onupdate` paths
- [x] PASS — Eager loading before Pydantic serialization
- [x] PASS — Dead service/deps methods removed

## Database
- [x] PASS — Migrations at head, linear chain, no model drift
- [x] PASS — No destructive migrations
- [x] PASS — Ownership scoping in every query (verified by cross-user tests)
- [x] PASS — No N+1 on new/changed paths (batched validation, `selectinload`)
- [x] PARTIAL — Dashboard list caps (50/100) documented as debt

## Security
- [x] PASS — CSRF covers access- and refresh-cookie sessions; no lockout edge
- [x] PASS — Re-authentication for account deletion; password verified
- [x] PASS — Rate limits on sensitive endpoints (password, logout-all, delete, export)
- [x] PASS — No secrets in code/logs; export strips password hashes
- [x] PASS — IDOR: ownership enforced on all new endpoints (cross-user tests)
- [x] PARTIAL — Deferred: avatar magic-byte validation, old-avatar cleanup, CORS further tightening

## Testing
- [x] PASS — Backend 113 passed (tags, un-log, liveness, CSRF, deletion, template PATCH)
- [x] PASS — Frontend 14 Vitest tests
- [x] PASS — E2E 10/10 (chromium + mobile): auth, protected routes, task modal, health
- [x] PARTIAL — Feature-level frontend test coverage still thin (documented debt)

## Performance
- [x] PASS — Bundle splitting verified; charts lazy-loaded
- [x] PASS — Debounced requests; deduped per-habit queries (`useQueries`)
- [x] PASS — Backend: single-UPDATE mark-all-read; batched exercise validation; SQL filters
- [x] PARTIAL — Dashboard streak badges per-row queries (cached; could embed in summary)

## Accessibility
- [x] PASS — No fake ARIA roles; `aria-pressed` groups; honest labels
- [x] PASS — Escape/outside-click dismissal; menu semantics; focus-visible rings
- [x] PASS — Mobile touch targets always visible below `md`
- [x] PARTIAL — Calendar grid keyboard navigation (roles removed rather than half-done)

## Deployment
- [x] PASS — CI workflow (backend PG service + frontend gates)
- [x] PASS — Compose healthcheck; render.yaml proxy headers; health endpoints tested
- [x] PASS — `.env.example` complete; artifacts gitignored

## Documentation
- [x] PASS — This doc set (review/changes/enhancements/checklist)
- [x] PASS — AGENTS.md port + E2E flow corrections; TESTING.md matches reality
- [x] PASS — Stale claims (91 tests, quick-add flow) reconciled

## Feature completeness
- [x] PASS — Tags UI (backend + frontend + tests)
- [x] PASS — Habit un-log (backend + frontend + tests)
- [x] PASS — Board/Calendar task views: honest "Coming soon" stubs (documented)
