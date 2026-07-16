import { closeLeagueWeek, weekStartOf } from '@lingoleap/core';
import { defaultUserStats } from '../../domain/user-stats';
import type { LeagueRepository } from '../ports/league.repository';
import type { StatsRepository } from '../ports/stats.repository';

export class CloseLeagueWeekUseCase {
  constructor(
    private readonly deps: { league: LeagueRepository; stats: StatsRepository; now?: () => string }
  ) {}

  async execute(): Promise<void> {
    const nowIso = (this.deps.now ?? (() => new Date().toISOString()))();
    const currentWeekStart = weekStartOf(nowIso.slice(0, 10));
    const expired = await this.deps.league.listExpiredOpenCohorts(currentWeekStart);
    for (const cohort of expired) {
      const members = await this.deps.league.listMemberships(cohort.id);
      const outcomes = closeLeagueWeek(
        members.map((m) => ({ userId: m.userId, weeklyXp: m.weeklyXp, lastXpAt: m.lastXpAt })),
        cohort.division
      );
      for (const outcome of outcomes) {
        const membership = members.find((m) => m.userId === outcome.userId);
        if (!membership) continue;
        await this.deps.league.saveMembership({ ...membership, result: outcome.result });
        if (outcome.gemsAwarded > 0) {
          const stored =
            (await this.deps.stats.findByUser(outcome.userId)) ??
            defaultUserStats(outcome.userId, nowIso);
          await this.deps.stats.save({ ...stored, gems: stored.gems + outcome.gemsAwarded });
        }
      }
      await this.deps.league.closeCohort(cohort.id, nowIso);
    }
  }
}
