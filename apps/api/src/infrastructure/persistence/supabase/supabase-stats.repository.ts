import type { SupabaseClient } from '@supabase/supabase-js';
import type { StatsRepository } from '../../../application/ports/stats.repository';
import type { UserStats } from '../../../domain/user-stats';

interface UserStatsRow {
  user_id: string;
  xp: number;
  streak_count: number;
  last_lesson_date: string | null;
  hearts: number;
  hearts_updated_at: string;
  gems: number;
  streak_freezes: number;
}

export class SupabaseStatsRepository implements StatsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findByUser(userId: string): Promise<UserStats | null> {
    const { data, error } = await this.client
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`No se pudo leer user_stats: ${error.message}`);
    if (data === null) return null;
    const row = data as UserStatsRow;
    return {
      userId: row.user_id, xp: row.xp, streakCount: row.streak_count,
      lastLessonDate: row.last_lesson_date, hearts: row.hearts,
      heartsUpdatedAt: row.hearts_updated_at, gems: row.gems, streakFreezes: row.streak_freezes
    };
  }

  async save(stats: UserStats): Promise<void> {
    const { error } = await this.client.from('user_stats').upsert({
      user_id: stats.userId, xp: stats.xp, streak_count: stats.streakCount,
      last_lesson_date: stats.lastLessonDate, hearts: stats.hearts,
      hearts_updated_at: stats.heartsUpdatedAt, gems: stats.gems, streak_freezes: stats.streakFreezes
    });
    if (error) throw new Error(`No se pudo guardar user_stats: ${error.message}`);
  }
}
