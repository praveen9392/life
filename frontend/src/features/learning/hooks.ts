import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  learningApi,
  type LearningItemType,
  type LessonStatus,
} from "./api";

export const LEARNING_ITEMS_KEY = ["learning", "items"] as const;
export const COURSES_KEY = ["learning", "courses"] as const;
export const LEARNING_SESSIONS_KEY = ["learning", "sessions"] as const;

export function useLearningItems() {
  return useQuery({
    queryKey: LEARNING_ITEMS_KEY,
    queryFn: ({ signal }) => learningApi.listItems(signal),
    staleTime: 30 * 1000,
  });
}

export function useCourses() {
  return useQuery({
    queryKey: COURSES_KEY,
    queryFn: ({ signal }) => learningApi.listCourses(signal),
    staleTime: 30 * 1000,
  });
}

export function useCourse(courseId: string | null) {
  return useQuery({
    queryKey: [...COURSES_KEY, courseId],
    queryFn: () => learningApi.getCourse(courseId!),
    enabled: courseId !== null,
  });
}

export function useLearningSessions() {
  return useQuery({
    queryKey: LEARNING_SESSIONS_KEY,
    queryFn: ({ signal }) => learningApi.listSessions(signal),
    staleTime: 30 * 1000,
  });
}

function useInvalidateLearning() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["learning"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function useCreateLearningItem() {
  const invalidate = useInvalidateLearning();
  return useMutation({
    mutationFn: (input: { type: LearningItemType; title: string }) =>
      learningApi.createItem(input),
    onSuccess: invalidate,
  });
}

export function useCreateCourse() {
  const invalidate = useInvalidateLearning();
  return useMutation({
    mutationFn: (input: { title: string; provider?: string }) =>
      learningApi.createCourse(input),
    onSuccess: invalidate,
  });
}

export function useUpdateLesson() {
  const invalidate = useInvalidateLearning();
  return useMutation({
    mutationFn: ({ lessonId, status }: { lessonId: string; status: LessonStatus }) =>
      learningApi.updateLesson(lessonId, { status }),
    onSuccess: invalidate,
  });
}

export function useAddModule() {
  const invalidate = useInvalidateLearning();
  return useMutation({
    mutationFn: ({ courseId, title }: { courseId: string; title: string }) =>
      learningApi.addModule(courseId, title),
    onSuccess: invalidate,
  });
}

export function useAddLesson() {
  const invalidate = useInvalidateLearning();
  return useMutation({
    mutationFn: ({ moduleId, title }: { moduleId: string; title: string }) =>
      learningApi.addLesson(moduleId, title),
    onSuccess: invalidate,
  });
}

export function useLogLearningSession() {
  const invalidate = useInvalidateLearning();
  return useMutation({
    mutationFn: (input: {
      course_id?: string;
      topic?: string;
      duration_minutes: number;
      session_date: string;
      notes?: string;
    }) => learningApi.logSession(input),
    onSuccess: invalidate,
  });
}
