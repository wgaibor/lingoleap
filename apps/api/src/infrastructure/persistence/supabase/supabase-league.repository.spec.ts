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
});
