export interface ProgressRepository {
  markLessonCompleted(userId: string, lessonId: string): Promise<void>;
  listCompletedLessonIds(userId: string): Promise<string[]>;
}

export const PROGRESS_REPOSITORY = Symbol('ProgressRepository');
