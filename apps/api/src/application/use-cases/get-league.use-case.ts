import { divisionAfter, leagueZone, weekStartOf, type LeagueSummary } from '@lingoleap/core';
import type { LeagueRepository } from '../ports/league.repository';
import type { CloseLeagueWeekUseCase } from './close-league-week.use-case';

export class GetLeagueUseCase {
  constructor(
    private readonly deps: {
      league: LeagueRepository;
      closeWeek: CloseLeagueWeekUseCase;
      now?: () => string;
    }
  ) {}

  async execute(userId: string): Promise<LeagueSummary> {
    await this.deps.closeWeek.execute(); // cierre perezoso: nunca servir una cohorte vencida
    const nowIso = (this.deps.now ?? (() => new Date().toISOString()))();
    const weekStart = weekStartOf(nowIso.slice(0, 10));

    const active = await this.deps.league.findMembership(userId, weekStart);
    if (active) {
      const members = await this.deps.league.listMemberships(active.cohort.id);
      const sorted = [...members].sort(
        (a, b) => b.weeklyXp - a.weeklyXp || a.lastXpAt.localeCompare(b.lastXpAt)
      );
      return {
        division: active.cohort.division,
        cohort: {
          weekStart: active.cohort.weekStart,
          standings: sorted.map((m, i) => ({
            position: i + 1,
            displayName: m.displayName,
            weeklyXp: m.weeklyXp,
            isMe: m.userId === userId,
            zone: leagueZone(i + 1, sorted.length, active.cohort.division)
          }))
        }
      };
    }

    const latest = await this.deps.league.findLatestClosedMembership(userId);
    const division = latest
      ? divisionAfter(latest.cohort.division, latest.membership.result ?? 'stayed')
      : 'bronze';
    return { division, cohort: null };
  }
}
