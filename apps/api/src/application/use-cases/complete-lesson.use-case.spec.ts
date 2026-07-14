import { describe, expect, it } from 'vitest';
import type { Lesson } from '@lingoleap/core';
import type { AchievementsRepository } from '../ports/achievements.repository';
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

class FakeAchievements implements AchievementsRepository {
  unlocked: Set<string>;
  unlockedCalls: Array<{ userId: string; achievementId: string }> = [];
  constructor(initiallyUnlocked: string[] = []) { this.unlocked = new Set(initiallyUnlocked); }
  async listUnlockedIds(): Promise<string[]> { return [...this.unlocked]; }
  async unlock(userId: string, achievementId: string): Promise<void> {
    this.unlocked.add(achievementId);
    this.unlockedCalls.push({ userId, achievementId });
  }
}

const NOW = '2026-07-12T12:00:00.000Z';
const courses = new FakeCourses();
const progress = new FakeProgress();

describe('CompleteLessonUseCase', () => {
  it('registra la lección completada para el usuario', async () => {
    const progress = new FakeProgress();
    const stats = new FakeStats(null);
    const useCase = new CompleteLessonUseCase({
      courses: new FakeCourses(), progress, stats, achievements: new FakeAchievements(), now: () => NOW
    });
    await useCase.execute({ userId: 'u1', lessonId: 'l1', errorCount: 0, clientDate: '2026-07-12' });
    expect(progress.completed).toEqual([{ userId: 'u1', lessonId: 'l1' }]);
  });

  it('lanza LessonNotFoundError si la lección no existe', async () => {
    const useCase = new CompleteLessonUseCase({
      courses: new FakeCourses(), progress: new FakeProgress(), stats: new FakeStats(null),
      achievements: new FakeAchievements(), now: () => NOW
    });
    await expect(
      useCase.execute({ userId: 'u1', lessonId: 'nope', errorCount: 0, clientDate: '2026-07-12' })
    ).rejects.toThrow(LessonNotFoundError);
  });

  it('primera lección: 15 XP sin errores, racha 1, corazones intactos, sin logros nuevos', async () => {
    const stats = new FakeStats(null);
    const useCase = new CompleteLessonUseCase({
      courses, progress, stats, achievements: new FakeAchievements(), now: () => NOW
    });
    const rewards = await useCase.execute({ userId: 'u1', lessonId: lesson.id, errorCount: 0, clientDate: '2026-07-12' });
    expect(rewards).toEqual({
      xpEarned: 15, totalXp: 15, level: 1, streakCount: 1, freezeUsed: false, hearts: 5,
      gemsEarned: 0, achievementsUnlocked: []
    });
    expect(stats.saved[0]).toMatchObject({ xp: 15, streakCount: 1, lastLessonDate: '2026-07-12', hearts: 5, gems: 0 });
  });

  it('con 3 errores: 12 XP y pierde 3 corazones', async () => {
    const stats = new FakeStats(null);
    const useCase = new CompleteLessonUseCase({
      courses, progress, stats, achievements: new FakeAchievements(), now: () => NOW
    });
    const rewards = await useCase.execute({ userId: 'u1', lessonId: lesson.id, errorCount: 3, clientDate: '2026-07-12' });
    expect(rewards.xpEarned).toBe(12);
    expect(rewards.hearts).toBe(2);
  });

  it('extiende la racha de ayer y usa la fecha del servidor si la del cliente es inválida', async () => {
    const stats = new FakeStats({
      userId: 'u1', xp: 90, streakCount: 4, lastLessonDate: '2026-07-11',
      hearts: 5, heartsUpdatedAt: NOW, gems: 0, streakFreezes: 0
    });
    const useCase = new CompleteLessonUseCase({
      courses, progress, stats, achievements: new FakeAchievements(), now: () => NOW
    });
    const rewards = await useCase.execute({ userId: 'u1', lessonId: lesson.id, errorCount: 0, clientDate: 'no-es-fecha' });
    expect(rewards.streakCount).toBe(5); // el servidor usa 2026-07-12 (UTC de NOW); ayer fue 07-11
    expect(rewards.totalXp).toBe(105);
    expect(rewards.level).toBe(2);
  });

  it('otorga el logro de 10 lecciones y sus gemas al completar la décima', async () => {
    const progress = new FakeProgress();
    for (let i = 0; i < 9; i++) {
      await progress.markLessonCompleted('u1', `seed-${i}`);
    }
    const stats = new FakeStats(null);
    const achievements = new FakeAchievements();
    const useCase = new CompleteLessonUseCase({ courses, progress, stats, achievements, now: () => NOW });
    const rewards = await useCase.execute({ userId: 'u1', lessonId: lesson.id, errorCount: 0, clientDate: '2026-07-12' });
    expect(rewards.gemsEarned).toBe(5);
    expect(rewards.achievementsUnlocked).toEqual([{ id: 'lessons-10', category: 'lessons', threshold: 10, gems: 5 }]);
    expect(stats.saved[0].gems).toBe(5);
    expect(achievements.unlockedCalls).toEqual([{ userId: 'u1', achievementId: 'lessons-10' }]);
  });

  it('no vuelve a otorgar un logro que el usuario ya tenía desbloqueado', async () => {
    const progress = new FakeProgress();
    for (let i = 0; i < 10; i++) {
      await progress.markLessonCompleted('u1', `seed-${i}`);
    }
    const stats = new FakeStats({
      userId: 'u1', xp: 0, streakCount: 0, lastLessonDate: null,
      hearts: 5, heartsUpdatedAt: NOW, gems: 5, streakFreezes: 0
    });
    const achievements = new FakeAchievements(['lessons-10']);
    const useCase = new CompleteLessonUseCase({ courses, progress, stats, achievements, now: () => NOW });
    const rewards = await useCase.execute({ userId: 'u1', lessonId: lesson.id, errorCount: 0, clientDate: '2026-07-12' });
    expect(rewards.gemsEarned).toBe(0);
    expect(rewards.achievementsUnlocked).toEqual([]);
    expect(stats.saved[0].gems).toBe(5);
  });

  it('[deuda documentada, ver BITACORA Fase 3B] un reintento tras un stats.save exitoso vuelve a otorgar XP y, si el logro no llegó a persistirse, también gemas', async () => {
    // No hay clave de idempotencia todavía (deuda técnica aceptada a propósito,
    // ver BITACORA): si el cliente reintenta POST /complete después de que el
    // servidor ya persistió stats.save (p. ej. la respuesta se perdió en la
    // red, o el logro que se cruza en este intento nunca llega a persistirse
    // en user_achievements), execute() vuelve a leer un `stored` que ya
    // refleja el primer otorgamiento y no tiene forma de saber que la
    // petición ya se procesó, así que XP y (si el logro no quedó registrado)
    // las gemas del logro se otorgan una segunda vez.
    class PersistingStats implements StatsRepository {
      stored: UserStats | null = null;
      saved: UserStats[] = [];
      async findByUser(): Promise<UserStats | null> { return this.stored; }
      async save(stats: UserStats): Promise<void> { this.stored = stats; this.saved.push(stats); }
    }
    class BrokenAchievements implements AchievementsRepository {
      // Simula que el `unlock` nunca llega a persistirse (p. ej. la conexión
      // cae justo después de que stats.save comprometió los datos).
      async listUnlockedIds(): Promise<string[]> { return []; }
      async unlock(): Promise<void> {}
    }

    const progress = new FakeProgress();
    for (let i = 0; i < 9; i++) {
      await progress.markLessonCompleted('u1', `seed-${i}`);
    }
    const stats = new PersistingStats();
    const achievements = new BrokenAchievements();
    const useCase = new CompleteLessonUseCase({ courses, progress, stats, achievements, now: () => NOW });

    const first = await useCase.execute({ userId: 'u1', lessonId: lesson.id, errorCount: 0, clientDate: '2026-07-12' });
    expect(first.totalXp).toBe(15);
    expect(first.gemsEarned).toBe(5);

    // El cliente reintenta la MISMA petición (mismo lessonId, errorCount, fecha).
    const retry = await useCase.execute({ userId: 'u1', lessonId: lesson.id, errorCount: 0, clientDate: '2026-07-12' });
    expect(retry.totalXp).toBe(30); // documentado: se duplica (15 + 15), no se mantiene en 15
    expect(retry.gemsEarned).toBe(5); // documentado: se vuelve a otorgar, no es 0
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
