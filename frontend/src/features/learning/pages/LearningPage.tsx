import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { BookOpen, CheckCircle2, ChevronDown, Circle, Plus, Timer } from "lucide-react";

import { EmptyState } from "../../../components/common/EmptyState";
import { QueryStateBoundary } from "../../../components/common/QueryStateBoundary";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Skeleton } from "../../../components/ui/Skeleton";
import { cn } from "../../../utils/cn";
import { toISODate } from "../../../utils/date";
import type { Course, LearningItemType } from "../api";
import {
  useAddLesson,
  useAddModule,
  useCourse,
  useCourses,
  useCreateCourse,
  useCreateLearningItem,
  useLearningItems,
  useLogLearningSession,
  useUpdateLesson,
} from "../hooks";

function isLearningItemType(value: string): value is LearningItemType {
  return value === "book" || value === "technology" || value === "topic" || value === "project";
}

function todayString(): string {
  return toISODate(new Date());
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="h-1.5 w-full rounded-full bg-surface-hover"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className="h-full rounded-full bg-accent"
        initial={{ width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      />
    </div>
  );
}

function CourseDetail({ courseId }: { courseId: string }) {
  const courseQuery = useCourse(courseId);
  const updateLesson = useUpdateLesson();
  const addModule = useAddModule();
  const addLesson = useAddLesson();
  const [moduleTitle, setModuleTitle] = useState("");
  const [lessonDrafts, setLessonDrafts] = useState<Record<string, string>>({});

  const course = courseQuery.data;
  if (courseQuery.isError) {
    return (
      <p role="alert" className="mt-3 border-t border-border pt-3 text-sm text-danger">
        Unable to load course details. Please try again later.
      </p>
    );
  }
  if (!course) return null;

  return (
    <div className="mt-3 space-y-4 border-t border-border pt-3">
      {course.modules.length === 0 ? (
        <p className="text-sm text-text-muted">No modules yet - add one below.</p>
      ) : (
        course.modules.map((module) => (
          <section key={module.id}>
            <h4 className="text-sm font-medium text-text">{module.title}</h4>
            <ul className="mt-1.5 space-y-1">
              {module.lessons.map((lesson) => {
                const done = lesson.status === "completed";
                return (
                  <li key={lesson.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={updateLesson.isPending}
                      onClick={() =>
                        updateLesson.mutate({
                          lessonId: lesson.id,
                          status: done ? "not_started" : "completed",
                        })
                      }
                      aria-label={`Toggle lesson "${lesson.title}"`}
                      aria-pressed={done}
                      className="inline-flex h-6 w-6 items-center justify-center text-text-muted hover:text-accent disabled:opacity-50"
                    >
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden />
                      ) : (
                        <Circle className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                    <span className={cn("text-sm text-text", done && "line-through opacity-60")}>
                      {lesson.title}
                    </span>
                    {lesson.duration_minutes ? (
                      <span className="text-xs text-text-muted">{lesson.duration_minutes}m</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <form
              className="mt-1.5 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const title = (lessonDrafts[module.id] ?? "").trim();
                if (title) {
                  addLesson.mutate({ moduleId: module.id, title });
                  setLessonDrafts((previous) => ({ ...previous, [module.id]: "" }));
                }
              }}
            >
              <Input
                value={lessonDrafts[module.id] ?? ""}
                onChange={(event) =>
                  setLessonDrafts((previous) => ({ ...previous, [module.id]: event.target.value }))
                }
                placeholder="Add lesson…"
                aria-label={`Add lesson to ${module.title}`}
                maxLength={200}
              />
              <Button type="submit" size="sm" variant="secondary" disabled={addLesson.isPending}>
                Add
              </Button>
            </form>
          </section>
        ))
      )}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const title = moduleTitle.trim();
          if (title) {
            addModule.mutate({ courseId, title });
            setModuleTitle("");
          }
        }}
      >
        <Input
          value={moduleTitle}
          onChange={(event) => setModuleTitle(event.target.value)}
          placeholder="Add module…"
          aria-label="Add module"
          maxLength={200}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={addModule.isPending}>
          Add module
        </Button>
      </form>
    </div>
  );
}

function CourseCard({ course }: { course: Course }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <motion.li whileHover={{ y: -2 }} className="rounded-card border border-border bg-surface p-4 transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text">{course.title}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {course.provider ?? "Self-directed"} · {course.status.replace("_", " ")} ·{" "}
            {course.progress_percent}%
          </p>
          <ProgressBar percent={course.progress_percent} />
        </div>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-text-muted transition-transform", expanded && "rotate-180")}
          aria-hidden
        />
      </button>
      {expanded ? <CourseDetail courseId={course.id} /> : null}
    </motion.li>
  );
}

export default function LearningPage() {
  const itemsQuery = useLearningItems();
  const coursesQuery = useCourses();
  const createItem = useCreateLearningItem();
  const createCourse = useCreateCourse();
  const logSession = useLogLearningSession();

  const [itemTitle, setItemTitle] = useState("");
  const [itemType, setItemType] = useState<LearningItemType>("book");
  const [courseTitle, setCourseTitle] = useState("");
  const [minutes, setMinutes] = useState("");
  const [topic, setTopic] = useState("");

  const courses = coursesQuery.data ?? [];
  const items = itemsQuery.data ?? [];
  const inProgress = [...courses, ...items].filter(
    (entry) => entry.status === "in_progress" || entry.status === "not_started",
  );
  const averageProgress = inProgress.length
    ? Math.round(inProgress.reduce((sum, entry) => sum + entry.progress_percent, 0) / inProgress.length)
    : 0;
  const heroSubtitle =
    inProgress.length === 0
      ? "Courses, materials, and study time."
      : `You're ${averageProgress}% through your current learning goals.`;

  const addItem = (event: FormEvent) => {
    event.preventDefault();
    if (!itemTitle.trim() || createItem.isPending) return;
    createItem.mutate(
      { type: itemType, title: itemTitle.trim() },
      { onSuccess: () => setItemTitle("") },
    );
  };

  const addCourse = (event: FormEvent) => {
    event.preventDefault();
    if (!courseTitle.trim() || createCourse.isPending) return;
    createCourse.mutate({ title: courseTitle.trim() }, { onSuccess: () => setCourseTitle("") });
  };

  const submitSession = (event: FormEvent) => {
    event.preventDefault();
    const duration = Number(minutes);
    if (!Number.isFinite(duration) || duration <= 0 || logSession.isPending) return;
    logSession.mutate(
      { duration_minutes: duration, session_date: todayString(), topic: topic || undefined },
      { onSuccess: () => { setMinutes(""); setTopic(""); } },
    );
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text">Learning</h1>
        <p className="mt-1 text-sm text-text-muted">{heroSubtitle}</p>
      </header>

      {/* Quick log a study session */}
      <form onSubmit={submitSession} className="card flex flex-wrap items-end gap-3" aria-label="Log study session">
        <div className="min-w-40 flex-1">
          <Input
            label="Topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="What did you study?"
            maxLength={200}
          />
        </div>
        <div className="w-28">
          <Input
            label="Minutes"
            type="number"
            min="1"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            required
          />
        </div>
        <Button type="submit" isLoading={logSession.isPending}>
          <Timer className="h-4 w-4" aria-hidden />
          Log session
        </Button>
      </form>

      {/* Courses */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-text">Courses</h2>
        </div>
        <form onSubmit={addCourse} className="mb-3 flex gap-2" aria-label="New course">
          <Input
            value={courseTitle}
            onChange={(event) => setCourseTitle(event.target.value)}
            placeholder="New course title…"
            aria-label="Course title"
            maxLength={200}
          />
          <Button type="submit" variant="secondary" isLoading={createCourse.isPending} disabled={!courseTitle.trim()}>
            <Plus className="h-4 w-4" aria-hidden />
            Add
          </Button>
        </form>
        <QueryStateBoundary
          query={coursesQuery}
          skeleton={<Skeleton className="h-24 w-full" />}
          isEmpty={(courses) => courses.length === 0}
          empty={
            <EmptyState
              icon={<BookOpen className="h-8 w-8" aria-hidden />}
              title="No courses"
              description="Add a course to track structured learning."
            />
          }
        >
          {(courses) => (
            <ul className="space-y-3" aria-label="Courses">
              {courses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </ul>
          )}
        </QueryStateBoundary>
      </section>

      {/* Learning items */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-text">Learning items</h2>
        <form onSubmit={addItem} className="mb-3 flex gap-2" aria-label="New learning item">
          <select
            className="input w-32"
            aria-label="Item type"
            value={itemType}
            onChange={(event) => {
              if (isLearningItemType(event.target.value)) setItemType(event.target.value);
            }}
          >
            <option value="book">Book</option>
            <option value="technology">Technology</option>
            <option value="topic">Topic</option>
            <option value="project">Project</option>
          </select>
          <Input
            value={itemTitle}
            onChange={(event) => setItemTitle(event.target.value)}
            placeholder="e.g. Designing Data-Intensive Apps"
            aria-label="Item title"
            maxLength={200}
          />
          <Button type="submit" variant="secondary" isLoading={createItem.isPending} disabled={!itemTitle.trim()}>
            <Plus className="h-4 w-4" aria-hidden />
            Add
          </Button>
        </form>
        <QueryStateBoundary
          query={itemsQuery}
          skeleton={<Skeleton className="h-16 w-full" />}
          isEmpty={(items) => items.length === 0}
          empty={<EmptyState title="No items" description="Track books, technologies, topics, projects." />}
        >
          {(items) => (
            <ul className="space-y-1.5" aria-label="Learning items">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2"
                >
                  <span className="text-sm font-medium text-text">{item.title}</span>
                  <span className="text-xs text-text-muted">
                    {item.type} · {item.status.replace("_", " ")} · {item.progress_percent}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </QueryStateBoundary>
      </section>
    </div>
  );
}
