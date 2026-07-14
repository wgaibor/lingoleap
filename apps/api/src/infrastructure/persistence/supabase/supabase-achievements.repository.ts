import type { SupabaseClient } from '@supabase/supabase-js';
import type { AchievementsRepository } from '../../../application/ports/achievements.repository';

export class SupabaseAchievementsRepository implements AchievementsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listUnlockedIds(userId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from('user_achievements')
      .select('achievement_id')
      .eq('user_id', userId);
    if (error) {
      throw new Error(`Supabase select logros falló: ${error.message}`);
    }
    return (data ?? []).map((row) => (row as { achievement_id: string }).achievement_id);
  }

  async unlock(userId: string, achievementId: string, unlockedAt: string): Promise<void> {
    const { error } = await this.client
      .from('user_achievements')
      .upsert(
        { user_id: userId, achievement_id: achievementId, unlocked_at: unlockedAt },
        { onConflict: 'user_id,achievement_id', ignoreDuplicates: true }
      );
    if (error) {
      throw new Error(`Supabase upsert logro falló: ${error.message}`);
    }
  }
}
