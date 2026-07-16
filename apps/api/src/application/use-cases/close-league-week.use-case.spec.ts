import { describe, expect, it } from 'vitest';
import type { LeagueDivision } from '@lingoleap/core';
import type { LeagueRepository } from '../ports/league.repository';
import type { LeagueCohort, LeagueMembership } from '../../domain/league';
import type { UserStats } from '../../domain/user-stats';
import type { StatsRepository } from '../ports/stats.repository';
import { CloseLeagueWeekUseCase } from './close-league-week.use-case';

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
    const cohort = this.cohorts.find((c) => c.id === cohortId);
    if (cohort) cohort.closedAt = closedAt;
  }
}

class FakeStatsMap implements StatsRepository {
  rows = new Map<string, UserStats>();
  async findByUser(userId: string): Promise<UserStats | null> { return this.rows.get(userId) ?? null; }
  async save(stats: UserStats): Promise<void> { this.rows.set(stats.userId, stats); }
}

const NOW = '2026-07-16T12:00:00.000Z'; // jueves; semana actual empieza 2026-07-13

describe('CloseLeagueWeekUseCase', () => {
  it('cierra la cohorte vencida: resultados, gemas al podio y closed_at', async () => {
    const league = new FakeLeague();
    const stats = new FakeStatsMap();
    const cohort = await league.createCohort('bronze', '2026-07-06'); // semana vencida
    await league.saveMembership({ cohortId: cohort.id, userId: 'u1', displayName: 'a', weeklyXp: 50, lastXpAt: NOW, result: null });
    await league.saveMembership({ cohortId: cohort.id, userId: 'u2', displayName: 'b', weeklyXp: 30, lastXpAt: NOW, result: null });
    const useCase = new CloseLeagueWeekUseCase({ league, stats, now: () => NOW });
    await useCase.execute();
    expect(league.cohorts[0].closedAt).toBe(NOW);
    expect(league.memberships.find((m) => m.userId === 'u1')?.result).toBe('promoted');
    expect(stats.rows.get('u1')?.gems).toBe(20);
    expect(stats.rows.get('u2')?.gems).toBe(10);
  });

  it('no toca cohortes de la semana en curso ni ya cerradas', async () => {
    const league = new FakeLeague();
    const stats = new FakeStatsMap();
    await league.createCohort('bronze', '2026-07-13'); // semana actual
    const closed = await league.createCohort('silver', '2026-07-06');
    await league.closeCohort(closed.id, '2026-07-13T00:05:00.000Z');
    const useCase = new CloseLeagueWeekUseCase({ league, stats, now: () => NOW });
    await useCase.execute();
    expect(league.cohorts[0].closedAt).toBeNull();
    expect(league.cohorts[1].closedAt).toBe('2026-07-13T00:05:00.000Z');
  });

  it('suma las gemas del podio sobre las gemas existentes del usuario', async () => {
    const league = new FakeLeague();
    const stats = new FakeStatsMap();
    stats.rows.set('u1', {
      userId: 'u1', xp: 100, streakCount: 1, lastLessonDate: '2026-07-10',
      hearts: 5, heartsUpdatedAt: NOW, gems: 7, streakFreezes: 0
    });
    const cohort = await league.createCohort('gold', '2026-07-06');
    await league.saveMembership({ cohortId: cohort.id, userId: 'u1', displayName: 'a', weeklyXp: 10, lastXpAt: NOW, result: null });
    const useCase = new CloseLeagueWeekUseCase({ league, stats, now: () => NOW });
    await useCase.execute();
    expect(stats.rows.get('u1')?.gems).toBe(27);
  });
});
