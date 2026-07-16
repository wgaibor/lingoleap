import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LeagueDivision } from '@lingoleap/core';
import { weekStartOf } from '@lingoleap/core';
import type { AuthenticatedUser, AuthVerifier } from '../application/ports/auth-verifier.port';
import { AUTH_VERIFIER } from '../application/ports/auth-verifier.port';
import { LEAGUE_REPOSITORY, type LeagueRepository } from '../application/ports/league.repository';
import { STATS_REPOSITORY, type StatsRepository } from '../application/ports/stats.repository';
import type { LeagueCohort, LeagueMembership } from '../domain/league';
import type { UserStats } from '../domain/user-stats';
import { ContentApiModule } from './content-api.module';
import { DomainExceptionFilter } from './domain-exception.filter';

class FakeVerifier implements AuthVerifier {
  async verifyToken(token: string): Promise<AuthenticatedUser | null> {
    return token === 'valid-token' ? { id: 'user-1', email: 'a@b.com' } : null;
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
    const cohort = this.cohorts.find((c) => c.id === cohortId);
    if (cohort) cohort.closedAt = closedAt;
  }
}

class FakeStats implements StatsRepository {
  rows = new Map<string, UserStats>();
  async findByUser(userId: string): Promise<UserStats | null> { return this.rows.get(userId) ?? null; }
  async save(stats: UserStats): Promise<void> { this.rows.set(stats.userId, stats); }
}

describe('API de liga', () => {
  let app: INestApplication;
  const league = new FakeLeague();
  const stats = new FakeStats();

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
    process.env.PEXELS_API_KEY = 'stub';
    const moduleRef = await Test.createTestingModule({ imports: [ContentApiModule] })
      .overrideProvider(AUTH_VERIFIER).useValue(new FakeVerifier())
      .overrideProvider(LEAGUE_REPOSITORY).useValue(league)
      .overrideProvider(STATS_REPOSITORY).useValue(stats)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    league.cohorts = [];
    league.memberships = [];
    stats.rows.clear();
  });

  it('rechaza sin token', async () => {
    await request(app.getHttpServer()).get('/me/league').expect(401);
  });

  it('devuelve bronce sin cohorte para un usuario nuevo', async () => {
    const res = await request(app.getHttpServer())
      .get('/me/league')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
    expect(res.body).toEqual({ division: 'bronze', cohort: null });
  });

  it('devuelve la tabla de la cohorte activa con el usuario marcado', async () => {
    const cohort = await league.createCohort('bronze', weekStartOf(new Date().toISOString().slice(0, 10)));
    await league.saveMembership({ cohortId: cohort.id, userId: 'user-1', displayName: 'ana', weeklyXp: 15, lastXpAt: new Date().toISOString(), result: null });
    const res = await request(app.getHttpServer())
      .get('/me/league')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
    expect(res.body.cohort.standings[0]).toMatchObject({ position: 1, displayName: 'ana', isMe: true });
  });

  it('cierra perezosamente una cohorte vencida y acredita el podio', async () => {
    const cohort = await league.createCohort('bronze', '2026-01-05'); // semana pasada segura
    await league.saveMembership({ cohortId: cohort.id, userId: 'user-1', displayName: 'ana', weeklyXp: 30, lastXpAt: '2026-01-06T10:00:00.000Z', result: null });
    const res = await request(app.getHttpServer())
      .get('/me/league')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
    expect(res.body).toEqual({ division: 'silver', cohort: null });
    expect(stats.rows.get('user-1')?.gems).toBe(20);
  });
});
