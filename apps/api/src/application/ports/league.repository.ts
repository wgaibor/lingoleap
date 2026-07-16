import type { LeagueDivision } from '@lingoleap/core';
import type { LeagueCohort, LeagueMembership } from '../../domain/league';

export const LEAGUE_REPOSITORY = Symbol('LeagueRepository');

export interface LeagueMembershipWithCohort {
  cohort: LeagueCohort;
  membership: LeagueMembership;
}

export interface LeagueRepository {
  findMembership(userId: string, weekStart: string): Promise<LeagueMembershipWithCohort | null>;
  findLatestClosedMembership(userId: string): Promise<LeagueMembershipWithCohort | null>;
  findOpenCohort(division: LeagueDivision, weekStart: string, maxSize: number): Promise<LeagueCohort | null>;
  createCohort(division: LeagueDivision, weekStart: string): Promise<LeagueCohort>;
  saveMembership(membership: LeagueMembership): Promise<void>;
  listMemberships(cohortId: string): Promise<LeagueMembership[]>;
  listExpiredOpenCohorts(currentWeekStart: string): Promise<LeagueCohort[]>;
  closeCohort(cohortId: string, closedAt: string): Promise<void>;
}
