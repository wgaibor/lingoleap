import { describe, expect, it, vi } from 'vitest';
import { SupabaseStatsRepository } from './supabase-stats.repository';

const row = {
  user_id: 'u1', xp: 120, streak_count: 3, last_lesson_date: '2026-07-12',
  hearts: 4, hearts_updated_at: '2026-07-12T10:00:00.000Z', gems: 0, streak_freezes: 0
};

function clientWith(result: { data: unknown; error: { message: string } | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ select, upsert });
  return { client: { from } as never, from, upsert };
}

describe('SupabaseStatsRepository', () => {
  it('mapea la fila snake_case al dominio', async () => {
    const { client } = clientWith({ data: row, error: null });
    const repo = new SupabaseStatsRepository(client);
    const stats = await repo.findByUser('u1');
    expect(stats).toEqual({
      userId: 'u1', xp: 120, streakCount: 3, lastLessonDate: '2026-07-12',
      hearts: 4, heartsUpdatedAt: '2026-07-12T10:00:00.000Z', gems: 0, streakFreezes: 0
    });
  });

  it('devuelve null si el usuario no tiene fila', async () => {
    const { client } = clientWith({ data: null, error: null });
    const repo = new SupabaseStatsRepository(client);
    expect(await repo.findByUser('u1')).toBeNull();
  });

  it('guarda con upsert en snake_case', async () => {
    const { client, upsert } = clientWith({ data: null, error: null });
    const repo = new SupabaseStatsRepository(client);
    await repo.save({
      userId: 'u1', xp: 120, streakCount: 3, lastLessonDate: '2026-07-12',
      hearts: 4, heartsUpdatedAt: '2026-07-12T10:00:00.000Z', gems: 0, streakFreezes: 0
    });
    expect(upsert).toHaveBeenCalledWith(row);
  });
});
