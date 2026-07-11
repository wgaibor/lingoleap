import { describe, expect, it } from 'vitest';
import type { Lesson } from '@lingoleap/core';
import type { CourseRepository } from '../ports/course.repository';
import type { ProgressRepository } from '../ports/progress.repository';
import { LessonNotFoundError } from '../../domain/errors';
import { CompleteLessonUseCase } from './complete-lesson.use-case';
import { GetProgressUseCase } from './get-progress.use-case';

const lesson: Lesson = { id: 'l1', title: 'Lección 1', position: 1, exercises: [
  { id: 'e1', type: 'match-pairs', pairs: [{ left: 'water', right: 'agua' }] }
] };

class FakeCourses implements CourseRepository {
  async saveCourse(): Promise<void> {}
  async findByLanguageAndLevel(): Promise<null> { return null; }
  async listSummaries(): Promise<[]> { return []; }
  async findLessonById(id: string): Promise<Lesson | null> { return id === 'l1' ? lesson : null; }
}

class FakeProgress implements ProgressRepository {
  completed: Array<{ userId: string; lessonId: string }> = [];
  async markLessonCompleted(userId: string, lessonId: string): Promise<void> {
    this.completed.push({ userId, lessonId });
  }
  async listCompletedLessonIds(userId: string): Promise<string[]> {
    return this.completed.filter((c) => c.userId === userId).map((c) => c.lessonId);
  }
}

describe('CompleteLessonUseCase', () => {
  it('registra la lección completada para el usuario', async () => {
    const progress = new FakeProgress();
    const useCase = new CompleteLessonUseCase({ courses: new FakeCourses(), progress });
    await useCase.execute('u1', 'l1');
    expect(progress.completed).toEqual([{ userId: 'u1', lessonId: 'l1' }]);
  });

  it('lanza LessonNotFoundError si la lección no existe', async () => {
    const useCase = new CompleteLessonUseCase({ courses: new FakeCourses(), progress: new FakeProgress() });
    await expect(useCase.execute('u1', 'nope')).rejects.toThrow(LessonNotFoundError);
  });
});

describe('GetProgressUseCase', () => {
  it('devuelve los ids completados del usuario', async () => {
    const progress = new FakeProgress();
    await progress.markLessonCompleted('u1', 'l1');
    await progress.markLessonCompleted('u2', 'l9');
    const useCase = new GetProgressUseCase(progress);
    await expect(useCase.execute('u1')).resolves.toEqual(['l1']);
  });
});
