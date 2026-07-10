import type { Lesson } from '@lingoleap/core';
import { LessonNotFoundError } from '../../domain/errors';
import type { CourseRepository } from '../ports/course.repository';

export class GetLessonUseCase {
  constructor(private readonly courses: CourseRepository) {}

  async execute(lessonId: string): Promise<Lesson> {
    const lesson = await this.courses.findLessonById(lessonId);
    if (lesson === null) {
      throw new LessonNotFoundError(lessonId);
    }
    return lesson;
  }
}
