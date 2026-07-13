import { describe, expect, it } from 'vitest';
import type { Lesson } from '@lingoleap/core';
import type { CourseRepository } from '../ports/course.repository';
import type { ProgressRepository } from '../ports/progress.repository';
import type { StatsRepository } from '../ports/stats.repository';
import type { UserStats } from '../../domain/user-stats';
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

class FakeStats implements StatsRepository {
  constructor(private readonly stored: UserStats | null) {}
  saved: UserStats[] = [];
  async findByUser(): Promise<UserStats | null> { return this.stored; }
  async save(stats: UserStats): Promise<void> { this.saved.push(stats); }
}

const NOW = '2026-07-12T12:00:00.000Z';
const courses = new FakeCourses();
const progress = new FakeProgress();

describe('CompleteLessonUseCase', () => {
  it('registra la lección completada para el usuario', async () => {
    const progress = new FakeProgress();
    const stats = new FakeStats(null);
    const useCase = new CompleteLessonUseCase({ courses: new FakeCourses(), progress, stats, now: () => NOW });
    await useCase.execute({ userId: 'u1', lessonId: 'l1', errorCount: 0, clientDate: '2026-07-12' });
    expect(progress.completed).toEqual([{ userId: 'u1', lessonId: 'l1' }]);
  });

  it('lanza LessonNotFoundError si la lección no existe', async () => {
    const useCase = new CompleteLessonUseCase({
      courses: new FakeCourses(), progress: new FakeProgress(), stats: new FakeStats(null), now: () => NOW
    });
    await expect(
      useCase.execute({ userId: 'u1', lessonId: 'nope', errorCount: 0, clientDate: '2026-07-12' })
    ).rejects.toThrow(LessonNotFoundError);
  });

  it('primera lección: 15 XP sin errores, racha 1, corazones intactos', async () => {
    const stats = new FakeStats(null);
    const useCase = new CompleteLessonUseCase({ courses, progress, stats, now: () => NOW });
    const rewards = await useCase.execute({ userId: 'u1', lessonId: lesson.id, errorCount: 0, clientDate: '2026-07-12' });
    expect(rewards).toEqual({ xpEarned: 15, totalXp: 15, level: 1, streakCount: 1, freezeUsed: false, hearts: 5 });
    expect(stats.saved[0]).toMatchObject({ xp: 15, streakCount: 1, lastLessonDate: '2026-07-12', hearts: 5 });
  });

  it('con 3 errores: 12 XP y pierde 3 corazones', async () => {
    const stats = new FakeStats(null);
    const useCase = new CompleteLessonUseCase({ courses, progress, stats, now: () => NOW });
    const rewards = await useCase.execute({ userId: 'u1', lessonId: lesson.id, errorCount: 3, clientDate: '2026-07-12' });
    expect(rewards.xpEarned).toBe(12);
    expect(rewards.hearts).toBe(2);
  });

  it('extiende la racha de ayer y usa la fecha del servidor si la del cliente es inválida', async () => {
    const stats = new FakeStats({
      userId: 'u1', xp: 90, streakCount: 4, lastLessonDate: '2026-07-11',
      hearts: 5, heartsUpdatedAt: NOW, gems: 0, streakFreezes: 0
    });
    const useCase = new CompleteLessonUseCase({ courses, progress, stats, now: () => NOW });
    const rewards = await useCase.execute({ userId: 'u1', lessonId: lesson.id, errorCount: 0, clientDate: 'no-es-fecha' });
    expect(rewards.streakCount).toBe(5); // el servidor usa 2026-07-12 (UTC de NOW); ayer fue 07-11
    expect(rewards.totalXp).toBe(105);
    expect(rewards.level).toBe(2);
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
