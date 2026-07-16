import { levelProgress, MAX_HEARTS, nextHeartAt, regenerateHearts, type StatsSummary } from '@lingoleap/core';
import { defaultUserStats, type UserStats } from '../../domain/user-stats';
import type { StatsRepository } from '../ports/stats.repository';

export function toStatsSummary(stored: UserStats, nowIso: string): StatsSummary {
  const regen = regenerateHearts({ hearts: stored.hearts, updatedAt: stored.heartsUpdatedAt }, nowIso);
  const level = levelProgress(stored.xp);
  return {
    xp: stored.xp,
    level: level.level,
    xpIntoLevel: level.xpIntoLevel,
    xpToNextLevel: level.xpToNextLevel,
    streakCount: stored.streakCount,
    streakFreezes: stored.streakFreezes,
    gems: stored.gems,
    hearts: regen.hearts,
    maxHearts: MAX_HEARTS,
    nextHeartAt: nextHeartAt(regen)
  };
}

export class GetStatsUseCase {
  constructor(private readonly deps: { stats: StatsRepository; now?: () => string }) {}

  async execute(userId: string): Promise<StatsSummary> {
    const nowIso = (this.deps.now ?? (() => new Date().toISOString()))();
    const stored = (await this.deps.stats.findByUser(userId)) ?? defaultUserStats(userId, nowIso);
    return toStatsSummary(stored, nowIso);
  }
}
