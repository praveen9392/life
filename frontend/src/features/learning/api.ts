import { httpClient } from "../../services/api/httpClient";

export type LearningItemType = "book" | "technology" | "topic" | "project";
export type LearningItemStatus = "not_started" | "in_progress" | "completed";
export type LessonStatus = "not_started" | "in_progress" | "completed";

export interface LearningItem {
  id: string;
  type: LearningItemType;
  title: string;
  status: LearningItemStatus;
  progress_percent: number;
  created_at: string;
}

export interface Lesson {
  id: string;
  title: string;
  position: number;
  status: LessonStatus;
  duration_minutes: number | null;
  completed_at: string | null;
}

export interface CourseModule {
  id: string;
  title: string;
  position: number;
  lessons: Lesson[];
}

export interface Course {
  id: string;
  title: string;
  provider: string | null;
  start_date: string | null;
  target_date: string | null;
  status: "not_started" | "in_progress" | "completed" | "abandoned";
  progress_percent: number;
  created_at: string;
}

export interface CourseDetail extends Course {
  modules: CourseModule[];
}

export interface LearningSession {
  id: string;
  course_id: string | null;
  learning_item_id: string | null;
  topic: string | null;
  duration_minutes: number;
  session_date: string;
  notes: string | null;
  created_at: string;
}

export const learningApi = {
  listItems: (signal?: AbortSignal) => httpClient.get<LearningItem[]>("/api/v1/learning/items", signal),
  createItem: (input: { type: LearningItemType; title: string }) =>
    httpClient.post<LearningItem>("/api/v1/learning/items", input),
  updateItem: (itemId: string, input: Partial<LearningItem>) =>
    httpClient.patch<LearningItem>(`/api/v1/learning/items/${itemId}`, input),
  removeItem: (itemId: string) => httpClient.delete(`/api/v1/learning/items/${itemId}`),

  listCourses: (signal?: AbortSignal) => httpClient.get<Course[]>("/api/v1/learning/courses", signal),
  getCourse: (courseId: string) => httpClient.get<CourseDetail>(`/api/v1/learning/courses/${courseId}`),
  createCourse: (input: { title: string; provider?: string; target_date?: string }) =>
    httpClient.post<Course>("/api/v1/learning/courses", input),
  removeCourse: (courseId: string) => httpClient.delete(`/api/v1/learning/courses/${courseId}`),

  addModule: (courseId: string, title: string) =>
    httpClient.post<CourseModule>(`/api/v1/learning/courses/${courseId}/modules`, { title }),
  addLesson: (moduleId: string, title: string) =>
    httpClient.post<Lesson>(`/api/v1/learning/modules/${moduleId}/lessons`, { title }),
  updateLesson: (lessonId: string, input: { status?: LessonStatus; title?: string }) =>
    httpClient.patch<Lesson>(`/api/v1/learning/lessons/${lessonId}`, input),

  logSession: (input: {
    course_id?: string;
    topic?: string;
    duration_minutes: number;
    session_date: string;
    notes?: string;
  }) => httpClient.post<LearningSession>("/api/v1/learning/sessions", input),
};
