create table if not exists public.league_cohorts (
  id uuid primary key default gen_random_uuid(),
  division text not null check (division in ('bronze', 'silver', 'gold', 'diamond')),
  week_start date not null,
  closed_at timestamptz
);

create table if not exists public.league_memberships (
  cohort_id uuid not null references public.league_cohorts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  weekly_xp integer not null default 0 check (weekly_xp >= 0),
  last_xp_at timestamptz not null default now(),
  result text check (result in ('promoted', 'demoted', 'stayed')),
  primary key (cohort_id, user_id)
);

alter table public.league_cohorts enable row level security;
alter table public.league_memberships enable row level security;

-- El API escribe con service role (bypassa RLS); la tabla de la cohorte es visible para
-- cualquier usuario autenticado (necesita ver a sus rivales, no solo su propia fila).
create policy "league_cohorts_select_authenticated"
  on public.league_cohorts for select
  using (auth.role() = 'authenticated');

create policy "league_memberships_select_authenticated"
  on public.league_memberships for select
  using (auth.role() = 'authenticated');

create index if not exists league_memberships_user_id_idx on public.league_memberships (user_id);
create index if not exists league_cohorts_open_week_idx on public.league_cohorts (week_start) where closed_at is null;
