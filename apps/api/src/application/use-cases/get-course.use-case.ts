import type { CEFRLevel, Course, LearningLanguage } from '@lingoleap/core';
import { CourseNotFoundError } from '../../domain/errors';
import type { CourseRepository } from '../ports/course.repository';

export class GetCourseUseCase {
  constructor(private readonly courses: CourseRepository) {}

  async execute(language: LearningLanguage, level: CEFRLevel): Promise<Course> {
    const course = await this.courses.findByLanguageAndLevel(language, level);
    if (course === null) {
      throw new CourseNotFoundError(`${language} ${level}`);
    }
    return course;
  }
}
