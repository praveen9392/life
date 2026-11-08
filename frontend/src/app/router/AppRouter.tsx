import { lazy, Suspense } from "react";
import { Link, createBrowserRouter, RouterProvider } from "react-router-dom";

import { AppShell } from "../../components/common/AppShell";
import { ProtectedRoute } from "./ProtectedRoute";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

// Route-level code splitting (performance requirement): every feature page
// is its own chunk, loaded on demand.
const LoginPage = lazy(() => import("../../features/auth/pages/LoginPage"));
const RegisterPage = lazy(() => import("../../features/auth/pages/RegisterPage"));
const DashboardPage = lazy(() => import("../../features/dashboard/pages/DashboardPage"));
const TasksPage = lazy(() => import("../../features/tasks/pages/TasksPage"));
const HabitsPage = lazy(() => import("../../features/habits/pages/HabitsPage"));
const NotesPage = lazy(() => import("../../features/notes/pages/NotesPage"));
const HealthPage = lazy(() => import("../../features/health/pages/HealthPage"));
const WorkoutsPage = lazy(() => import("../../features/workouts/pages/WorkoutsPage"));
const LearningPage = lazy(() => import("../../features/learning/pages/LearningPage"));
const GoalsPage = lazy(() => import("../../features/goals/pages/GoalsPage"));
const AnalyticsPage = lazy(() => import("../../features/analytics/pages/AnalyticsPage"));
const CalendarPage = lazy(() => import("../../features/calendar/pages/CalendarPage"));
const ProfilePage = lazy(() => import("../../features/profile/pages/ProfilePage"));
const OnboardingPage = lazy(() => import("../../features/profile/pages/OnboardingPage"));

function LazyFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-4 text-center">
      <h1 className="text-2xl font-semibold text-text">Page not found</h1>
      <p className="text-sm text-text-muted">The page you're looking for doesn't exist.</p>
      <Link
        to="/app"
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
      >
        Back to dashboard
      </Link>
    </main>
  );
}

const router = createBrowserRouter([
  {
    // Root-level fallback: lazy-chunk / runtime errors anywhere in the
    // tree render a friendly page instead of the router's raw error.
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: "/login",
        element: (
          <Suspense fallback={<LazyFallback />}>
            <LoginPage />
          </Suspense>
        ),
      },
      {
        path: "/register",
        element: (
          <Suspense fallback={<LazyFallback />}>
            <RegisterPage />
          </Suspense>
        ),
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: "/app",
            element: <AppShell />,
            errorElement: <RouteErrorBoundary />,
            children: [
              {
                index: true,
                element: (
                  <Suspense fallback={<LazyFallback />}>
                    <DashboardPage />
                  </Suspense>
                ),
              },
              {
                path: "tasks",
                element: (
                  <Suspense fallback={<LazyFallback />}>
                    <TasksPage />
                  </Suspense>
                ),
              },
              {
                path: "habits",
                element: (
                  <Suspense fallback={<LazyFallback />}>
                    <HabitsPage />
                  </Suspense>
                ),
              },
              {
                path: "notes",
                element: (
                  <Suspense fallback={<LazyFallback />}>
                    <NotesPage />
                  </Suspense>
                ),
              },
              {
                path: "health",
                element: (
                  <Suspense fallback={<LazyFallback />}>
                    <HealthPage />
                  </Suspense>
                ),
              },
              {
                path: "workouts",
                element: (
                  <Suspense fallback={<LazyFallback />}>
                    <WorkoutsPage />
                  </Suspense>
                ),
              },
              {
                path: "learning",
                element: (
                  <Suspense fallback={<LazyFallback />}>
                    <LearningPage />
                  </Suspense>
                ),
              },
              {
                path: "goals",
                element: (
                  <Suspense fallback={<LazyFallback />}>
                    <GoalsPage />
                  </Suspense>
                ),
              },
              {
                path: "calendar",
                element: (
                  <Suspense fallback={<LazyFallback />}>
                    <CalendarPage />
                  </Suspense>
                ),
              },
              {
                path: "analytics",
                element: (
                  <Suspense fallback={<LazyFallback />}>
                    <AnalyticsPage />
                  </Suspense>
                ),
              },
              {
                path: "profile",
                element: (
                  <Suspense fallback={<LazyFallback />}>
                    <ProfilePage />
                  </Suspense>
                ),
              },
            ],
          },
          {
            // Inside ProtectedRoute (anonymous users can't onboard) but
            // outside AppShell - it's a standalone full-screen wizard.
            path: "/onboarding",
            element: (
              <Suspense fallback={<LazyFallback />}>
                <OnboardingPage />
              </Suspense>
            ),
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
