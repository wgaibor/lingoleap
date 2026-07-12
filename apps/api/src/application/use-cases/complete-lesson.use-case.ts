import { LessonNotFoundError } from '../../domain/errors';
import type { CourseRepository } from '../ports/course.repository';
import type { ProgressRepository } from '../ports/progress.repository';

export class CompleteLessonUseCase {
  constructor(private readonly deps: { courses: CourseRepository; progress: ProgressRepository }) {}

  async execute(userId: string, lessonId: string): Promise<void> {
    const lesson = await this.deps.courses.findLessonById(lessonId);
    if (lesson === null) {
      throw new LessonNotFoundError(lessonId);
    }
    await this.deps.progress.markLessonCompleted(userId, lessonId);
  }
}
