create table if not exists public.user_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  streak_count integer not null default 0 check (streak_count >= 0),
  last_lesson_date date,
  hearts integer not null default 5 check (hearts between 0 and 5),
  hearts_updated_at timestamptz not null default now(),
  gems integer not null default 0 check (gems >= 0),
  streak_freezes integer not null default 0 check (streak_freezes >= 0)
);

alter table public.user_stats enable row level security;

-- El API escribe con service role (bypassa RLS); la policy habilita lectura directa futura desde clientes.
create policy "user_stats_select_own"
  on public.user_stats for select
  using (auth.uid() = user_id);
