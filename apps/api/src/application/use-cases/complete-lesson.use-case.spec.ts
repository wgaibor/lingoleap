import { describe, expect, it } from 'vitest';
import type { Lesson, LeagueDivision } from '@lingoleap/core';
import type { AchievementsRepository } from '../ports/achievements.repository';
import type { CourseRepository } from '../ports/course.repository';
import type { ProgressRepository } from '../ports/progress.repository';
import type { StatsRepository } from '../ports/stats.repository';
import type { LeagueRepository } from '../ports/league.repository';
import type { LeagueCohort, LeagueMembership } from '../../domain/league';
import type { UserStats } from '../../domain/user-stats';
import { LessonNotFoundError } from '../../domain/errors';
import { CompleteLessonUseCase } from './complete-lesson.use-case';
import { CloseLeagueWeekUseCase } from './close-league-week.use-case';
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

class FakeLeague implements LeagueRepository {
  cohorts: LeagueCohort[] = [];
  memberships: LeagueMembership[] = [];
  private nextId = 1;
  async findMembership(userId: string, weekStart: string) {
    const cohortIds = new Set(this.cohorts.filter((c) => c.weekStart === weekStart).map((c) => c.id));
    const m = this.memberships.find((x) => x.userId === userId && cohortIds.has(x.cohortId)) ?? null;
    if (!m) return null;
    return { cohort: this.cohorts.find((c) => c.id === m.cohortId)!, membership: m };
  }
  async findLatestClosedMembership(userId: string) {
    const closed = this.memberships
      .map((m) => ({ membership: m, cohort: this.cohorts.find((c) => c.id === m.cohortId)! }))
      .filter((x) => x.membership.userId === userId && x.cohort.closedAt !== null)
      .sort((a, b) => b.cohort.weekStart.localeCompare(a.cohort.weekStart));
    return closed[0] ?? null;
  }
  async findOpenCohort(division: LeagueDivision, weekStart: string, maxSize: number) {
    return this.cohorts.find(
      (c) => c.division === division && c.weekStart === weekStart && c.closedAt === null &&
        this.memberships.filter((m) => m.cohortId === c.id).length < maxSize
    ) ?? null;
  }
  async createCohort(division: LeagueDivision, weekStart: string) {
    const cohort = { id: `cohort-${this.nextId++}`, division, weekStart, closedAt: null };
    this.cohorts.push(cohort);
    return cohort;
  }
  async saveMembership(membership: LeagueMembership) {
    const i = this.memberships.findIndex(
      (m) => m.cohortId === membership.cohortId && m.userId === membership.userId
    );
    if (i >= 0) this.memberships[i] = membership;
    else this.memberships.push(membership);
  }
  async listMemberships(cohortId: string) {
    return this.memberships.filter((m) => m.cohortId === cohortId);
  }
  async listExpiredOpenCohorts(currentWeekStart: string) {
    return this.cohorts.filter((c) => c.closedAt === null && c.weekStart < currentWeekStart);
  }
  async closeCohort(cohortId: string, closedAt: string) {
    const c = this.cohorts.find((x) => x.id === cohortId);
    if (c) c.closedAt = closedAt;
  }
}

const NOW = '2026-07-12T12:00:00.000Z';
const courses = new FakeCourses();
const progress = new FakeProgress();

function makeUseCase(overrides: Partial<{
  courses: CourseRepository; progress: ProgressRepository; stats: StatsRepository;
  achievements: AchievementsRepository; league: LeagueRepository; now: () => string;
}> = {}) {
  return new CompleteLessonUseCase({
    courses: overrides.courses ?? courses,
    progress: overrides.progress ?? progress,
    stats: overrides.stats ?? new FakeStats(null),
    achievements: overrides.achievements ?? new FakeAchievements(),
    league: overrides.league ?? new FakeLeague(),
    now: overrides.now ?? (() => NOW)
  });
}

