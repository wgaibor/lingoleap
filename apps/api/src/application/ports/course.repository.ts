import type { CEFRLevel, Course, CourseSummary, LearningLanguage, Lesson } from '@lingoleap/core';

export interface CourseRepository {
  /** Reemplaza el curso existente para (language, level) si lo hay */
  saveCourse(course: Course): Promise<void>;
  findByLanguageAndLevel(language: LearningLanguage, level: CEFRLevel): Promise<Course | null>;
  listSummaries(): Promise<CourseSummary[]>;
  findLessonById(lessonId: string): Promise<Lesson | null>;
}

export const COURSE_REPOSITORY = Symbol('CourseRepository');
