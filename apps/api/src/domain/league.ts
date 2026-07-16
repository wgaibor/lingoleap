import type { LeagueDivision, LeagueMemberResult } from '@lingoleap/core';

export interface LeagueCohort {
  id: string;
  division: LeagueDivision;
  weekStart: string;
  closedAt: string | null;
}

export interface LeagueMembership {
  cohortId: string;
  userId: string;
  displayName: string;
  weeklyXp: number;
  lastXpAt: string;
  result: LeagueMemberResult | null;
}
