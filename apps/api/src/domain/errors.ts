export abstract class DomainError extends Error {
  abstract readonly code: string;
}

export class CourseNotFoundError extends DomainError {
  readonly code = 'COURSE_NOT_FOUND';
  constructor(reference: string) {
    super(`Curso no encontrado: ${reference}`);
  }
}

export class LessonNotFoundError extends DomainError {
  readonly code = 'LESSON_NOT_FOUND';
  constructor(lessonId: string) {
    super(`Lección no encontrada: ${lessonId}`);
  }
}

export class InvalidContentError extends DomainError {
  readonly code = 'INVALID_CONTENT';
}

export class InsufficientGemsError extends DomainError {
  readonly code = 'INSUFFICIENT_GEMS';
}

export class StreakFreezeLimitReachedError extends DomainError {
  readonly code = 'STREAK_FREEZE_LIMIT_REACHED';
}
