create table if not exists user_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table user_progress enable row level security;

create policy "leer progreso propio" on user_progress
  for select using (auth.uid() = user_id);
create policy "insertar progreso propio" on user_progress
  for insert with check (auth.uid() = user_id);
