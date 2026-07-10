import type { CourseSummary } from '@lingoleap/core';
import type { CourseRepository } from '../ports/course.repository';

export class ListCoursesUseCase {
  constructor(private readonly courses: CourseRepository) {}

  execute(): Promise<CourseSummary[]> {
    return this.courses.listSummaries();
  }
}
