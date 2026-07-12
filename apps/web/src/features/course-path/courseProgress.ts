import type { LessonStatus } from '@lingoleap/core';

export interface CourseProgressSummary {
  completed: number;
  total: number;
  percent: number;
}

/**
 * Resume el progreso del curso a partir del mapa de estados ya calculado por
 * `computePathStatus` (no se vuelve a derivar el estado de cada lección aquí).
 */
export function summarizeCourseProgress(statusByLessonId: Record<string, LessonStatus>): CourseProgressSummary {
  const statuses = Object.values(statusByLessonId);
  const total = statuses.length;
  const completed = statuses.filter((status) => status === 'completed').length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent };
}
