import type { UserStats } from '../../domain/user-stats';

export const STATS_REPOSITORY = Symbol('StatsRepository');

export interface StatsRepository {
  findByUser(userId: string): Promise<UserStats | null>;
  save(stats: UserStats): Promise<void>;
}