describe('CompleteLessonUseCase', () => {
  it('registra la lección completada para el usuario', async () => {
    const progress = new FakeProgress();
    const stats = new FakeStats(null);
    const useCase = new CompleteLessonUseCase({
      courses: new FakeCourses(), progress, stats, achievements: new FakeAchievements(),
      league: new FakeLeague(), now: () => NOW
    });
    await useCase.execute({ userId: 'u1', userEmail: 'ana@test.com', lessonId: 'l1', errorCount: 0, clientDate: '2026-07-12' });
    expect(progress.completed).toEqual([{ userId: 'u1', lessonId: 'l1' }]);
  });

  it('lanza LessonNotFoundError si la lección no existe', async () => {
    const useCase = new CompleteLessonUseCase({
      courses: new FakeCourses(), progress: new FakeProgress(), stats: new FakeStats(null),
      achievements: new FakeAchievements(), league: new FakeLeague(), now: () => NOW
    });
    await expect(
      useCase.execute({ userId: 'u1', userEmail: 'ana@test.com', lessonId: 'nope', errorCount: 0, clientDate: '2026-07-12' })
    ).rejects.toThrow(LessonNotFoundError);
  });

  it('primera lección: 15 XP sin errores, racha 1, corazones intactos, sin logros nuevos', async () => {
    const stats = new FakeStats(null);
    const useCase = new CompleteLessonUseCase({
      courses, progress, stats, achievements: new FakeAchievements(), league: new FakeLeague(), now: () => NOW
    });
    const rewards = await useCase.execute({ userId: 'u1', userEmail: 'ana@test.com', lessonId: lesson.id, errorCount: 0, clientDate: '2026-07-12' });
    expect(rewards).toEqual({
      xpEarned: 15, totalXp: 15, level: 1, streakCount: 1, freezeUsed: false, hearts: 5,
      gemsEarned: 0, achievementsUnlocked: []
    });
    expect(stats.saved[0]).toMatchObject({ xp: 15, streakCount: 1, lastLessonDate: '2026-07-12', hearts: 5, gems: 0 });
  });

  it('con 3 errores: 12 XP y pierde 3 corazones', async () => {
    const stats = new FakeStats(null);
    const useCase = new CompleteLessonUseCase({
      courses, progress, stats, achievements: new FakeAchievements(), league: new FakeLeague(), now: () => NOW
    });
    const rewards = await useCase.execute({ userId: 'u1', userEmail: 'ana@test.com', lessonId: lesson.id, errorCount: 3, clientDate: '2026-07-12' });
    expect(rewards.xpEarned).toBe(12);
    expect(rewards.hearts).toBe(2);
  });

  it('extiende la racha de ayer y usa la fecha del servidor si la del cliente es inválida', async () => {
    const stats = new FakeStats({
      userId: 'u1', xp: 90, streakCount: 4, lastLessonDate: '2026-07-11',
      hearts: 5, heartsUpdatedAt: NOW, gems: 0, streakFreezes: 0
    });
    const useCase = new CompleteLessonUseCase({
      courses, progress, stats, achievements: new FakeAchievements(), league: new FakeLeague(), now: () => NOW
    });
    const rewards = await useCase.execute({ userId: 'u1', userEmail: 'ana@test.com', lessonId: lesson.id, errorCount: 0, clientDate: 'no-es-fecha' });
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
    const useCase = new CompleteLessonUseCase({ courses, progress, stats, achievements, league: new FakeLeague(), now: () => NOW });
    const rewards = await useCase.execute({ userId: 'u1', userEmail: 'ana@test.com', lessonId: lesson.id, errorCount: 0, clientDate: '2026-07-12' });
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
    const useCase = new CompleteLessonUseCase({ courses, progress, stats, achievements, league: new FakeLeague(), now: () => NOW });
    const rewards = await useCase.execute({ userId: 'u1', userEmail: 'ana@test.com', lessonId: lesson.id, errorCount: 0, clientDate: '2026-07-12' });
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
    const useCase = new CompleteLessonUseCase({ courses, progress, stats, achievements, league: new FakeLeague(), now: () => NOW });

    const first = await useCase.execute({ userId: 'u1', userEmail: 'ana@test.com', lessonId: lesson.id, errorCount: 0, clientDate: '2026-07-12' });
    expect(first.totalXp).toBe(15);
    expect(first.gemsEarned).toBe(5);

    // El cliente reintenta la MISMA petición (mismo lessonId, errorCount, fecha).
    const retry = await useCase.execute({ userId: 'u1', userEmail: 'ana@test.com', lessonId: lesson.id, errorCount: 0, clientDate: '2026-07-12' });
    expect(retry.totalXp).toBe(30); // documentado: se duplica (15 + 15), no se mantiene en 15
    expect(retry.gemsEarned).toBe(5); // documentado: se vuelve a otorgar, no es 0
  });

  it('crea la membresía de liga en bronce con el XP de la primera lección de la semana', async () => {
    const league = new FakeLeague();
    const useCase = makeUseCase({ league, now: () => '2026-07-16T12:00:00.000Z' });
    await useCase.execute({ userId: 'u1', userEmail: 'ana@test.com', lessonId: lesson.id, errorCount: 0, clientDate: '2026-07-16' });
    expect(league.cohorts).toHaveLength(1);
    expect(league.cohorts[0]).toMatchObject({ division: 'bronze', weekStart: '2026-07-13' });
    expect(league.memberships[0]).toMatchObject({ displayName: 'ana', weeklyXp: 15, result: null });
  });

  it('acumula XP en la membresía existente de la semana sin crear otra cohorte', async () => {
    const league = new FakeLeague();
    const useCase = makeUseCase({ league, now: () => '2026-07-16T12:00:00.000Z' });
    await useCase.execute({ userId: 'u1', userEmail: 'ana@test.com', lessonId: lesson.id, errorCount: 0, clientDate: '2026-07-16' });
    await useCase.execute({ userId: 'u1', userEmail: 'ana@test.com', lessonId: lesson.id, errorCount: 5, clientDate: '2026-07-16' });
    expect(league.cohorts).toHaveLength(1);
    expect(league.memberships).toHaveLength(1);
    expect(league.memberships[0].weeklyXp).toBe(25); // 15 + 10
  });

  it('usa la semana ISO del UTC del servidor para la liga, no la fecha del cliente (evita cohortes retroactivas)', async () => {
    // NOW = 2026-07-16T12:00:00.000Z -> semana actual (lunes) = 2026-07-13.
    // Un cliente que envía una fecha atrasada (p. ej. una semana antes) no debe
    // poder crear/unirse a una cohorte de una semana pasada.
    const league = new FakeLeague();
    const useCase = makeUseCase({ league, now: () => '2026-07-16T12:00:00.000Z' });
    await useCase.execute({
      userId: 'u1', userEmail: 'ana@test.com', lessonId: lesson.id, errorCount: 0,
      clientDate: '2026-07-06'
    });
    expect(league.cohorts).toHaveLength(1);
    expect(league.cohorts[0]).toMatchObject({ weekStart: '2026-07-13' });
  });

  it('cierra en frío una cohorte expirada pendiente de cierre antes de inscribir en la nueva semana, reflejando el ascenso', async () => {
    // El usuario quedó 1º (único miembro) en una cohorte bronce ya vencida
    // pero que nadie cerró todavía (sin cron, cierre perezoso). Al completar
    // una lección en la semana nueva, el use case debe cerrar esa cohorte
    // vieja (acreditando las gemas del podio una sola vez) y crear la
    // membresía nueva ya en la división ascendida (silver), no en bronce.
    const league = new FakeLeague();
    const stats = new FakeStats({
      userId: 'u1', xp: 0, streakCount: 0, lastLessonDate: null,
      hearts: 5, heartsUpdatedAt: NOW, gems: 0, streakFreezes: 0
    });
    const oldCohort = await league.createCohort('bronze', '2026-07-06');
    await league.saveMembership({
      cohortId: oldCohort.id, userId: 'u1', displayName: 'ana', weeklyXp: 50, lastXpAt: '2026-07-08T00:00:00.000Z', result: null
    });
    const closeWeek = new CloseLeagueWeekUseCase({ league, stats, now: () => '2026-07-16T12:00:00.000Z' });
    const useCase = new CompleteLessonUseCase({
      courses, progress: new FakeProgress(), stats, achievements: new FakeAchievements(),
      league, closeWeek, now: () => '2026-07-16T12:00:00.000Z'
    });

    await useCase.execute({
      userId: 'u1', userEmail: 'ana@test.com', lessonId: lesson.id, errorCount: 0,
      clientDate: '2026-07-16'
    });

    expect(league.cohorts.find((c) => c.id === oldCohort.id)?.closedAt).not.toBeNull();
    const newMembership = league.memberships.find((m) => m.cohortId !== oldCohort.id && m.userId === 'u1');
    expect(newMembership).toBeDefined();
    const newCohort = league.cohorts.find((c) => c.id === newMembership!.cohortId);
    expect(newCohort).toMatchObject({ division: 'silver', weekStart: '2026-07-13' });

    const savedStats = stats.saved[stats.saved.length - 1];
    expect(savedStats.gems).toBe(20); // gemas de podio (1er lugar) acreditadas una sola vez
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
