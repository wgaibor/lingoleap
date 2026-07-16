import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeagueDivision, LeagueMemberResult } from '@lingoleap/core';
import type {
  LeagueMembershipWithCohort, LeagueRepository
} from '../../../application/ports/league.repository';
import type { LeagueCohort, LeagueMembership } from '../../../domain/league';

interface CohortRow {
  id: string;
  division: LeagueDivision;
  week_start: string;
  closed_at: string | null;
}

interface MembershipRow {
  cohort_id: string;
  user_id: string;
  display_name: string;
  weekly_xp: number;
  last_xp_at: string;
  result: LeagueMemberResult | null;
  cohort: CohortRow;
}

function toCohort(row: CohortRow): LeagueCohort {
  return { id: row.id, division: row.division, weekStart: row.week_start, closedAt: row.closed_at };
}

function toMembership(row: Omit<MembershipRow, 'cohort'>): LeagueMembership {
  return {
    cohortId: row.cohort_id, userId: row.user_id, displayName: row.display_name,
    weeklyXp: row.weekly_xp, lastXpAt: row.last_xp_at, result: row.result
  };
}

export class SupabaseLeagueRepository implements LeagueRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async membershipsOf(userId: string): Promise<MembershipRow[]> {
    const { data, error } = await this.client
      .from('league_memberships')
      .select('*, cohort:league_cohorts(*)')
      .eq('user_id', userId);
    if (error) throw new Error(`No se pudo leer league_memberships: ${error.message}`);
    return (data ?? []) as MembershipRow[];
  }

  async findMembership(userId: string, weekStart: string): Promise<LeagueMembershipWithCohort | null> {
    const rows = await this.membershipsOf(userId);
    const row = rows.find((r) => r.cohort.week_start === weekStart) ?? null;
    return row ? { cohort: toCohort(row.cohort), membership: toMembership(row) } : null;
  }

  async findLatestClosedMembership(userId: string): Promise<LeagueMembershipWithCohort | null> {
    const rows = await this.membershipsOf(userId)
      .then((all) => all.filter((r) => r.cohort.closed_at !== null))
      .then((closed) => closed.sort((a, b) => b.cohort.week_start.localeCompare(a.cohort.week_start)));
    const row = rows[0] ?? null;
    return row ? { cohort: toCohort(row.cohort), membership: toMembership(row) } : null;
  }

  async findOpenCohort(
    division: LeagueDivision, weekStart: string, maxSize: number
  ): Promise<LeagueCohort | null> {
    const { data, error } = await this.client
      .from('league_cohorts')
      .select('*, league_memberships(count)')
      .eq('division', division)
      .eq('week_start', weekStart)
      .is('closed_at', null);
    if (error) throw new Error(`No se pudo leer league_cohorts: ${error.message}`);
    type CohortWithCount = CohortRow & { league_memberships: Array<{ count: number }> };
    const rows = (data ?? []) as CohortWithCount[];
    const open = rows.find((r) => (r.league_memberships[0]?.count ?? 0) < maxSize) ?? null;
    return open ? toCohort(open) : null;
  }

  async createCohort(division: LeagueDivision, weekStart: string): Promise<LeagueCohort> {
    const { data, error } = await this.client
      .from('league_cohorts')
      .insert({ division, week_start: weekStart })
      .select()
      .single();
    if (error) throw new Error(`No se pudo crear la cohorte: ${error.message}`);
    return toCohort(data as CohortRow);
  }

  async saveMembership(membership: LeagueMembership): Promise<void> {
    const { error } = await this.client.from('league_memberships').upsert({
      cohort_id: membership.cohortId, user_id: membership.userId,
      display_name: membership.displayName, weekly_xp: membership.weeklyXp,
      last_xp_at: membership.lastXpAt, result: membership.result
    });
    if (error) throw new Error(`No se pudo guardar la membresía: ${error.message}`);
  }

  async listMemberships(cohortId: string): Promise<LeagueMembership[]> {
    const { data, error } = await this.client
      .from('league_memberships')
      .select('*')
      .eq('cohort_id', cohortId);
    if (error) throw new Error(`No se pudo listar la cohorte: ${error.message}`);
    return ((data ?? []) as Array<Omit<MembershipRow, 'cohort'>>).map(toMembership);
  }

  async listExpiredOpenCohorts(currentWeekStart: string): Promise<LeagueCohort[]> {
    const { data, error } = await this.client
      .from('league_cohorts')
      .select('*')
      .is('closed_at', null)
      .lt('week_start', currentWeekStart);
    if (error) throw new Error(`No se pudo listar cohortes vencidas: ${error.message}`);
    return ((data ?? []) as CohortRow[]).map(toCohort);
  }

  async closeCohort(cohortId: string, closedAt: string): Promise<void> {
    const { error } = await this.client
      .from('league_cohorts')
      .update({ closed_at: closedAt })
      .eq('id', cohortId);
    if (error) throw new Error(`No se pudo cerrar la cohorte: ${error.message}`);
  }
}
