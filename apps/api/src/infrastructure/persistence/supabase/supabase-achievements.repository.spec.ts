import { describe, expect, it, vi } from 'vitest';
import { SupabaseAchievementsRepository } from './supabase-achievements.repository';

function clientWith(selectResult: { data: unknown; error: { message: string } | null }) {
  const eq = vi.fn().mockResolvedValue(selectResult);
  const select = vi.fn().mockReturnValue({ eq });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ select, upsert });
  return { client: { from } as never, upsert };
}

describe('SupabaseAchievementsRepository', () => {
  it('lista los ids de logros desbloqueados', async () => {
    const { client } = clientWith({
      data: [{ achievement_id: 'streak-3' }, { achievement_id: 'lessons-10' }],
      error: null
    });
    const repo = new SupabaseAchievementsRepository(client);
    await expect(repo.listUnlockedIds('u1')).resolves.toEqual(['streak-3', 'lessons-10']);
  });

  it('devuelve [] si el usuario no tiene logros', async () => {
    const { client } = clientWith({ data: [], error: null });
    const repo = new SupabaseAchievementsRepository(client);
    await expect(repo.listUnlockedIds('u1')).resolves.toEqual([]);
  });

  it('desbloquea con upsert idempotente en snake_case', async () => {
    const { client, upsert } = clientWith({ data: [], error: null });
    const repo = new SupabaseAchievementsRepository(client);
    await repo.unlock('u1', 'streak-3', '2026-07-14T00:00:00.000Z');
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'u1', achievement_id: 'streak-3', unlocked_at: '2026-07-14T00:00:00.000Z' },
      { onConflict: 'user_id,achievement_id', ignoreDuplicates: true }
    );
  });
});
