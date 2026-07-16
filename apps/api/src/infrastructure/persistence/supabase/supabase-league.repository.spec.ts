import { describe, expect, it, vi } from 'vitest';
import { SupabaseLeagueRepository } from './supabase-league.repository';

const cohortRow = {
  id: 'c1', division: 'bronze', week_start: '2026-07-13', closed_at: null
};
const membershipRow = {
  cohort_id: 'c1', user_id: 'u1', display_name: 'ana', weekly_xp: 30,
  last_xp_at: '2026-07-15T10:00:00.000Z', result: null,
  cohort: cohortRow
};

type QueryResult = { data: unknown; error: { message: string } | null };

function clientReturning(result: QueryResult) {
  const terminal = vi.fn().mockResolvedValue(result);
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'lt', 'insert', 'update', 'upsert', 'single']) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  builder.then = (resolve: (r: QueryResult) => unknown) => terminal().then(resolve);
  const from = vi.fn().mockReturnValue(builder);
  return { client: { from } as never, from, builder };
}

describe('SupabaseLeagueRepository', () => {
  it('findMembership mapea la fila con su cohorte al dominio', async () => {
    const { client } = clientReturning({ data: [membershipRow], error: null });
    const repo = new SupabaseLeagueRepository(client);
    const found = await repo.findMembership('u1', '2026-07-13');
    expect(found).toEqual({
      cohort: { id: 'c1', division: 'bronze', weekStart: '2026-07-13', closedAt: null },
      membership: {
        cohortId: 'c1', userId: 'u1', displayName: 'ana', weeklyXp: 30,
        lastXpAt: '2026-07-15T10:00:00.000Z', result: null
      }
    });
  });

  it('findMembership devuelve null si no hay membresía de esa semana', async () => {
    const { client } = clientReturning({ data: [], error: null });
    const repo = new SupabaseLeagueRepository(client);
    expect(await repo.findMembership('u1', '2026-07-13')).toBeNull();
  });

  it('findLatestClosedMembership devuelve la cerrada más reciente', async () => {
    const closedOld = {
      ...membershipRow, result: 'stayed',
      cohort: { id: 'c0', division: 'bronze', week_start: '2026-06-29', closed_at: '2026-07-06T00:05:00.000Z' }
    };
    const closedNew = {
      ...membershipRow, cohort_id: 'c2', result: 'promoted',
      cohort: { id: 'c2', division: 'bronze', week_start: '2026-07-06', closed_at: '2026-07-13T00:05:00.000Z' }
    };
    const { client } = clientReturning({ data: [closedOld, closedNew, membershipRow], error: null });
    const repo = new SupabaseLeagueRepository(client);
    const found = await repo.findLatestClosedMembership('u1');
    expect(found?.cohort.id).toBe('c2');
    expect(found?.membership.result).toBe('promoted');
  });

  it('saveMembership hace upsert en snake_case', async () => {
    const { client, builder } = clientReturning({ data: null, error: null });
    const repo = new SupabaseLeagueRepository(client);
    await repo.saveMembership({
      cohortId: 'c1', userId: 'u1', displayName: 'ana', weeklyXp: 45,
      lastXpAt: '2026-07-15T12:00:00.000Z', result: null
    });
    expect(builder.upsert).toHaveBeenCalledWith({
      cohort_id: 'c1', user_id: 'u1', display_name: 'ana', weekly_xp: 45,
      last_xp_at: '2026-07-15T12:00:00.000Z', result: null
    });
  });

  it('findOpenCohort devuelve la primera cohorte cuyo conteo embebido está debajo de maxSize', async () => {
    const full = { ...cohortRow, id: 'c1', league_memberships: [{ count: 30 }] };
    const open = { ...cohortRow, id: 'c2', league_memberships: [{ count: 3 }] };
    const { client } = clientReturning({ data: [full, open], error: null });
    const repo = new SupabaseLeagueRepository(client);
    const found = await repo.findOpenCohort('bronze', '2026-07-13', 30);
    expect(found).toEqual({ id: 'c2', division: 'bronze', weekStart: '2026-07-13', closedAt: null });
  });

  it('findOpenCohort devuelve null si todas las cohortes están llenas o no hay resultados', async () => {
    const full = { ...cohortRow, id: 'c1', league_memberships: [{ count: 30 }] };
    const { client: clientFull } = clientReturning({ data: [full], error: null });
    const repoFull = new SupabaseLeagueRepository(clientFull);
    expect(await repoFull.findOpenCohort('bronze', '2026-07-13', 30)).toBeNull();

    const { client: clientEmpty } = clientReturning({ data: [], error: null });
    const repoEmpty = new SupabaseLeagueRepository(clientEmpty);
    expect(await repoEmpty.findOpenCohort('bronze', '2026-07-13', 30)).toBeNull();
  });

  it('findOpenCohort trata un embed league_memberships ausente o vacío como conteo 0', async () => {
    const missingEmbed = { ...cohortRow, id: 'c1', league_memberships: [] };
    const { client } = clientReturning({ data: [missingEmbed], error: null });
    const repo = new SupabaseLeagueRepository(client);
    const found = await repo.findOpenCohort('bronze', '2026-07-13', 30);
    expect(found).toEqual({ id: 'c1', division: 'bronze', weekStart: '2026-07-13', closedAt: null });
  });
});
