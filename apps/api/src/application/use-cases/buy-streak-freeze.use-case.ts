import { buyStreakFreeze, type StatsSummary } from '@lingoleap/core';
import { InsufficientGemsError, StreakFreezeLimitReachedError } from '../../domain/errors';
import { defaultUserStats } from '../../domain/user-stats';
import type { StatsRepository } from '../ports/stats.repository';
import { toStatsSummary } from './get-stats.use-case';

export class BuyStreakFreezeUseCase {
  constructor(private readonly deps: { stats: StatsRepository; now?: () => string }) {}

  async execute(userId: string): Promise<StatsSummary> {
    const nowIso = (this.deps.now ?? (() => new Date().toISOString()))();
    const stored = (await this.deps.stats.findByUser(userId)) ?? defaultUserStats(userId, nowIso);
    const result = buyStreakFreeze({ gems: stored.gems, streakFreezes: stored.streakFreezes });
    if (!result.ok) {
      if (result.reason === 'max-freezes-reached') {
        throw new StreakFreezeLimitReachedError('Ya tenés el máximo de congeladores de racha.');
      }
      throw new InsufficientGemsError('No tenés gemas suficientes para comprar un congelador de racha.');
    }
    const updated = { ...stored, gems: result.gems, streakFreezes: result.streakFreezes };
    await this.deps.stats.save(updated);
    return toStatsSummary(updated, nowIso);
  }
}
