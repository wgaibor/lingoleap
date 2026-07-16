export const LEAGUE_DIVISIONS = ['bronze', 'silver', 'gold', 'diamond'] as const;
export type LeagueDivision = (typeof LEAGUE_DIVISIONS)[number];

export const LEAGUE_COHORT_SIZE = 30;
export const LEAGUE_PROMOTE_COUNT = 10;
export const LEAGUE_DEMOTE_COUNT = 5;
export const LEAGUE_PODIUM_GEMS: readonly number[] = [20, 10, 5];

export type LeagueMemberResult = 'promoted' | 'demoted' | 'stayed';
export type LeagueZone = 'promotion' | 'demotion' | 'none';

export function weekStartOf(dateIso: string): string {
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function divisionAfter(division: LeagueDivision, result: LeagueMemberResult): LeagueDivision {
  const index = LEAGUE_DIVISIONS.indexOf(division);
  if (result === 'promoted') {
    return LEAGUE_DIVISIONS[Math.min(index + 1, LEAGUE_DIVISIONS.length - 1)];
  }
  if (result === 'demoted') {
    return LEAGUE_DIVISIONS[Math.max(index - 1, 0)];
  }
  return division;
}

export function leagueZone(position: number, cohortSize: number, division: LeagueDivision): LeagueZone {
  if (division !== 'diamond' && position <= LEAGUE_PROMOTE_COUNT) {
    return 'promotion';
  }
  if (division !== 'bronze' && position > cohortSize - LEAGUE_DEMOTE_COUNT) {
    return 'demotion';
  }
  return 'none';
}

export interface LeagueMemberInput {
  userId: string;
  weeklyXp: number;
  lastXpAt: string;
}

export interface LeagueMemberOutcome {
  userId: string;
  position: number;
  result: LeagueMemberResult;
  gemsAwarded: number;
}

export function closeLeagueWeek(
  members: LeagueMemberInput[],
  division: LeagueDivision
): LeagueMemberOutcome[] {
  const sorted = [...members].sort(
    (a, b) => b.weeklyXp - a.weeklyXp || a.lastXpAt.localeCompare(b.lastXpAt)
  );
  return sorted.map((m, index) => {
    const position = index + 1;
    const zone = leagueZone(position, sorted.length, division);
    const result: LeagueMemberResult =
      zone === 'promotion' ? 'promoted' : zone === 'demotion' ? 'demoted' : 'stayed';
    return { userId: m.userId, position, result, gemsAwarded: LEAGUE_PODIUM_GEMS[index] ?? 0 };
  });
}

export interface LeagueStanding {
  position: number;
  displayName: string;
  weeklyXp: number;
  isMe: boolean;
  zone: LeagueZone;
}

export interface LeagueCohortSummary {
  weekStart: string;
  standings: LeagueStanding[];
}

export interface LeagueSummary {
  division: LeagueDivision;
  cohort: LeagueCohortSummary | null;
}
