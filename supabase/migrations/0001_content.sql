create extension if not exists pgcrypto;

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  language text not null,
  level text not null,
  title text not null,
  created_at timestamptz not null default now(),
  unique (language, level)
);

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  position int not null
);

create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  title text not null,
  position int not null
);

create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  position int not null,
  type text not null,
  payload jsonb not null
);

create index if not exists idx_units_course on units(course_id);
create index if not exists idx_lessons_unit on lessons(unit_id);
create index if not exists idx_exercises_lesson on exercises(lesson_id);

alter table courses enable row level security;
alter table units enable row level security;
alter table lessons enable row level security;
alter table exercises enable row level security;

create policy "lectura pública courses" on courses for select using (true);
create policy "lectura pública units" on units for select using (true);
create policy "lectura pública lessons" on lessons for select using (true);
create policy "lectura pública exercises" on exercises for select using (true);
