import { describe, expect, it } from 'vitest';
import type { LeagueDivision } from '@lingoleap/core';
import type { LeagueRepository } from '../ports/league.repository';
import type { LeagueCohort, LeagueMembership } from '../../domain/league';
import type { UserStats } from '../../domain/user-stats';
import type { StatsRepository } from '../ports/stats.repository';
import { CloseLeagueWeekUseCase } from './close-league-week.use-case';
import { GetLeagueUseCase } from './get-league.use-case';

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

const NOW = '2026-07-16T12:00:00.000Z'; // semana actual: 2026-07-13

function makeUseCase(league: FakeLeague, stats: FakeStatsMap) {
  const closeWeek = new CloseLeagueWeekUseCase({ league, stats, now: () => NOW });
  return new GetLeagueUseCase({ league, closeWeek, now: () => NOW });
}

describe('GetLeagueUseCase', () => {
  it('devuelve bronce y cohorte null para quien nunca jugó', async () => {
    const useCase = makeUseCase(new FakeLeague(), new FakeStatsMap());
    expect(await useCase.execute('u1')).toEqual({ division: 'bronze', cohort: null });
  });

  it('devuelve la tabla ordenada con posiciones, zonas y isMe', async () => {
    const league = new FakeLeague();
    const cohort = await league.createCohort('silver', '2026-07-13');
    await league.saveMembership({ cohortId: cohort.id, userId: 'u1', displayName: 'ana', weeklyXp: 10, lastXpAt: NOW, result: null });
    await league.saveMembership({ cohortId: cohort.id, userId: 'u2', displayName: 'bo', weeklyXp: 40, lastXpAt: NOW, result: null });
    const summary = await makeUseCase(league, new FakeStatsMap()).execute('u1');
    expect(summary.division).toBe('silver');
    expect(summary.cohort?.standings).toEqual([
      { position: 1, displayName: 'bo', weeklyXp: 40, isMe: false, zone: 'promotion' },
      { position: 2, displayName: 'ana', weeklyXp: 10, isMe: true, zone: 'promotion' }
    ]);
  });

  it('cierra perezosamente la cohorte vencida antes de responder', async () => {
    const league = new FakeLeague();
    const stats = new FakeStatsMap();
    const old = await league.createCohort('bronze', '2026-07-06');
    await league.saveMembership({ cohortId: old.id, userId: 'u1', displayName: 'ana', weeklyXp: 30, lastXpAt: NOW, result: null });
    const summary = await makeUseCase(league, stats).execute('u1');
    expect(league.cohorts[0].closedAt).toBe(NOW);           // cerrada al leer
    expect(summary).toEqual({ division: 'silver', cohort: null }); // ascendió, sin XP esta semana
    expect(stats.rows.get('u1')?.gems).toBe(20);            // podio acreditado
  });
});
