import type { Course } from '../exercises';

export type LessonStatus = 'completed' | 'unlocked' | 'locked';

export function computePathStatus(
  course: Course,
  completedLessonIds: readonly string[]
): Record<string, LessonStatus> {
  const completed = new Set(completedLessonIds);
  const result: Record<string, LessonStatus> = {};
  let unlockGiven = false;

  const units = [...course.units].sort((a, b) => a.position - b.position);
  for (const unit of units) {
    const lessons = [...unit.lessons].sort((a, b) => a.position - b.position);
    for (const lesson of lessons) {
      if (completed.has(lesson.id)) {
        result[lesson.id] = 'completed';
      } else if (!unlockGiven) {
        result[lesson.id] = 'unlocked';
        unlockGiven = true;
      } else {
        result[lesson.id] = 'locked';
      }
    }
  }
  return result;
}
