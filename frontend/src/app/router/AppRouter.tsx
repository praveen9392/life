import { lazy, Suspense } from "react";
import { Navigate, createBrowserRouter, RouterProvider } from "react-router-dom";

import { AppShell } from "../../components/common/AppShell";
import { ProtectedRoute } from "./ProtectedRoute";

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

export function AppRouter() {
  const router = createBrowserRouter([
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
      ],
    },
    {
      path: "/onboarding",
      element: (
        <Suspense fallback={<LazyFallback />}>
          <OnboardingPage />
        </Suspense>
      ),
    },
    { path: "*", element: <Navigate to="/app" replace /> },
  ]);

  return <RouterProvider router={router} />;
}
