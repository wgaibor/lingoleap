import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProgressRepository } from '../../../application/ports/progress.repository';

export class SupabaseProgressRepository implements ProgressRepository {
  constructor(private readonly client: SupabaseClient) {}

  async markLessonCompleted(userId: string, lessonId: string): Promise<void> {
    const { error } = await this.client
      .from('user_progress')
      .upsert({ user_id: userId, lesson_id: lessonId }, { onConflict: 'user_id,lesson_id', ignoreDuplicates: true });
    if (error) {
      throw new Error(`Supabase upsert progreso falló: ${error.message}`);
    }
  }

  async listCompletedLessonIds(userId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from('user_progress')
      .select('lesson_id')
      .eq('user_id', userId);
    if (error) {
      throw new Error(`Supabase select progreso falló: ${error.message}`);
    }
    return (data ?? []).map((row) => (row as { lesson_id: string }).lesson_id);
  }
}
