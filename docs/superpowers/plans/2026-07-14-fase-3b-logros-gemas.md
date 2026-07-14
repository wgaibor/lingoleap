# Fase 3B (primer corte) — Logros y gemas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sistema de logros (racha 3/7/30 días, lecciones completadas 10/50/100, nivel 5/10) que
otorga gemas al desbloquearse, visible en la web (página "Logros" + aviso al completar una
lección), y validado siempre en el servidor.

**Architecture:** Catálogo estático de 8 logros como datos puros en `packages/core`
(`logic/achievements.ts`), evaluado en `CompleteLessonUseCase` junto a XP/racha/corazones;
persistencia de qué desbloqueó cada usuario en una tabla nueva `user_achievements` (Supabase,
RLS) vía el puerto `AchievementsRepository`. La web solo refleja: página `/achievements` y un
aviso en `CompletionScreen`.

**Tech Stack:** El existente del monorepo: NestJS 11 hexagonal, Supabase (Postgres + RLS),
Vitest (+ msw, supertest, Testing Library), React 18 + TanStack Query + zustand, tokens CSS.

**Fuera de alcance de este plan** (sub-proyectos independientes de la Fase 3B, cada uno con su
propio brainstorm antes de planificarse): gastar gemas en comprar un congelador de racha, liga
semanal con cron.

## Global Constraints

- TypeScript `strict: true`; prohibido `any` explícito. Copy de UI y mensajes de error en español.
- Regla de capas API: `domain/` puro; `application/` solo domain+core; `infrastructure/`
  implementa puertos; `presentation/` solo llama casos de uso. Clases de application/infrastructure
  sin decoradores NestJS (wiring por `useFactory` en `content-api.module.ts`).
- La web NUNCA llama `fetch` directo: todo por `@lingoleap/api-client`.
- Colores/espaciados solo desde `@lingoleap/tokens` (ver `packages/tokens/src/tokens.css` para
  los nombres exactos disponibles); sombras solo `var(--shadow-sm)`.
- Reglas de gamificación en `packages/core` (funciones puras, sin frameworks) y **aplicadas y
  recalculadas siempre en el backend**; la UI solo refleja.
- **Catálogo de logros (cerrado en el spec, `docs/superpowers/specs/2026-07-14-fase-3b-logros-gemas-design.md`):**
  `streak-3` (5💎), `streak-7` (15💎), `streak-30` (30💎), `lessons-10` (5💎), `lessons-50` (15💎),
  `lessons-100` (30💎), `level-5` (5💎), `level-10` (15💎). Estático en código, no en base de datos.
- TDD en `packages/core` y backend (evidencia RED→GREEN); componentes web con Testing Library.
- Commits convencionales en español al final de cada tarea + trailer
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- pnpm 11; monorepo existente en `lingoleap/`; rama de trabajo nueva sobre `master`.

---

### Task 1: Migración + puerto + adaptador de logros

**Files:**
- Create: `supabase/migrations/0004_achievements.sql`,
  `apps/api/src/application/ports/achievements.repository.ts`,
  `apps/api/src/infrastructure/persistence/supabase/supabase-achievements.repository.ts`
- Test: `apps/api/src/infrastructure/persistence/supabase/supabase-achievements.repository.spec.ts`

**Interfaces:**
- Consumes: factory `SUPABASE_CLIENT` existente (mismo patrón que `SupabaseProgressRepository`).
- Produces:
```ts
// apps/api/src/application/ports/achievements.repository.ts
export const ACHIEVEMENTS_REPOSITORY = Symbol('AchievementsRepository');

export interface AchievementsRepository {
  listUnlockedIds(userId: string): Promise<string[]>;
  unlock(userId: string, achievementId: string, unlockedAt: string): Promise<void>;
}
```

- [ ] **Step 1: Escribir la migración** `supabase/migrations/0004_achievements.sql` (se ejecuta
  UNA vez a mano en el SQL Editor, como 0001/0002/0003):

```sql
create table if not exists public.user_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.user_achievements enable row level security;

create policy "leer logros propios"
  on public.user_achievements for select
  using (auth.uid() = user_id);
```

- [ ] **Step 2: Test que falla** — `supabase-achievements.repository.spec.ts` (mismo estilo de
  mock encadenado que `supabase-stats.repository.spec.ts` — leerlo antes y calcar su forma de
  mockear el cliente):

```ts
import { describe, expect, it, vi } from 'vitest';
import { SupabaseAchievementsRepository } from './supabase-achievements.repository';

function clientWith(selectResult: { data: unknown; error: { message: string } | null }) {
  const eq = vi.fn().mockResolvedValue(selectResult);
  const select = vi.fn().mockReturnValue({ eq });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ select, upsert });
  return { client: { from } as never, upsert };
}

describe('SupabaseAchievementsRepository', () => {
  it('lista los ids de logros desbloqueados', async () => {
    const { client } = clientWith({
      data: [{ achievement_id: 'streak-3' }, { achievement_id: 'lessons-10' }],
      error: null
    });
    const repo = new SupabaseAchievementsRepository(client);
    await expect(repo.listUnlockedIds('u1')).resolves.toEqual(['streak-3', 'lessons-10']);
  });

  it('devuelve [] si el usuario no tiene logros', async () => {
    const { client } = clientWith({ data: [], error: null });
    const repo = new SupabaseAchievementsRepository(client);
    await expect(repo.listUnlockedIds('u1')).resolves.toEqual([]);
  });

  it('desbloquea con upsert idempotente en snake_case', async () => {
    const { client, upsert } = clientWith({ data: [], error: null });
    const repo = new SupabaseAchievementsRepository(client);
    await repo.unlock('u1', 'streak-3', '2026-07-14T00:00:00.000Z');
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'u1', achievement_id: 'streak-3', unlocked_at: '2026-07-14T00:00:00.000Z' },
      { onConflict: 'user_id,achievement_id', ignoreDuplicates: true }
    );
  });
});
```

Run: `pnpm --filter @lingoleap/api test -- supabase-achievements` — Expected: FAIL (módulo no
existe).

- [ ] **Step 3: Implementar** puerto y adaptador:

```ts
// apps/api/src/application/ports/achievements.repository.ts
export const ACHIEVEMENTS_REPOSITORY = Symbol('AchievementsRepository');

export interface AchievementsRepository {
  listUnlockedIds(userId: string): Promise<string[]>;
  unlock(userId: string, achievementId: string, unlockedAt: string): Promise<void>;
}
```

```ts
// apps/api/src/infrastructure/persistence/supabase/supabase-achievements.repository.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AchievementsRepository } from '../../../application/ports/achievements.repository';

export class SupabaseAchievementsRepository implements AchievementsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listUnlockedIds(userId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from('user_achievements')
      .select('achievement_id')
      .eq('user_id', userId);
    if (error) {
      throw new Error(`Supabase select logros falló: ${error.message}`);
    }
    return (data ?? []).map((row) => (row as { achievement_id: string }).achievement_id);
  }

  async unlock(userId: string, achievementId: string, unlockedAt: string): Promise<void> {
    const { error } = await this.client
      .from('user_achievements')
      .upsert(
        { user_id: userId, achievement_id: achievementId, unlocked_at: unlockedAt },
        { onConflict: 'user_id,achievement_id', ignoreDuplicates: true }
      );
    if (error) {
      throw new Error(`Supabase upsert logro falló: ${error.message}`);
    }
  }
}
```

- [ ] **Step 4: Verificar** — Run: `pnpm --filter @lingoleap/api test -- supabase-achievements`
  — Expected: PASS (3 tests). Luego `pnpm --filter @lingoleap/api test` completo: los tests
  previos siguen verdes.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_achievements.sql apps/api/src/application/ports/achievements.repository.ts apps/api/src/infrastructure/persistence/supabase/supabase-achievements.repository.ts apps/api/src/infrastructure/persistence/supabase/supabase-achievements.repository.spec.ts
git commit -m "feat(api): tabla user_achievements con puerto y adaptador de logros"
```

---

### Task 2: Core — catálogo de logros + extensión de LessonRewards

**Files:**
- Create: `packages/core/src/logic/achievements.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/src/stats.ts`
- Test: `packages/core/src/logic/achievements.spec.ts`

**Interfaces:**
- Produces:
```ts
export type AchievementCategory = 'streak' | 'lessons' | 'level';

export interface AchievementDefinition {
  id: string;
  category: AchievementCategory;
  threshold: number;
  gems: number;
}

export interface AchievementStatus extends AchievementDefinition {
  unlocked: boolean;
}

export const ACHIEVEMENTS: AchievementDefinition[]; // los 8 logros fijos, ver Global Constraints

export interface AchievementProgress {
  streakCount: number;
  lessonsCompleted: number;
  level: number;
}

export function unlockedAchievements(
  progress: AchievementProgress,
  alreadyUnlockedIds: string[]
): AchievementDefinition[];

// packages/core/src/stats.ts — LessonRewards gana 2 campos nuevos:
export interface LessonRewards {
  xpEarned: number;
  totalXp: number;
  level: number;
  streakCount: number;
  freezeUsed: boolean;
  hearts: number;
  gemsEarned: number;
  achievementsUnlocked: AchievementDefinition[];
}
```

- [ ] **Step 1: Test que falla** — `achievements.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, unlockedAchievements } from './achievements';

describe('unlockedAchievements', () => {
  it('el catálogo tiene exactamente 8 logros', () => {
    expect(ACHIEVEMENTS).toHaveLength(8);
  });

  it('no desbloquea nada si no se cruzó ningún umbral', () => {
    expect(unlockedAchievements({ streakCount: 1, lessonsCompleted: 1, level: 1 }, [])).toEqual([]);
  });

  it('desbloquea el primer hito de racha al llegar a 3 días', () => {
    const result = unlockedAchievements({ streakCount: 3, lessonsCompleted: 0, level: 1 }, []);
    expect(result).toEqual([{ id: 'streak-3', category: 'streak', threshold: 3, gems: 5 }]);
  });

  it('no repite un logro que ya está en alreadyUnlockedIds', () => {
    expect(
      unlockedAchievements({ streakCount: 3, lessonsCompleted: 0, level: 1 }, ['streak-3'])
    ).toEqual([]);
  });

  it('no desbloquea "50 lecciones" con 49', () => {
    expect(
      unlockedAchievements({ streakCount: 0, lessonsCompleted: 49, level: 1 }, ['lessons-10'])
    ).toEqual([]);
  });

  it('desbloquea varios a la vez si el progreso saltó de golpe (nivel 4 a 10)', () => {
    const result = unlockedAchievements({ streakCount: 0, lessonsCompleted: 0, level: 10 }, []);
    expect(result.map((a) => a.id)).toEqual(['level-5', 'level-10']);
  });
});
```

Run: `pnpm --filter @lingoleap/core test` — Expected: FAIL (`./achievements` no existe).

- [ ] **Step 2: Implementar** `achievements.ts`:

```ts
// packages/core/src/logic/achievements.ts
export type AchievementCategory = 'streak' | 'lessons' | 'level';

export interface AchievementDefinition {
  id: string;
  category: AchievementCategory;
  threshold: number;
  gems: number;
}

export interface AchievementStatus extends AchievementDefinition {
  unlocked: boolean;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'streak-3', category: 'streak', threshold: 3, gems: 5 },
  { id: 'streak-7', category: 'streak', threshold: 7, gems: 15 },
  { id: 'streak-30', category: 'streak', threshold: 30, gems: 30 },
  { id: 'lessons-10', category: 'lessons', threshold: 10, gems: 5 },
  { id: 'lessons-50', category: 'lessons', threshold: 50, gems: 15 },
  { id: 'lessons-100', category: 'lessons', threshold: 100, gems: 30 },
  { id: 'level-5', category: 'level', threshold: 5, gems: 5 },
  { id: 'level-10', category: 'level', threshold: 10, gems: 15 }
];

export interface AchievementProgress {
  streakCount: number;
  lessonsCompleted: number;
  level: number;
}

function valueFor(progress: AchievementProgress, category: AchievementCategory): number {
  switch (category) {
    case 'streak':
      return progress.streakCount;
    case 'lessons':
      return progress.lessonsCompleted;
    case 'level':
      return progress.level;
  }
}

export function unlockedAchievements(
  progress: AchievementProgress,
  alreadyUnlockedIds: string[]
): AchievementDefinition[] {
  return ACHIEVEMENTS.filter(
    (a) => !alreadyUnlockedIds.includes(a.id) && valueFor(progress, a.category) >= a.threshold
  );
}
```

- [ ] **Step 3: Verificar GREEN (parcial)** — Run: `pnpm --filter @lingoleap/core test` —
  Expected: PASS los tests de `achievements.spec.ts`.

- [ ] **Step 4: Extender `LessonRewards`** en `packages/core/src/stats.ts` (agregar el import y
  los 2 campos nuevos; el resto del archivo no cambia):

```ts
// packages/core/src/stats.ts
import type { AchievementDefinition } from './logic/achievements';

export interface StatsSummary {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  streakCount: number;
  streakFreezes: number;
  gems: number;
  hearts: number;
  maxHearts: number;
  nextHeartAt: string | null;
}

export interface LessonRewards {
  xpEarned: number;
  totalXp: number;
  level: number;
  streakCount: number;
  freezeUsed: boolean;
  hearts: number;
  gemsEarned: number;
  achievementsUnlocked: AchievementDefinition[];
}
```

- [ ] **Step 5: Registrar el export nuevo** en `packages/core/src/index.ts` (agregar la línea
  antes de `export * from './stats';`, que ahora depende de `achievements.ts`):

```ts
export * from './types';
export * from './exercises';
export * from './cefr';
export * from './logic/answer-validation';
export * from './logic/path-status';
export * from './logic/lesson-session';
export * from './logic/xp';
export * from './logic/streak';
export * from './logic/hearts';
export * from './logic/achievements';
export * from './stats';
```

- [ ] **Step 6: Verificar** — Run: `pnpm --filter @lingoleap/core test` — Expected: PASS. Nota:
  `pnpm build` en el monorepo completo va a FALLAR en este punto — el objeto que retorna
  `CompleteLessonUseCase.execute` en `apps/api` (Task 3 todavía no corrió) es un objeto literal
  tipado como `LessonRewards`, y TypeScript exige que un literal tenga las propiedades
  `gemsEarned`/`achievementsUnlocked` que se acaban de agregar. Es un estado transitorio esperado
  entre esta tarea y la Task 3, que es la que lo arregla — no se necesita `pnpm build` en verde
  hasta el final de la Task 3.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/logic/achievements.ts packages/core/src/logic/achievements.spec.ts packages/core/src/stats.ts packages/core/src/index.ts
git commit -m "feat(core): catálogo de logros y extensión de LessonRewards con gemas/logros"
```

---

### Task 3: CompleteLessonUseCase — otorgar logros y gemas al completar

**Files:**
- Modify: `apps/api/src/application/use-cases/complete-lesson.use-case.ts`,
  `apps/api/src/application/use-cases/complete-lesson.use-case.spec.ts`,
  `apps/api/src/presentation/content-api.module.ts`,
  `apps/api/src/presentation/progress-api.spec.ts`

**Interfaces:**
- Consumes: `unlockedAchievements`, `AchievementDefinition`, `levelProgress` de `@lingoleap/core`
  (Task 2); `AchievementsRepository`/`ACHIEVEMENTS_REPOSITORY` (Task 1);
  `progress.listCompletedLessonIds` (puerto ya existente).
- Produces:
```ts
export class CompleteLessonUseCase {
  constructor(deps: {
    courses: CourseRepository;
    progress: ProgressRepository;
    stats: StatsRepository;
    achievements: AchievementsRepository; // NUEVO, requerido
    now?: () => string;
  });
  execute(input: CompleteLessonInput): Promise<LessonRewards>; // trae gemsEarned + achievementsUnlocked
}
```

- [ ] **Step 1: Extender el test unit (RED)** — reescribir
  `apps/api/src/application/use-cases/complete-lesson.use-case.spec.ts` completo (agrega
  `FakeAchievements`, `achievements` a cada construcción de `CompleteLessonUseCase`, actualiza el
  `toEqual` de la Task previa con los 2 campos nuevos, y suma los tests de logros):

```ts
import { describe, expect, it } from 'vitest';
import type { Lesson } from '@lingoleap/core';
import type { AchievementsRepository } from '../ports/achievements.repository';
import type { CourseRepository } from '../ports/course.repository';
import type { ProgressRepository } from '../ports/progress.repository';
import type { StatsRepository } from '../ports/stats.repository';
import type { UserStats } from '../../domain/user-stats';
import { LessonNotFoundError } from '../../domain/errors';
import { CompleteLessonUseCase } from './complete-lesson.use-case';
import { GetProgressUseCase } from './get-progress.use-case';

const lesson: Lesson = { id: 'l1', title: 'Lección 1', position: 1, exercises: [
  { id: 'e1', type: 'match-pairs', pairs: [{ left: 'water', right: 'agua' }] }
] };

class FakeCourses implements CourseRepository {
  async saveCourse(): Promise<void> {}
  async findByLanguageAndLevel(): Promise<null> { return null; }
  async listSummaries(): Promise<[]> { return []; }
  async findLessonById(id: string): Promise<Lesson | null> { return id === 'l1' ? lesson : null; }
}

class FakeProgress implements ProgressRepository {
  completed: Array<{ userId: string; lessonId: string }> = [];
  async markLessonCompleted(userId: string, lessonId: string): Promise<void> {
    this.completed.push({ userId, lessonId });
  }
  async listCompletedLessonIds(userId: string): Promise<string[]> {
    return this.completed.filter((c) => c.userId === userId).map((c) => c.lessonId);
  }
}

class FakeStats implements StatsRepository {
  constructor(private readonly stored: UserStats | null) {}
  saved: UserStats[] = [];
  async findByUser(): Promise<UserStats | null> { return this.stored; }
  async save(stats: UserStats): Promise<void> { this.saved.push(stats); }
}

class FakeAchievements implements AchievementsRepository {
  unlocked: Set<string>;
  unlockedCalls: Array<{ userId: string; achievementId: string }> = [];
  constructor(initiallyUnlocked: string[] = []) { this.unlocked = new Set(initiallyUnlocked); }
  async listUnlockedIds(): Promise<string[]> { return [...this.unlocked]; }
  async unlock(userId: string, achievementId: string): Promise<void> {
    this.unlocked.add(achievementId);
    this.unlockedCalls.push({ userId, achievementId });
  }
}

const NOW = '2026-07-12T12:00:00.000Z';
const courses = new FakeCourses();
const progress = new FakeProgress();

describe('CompleteLessonUseCase', () => {
  it('registra la lección completada para el usuario', async () => {
    const progress = new FakeProgress();
    const stats = new FakeStats(null);
    const useCase = new CompleteLessonUseCase({
      courses: new FakeCourses(), progress, stats, achievements: new FakeAchievements(), now: () => NOW
    });
    await useCase.execute({ userId: 'u1', lessonId: 'l1', errorCount: 0, clientDate: '2026-07-12' });
    expect(progress.completed).toEqual([{ userId: 'u1', lessonId: 'l1' }]);
  });

  it('lanza LessonNotFoundError si la lección no existe', async () => {
    const useCase = new CompleteLessonUseCase({
      courses: new FakeCourses(), progress: new FakeProgress(), stats: new FakeStats(null),
      achievements: new FakeAchievements(), now: () => NOW
    });
    await expect(
      useCase.execute({ userId: 'u1', lessonId: 'nope', errorCount: 0, clientDate: '2026-07-12' })
    ).rejects.toThrow(LessonNotFoundError);
  });

  it('primera lección: 15 XP sin errores, racha 1, corazones intactos, sin logros nuevos', async () => {
    const stats = new FakeStats(null);
    const useCase = new CompleteLessonUseCase({
      courses, progress, stats, achievements: new FakeAchievements(), now: () => NOW
    });
    const rewards = await useCase.execute({ userId: 'u1', lessonId: lesson.id, errorCount: 0, clientDate: '2026-07-12' });
    expect(rewards).toEqual({
      xpEarned: 15, totalXp: 15, level: 1, streakCount: 1, freezeUsed: false, hearts: 5,
      gemsEarned: 0, achievementsUnlocked: []
    });
    expect(stats.saved[0]).toMatchObject({ xp: 15, streakCount: 1, lastLessonDate: '2026-07-12', hearts: 5, gems: 0 });
  });

  it('con 3 errores: 12 XP y pierde 3 corazones', async () => {
    const stats = new FakeStats(null);
    const useCase = new CompleteLessonUseCase({
      courses, progress, stats, achievements: new FakeAchievements(), now: () => NOW
    });
    const rewards = await useCase.execute({ userId: 'u1', lessonId: lesson.id, errorCount: 3, clientDate: '2026-07-12' });
    expect(rewards.xpEarned).toBe(12);
    expect(rewards.hearts).toBe(2);
  });

  it('extiende la racha de ayer y usa la fecha del servidor si la del cliente es inválida', async () => {
    const stats = new FakeStats({
      userId: 'u1', xp: 90, streakCount: 4, lastLessonDate: '2026-07-11',
      hearts: 5, heartsUpdatedAt: NOW, gems: 0, streakFreezes: 0
    });
    const useCase = new CompleteLessonUseCase({
      courses, progress, stats, achievements: new FakeAchievements(), now: () => NOW
    });
    const rewards = await useCase.execute({ userId: 'u1', lessonId: lesson.id, errorCount: 0, clientDate: 'no-es-fecha' });
    expect(rewards.streakCount).toBe(5); // el servidor usa 2026-07-12 (UTC de NOW); ayer fue 07-11
    expect(rewards.totalXp).toBe(105);
    expect(rewards.level).toBe(2);
  });

  it('otorga el logro de 10 lecciones y sus gemas al completar la décima', async () => {
    const progress = new FakeProgress();
    for (let i = 0; i < 9; i++) {
      await progress.markLessonCompleted('u1', `seed-${i}`);
    }
    const stats = new FakeStats(null);
    const achievements = new FakeAchievements();
    const useCase = new CompleteLessonUseCase({ courses, progress, stats, achievements, now: () => NOW });
    const rewards = await useCase.execute({ userId: 'u1', lessonId: lesson.id, errorCount: 0, clientDate: '2026-07-12' });
    expect(rewards.gemsEarned).toBe(5);
    expect(rewards.achievementsUnlocked).toEqual([{ id: 'lessons-10', category: 'lessons', threshold: 10, gems: 5 }]);
    expect(stats.saved[0].gems).toBe(5);
    expect(achievements.unlockedCalls).toEqual([{ userId: 'u1', achievementId: 'lessons-10' }]);
  });

  it('no vuelve a otorgar un logro que el usuario ya tenía desbloqueado', async () => {
    const progress = new FakeProgress();
    for (let i = 0; i < 10; i++) {
      await progress.markLessonCompleted('u1', `seed-${i}`);
    }
    const stats = new FakeStats({
      userId: 'u1', xp: 0, streakCount: 0, lastLessonDate: null,
      hearts: 5, heartsUpdatedAt: NOW, gems: 5, streakFreezes: 0
    });
    const achievements = new FakeAchievements(['lessons-10']);
    const useCase = new CompleteLessonUseCase({ courses, progress, stats, achievements, now: () => NOW });
    const rewards = await useCase.execute({ userId: 'u1', lessonId: lesson.id, errorCount: 0, clientDate: '2026-07-12' });
    expect(rewards.gemsEarned).toBe(0);
    expect(rewards.achievementsUnlocked).toEqual([]);
    expect(stats.saved[0].gems).toBe(5);
  });
});

describe('GetProgressUseCase', () => {
  it('devuelve los ids completados del usuario', async () => {
    const progress = new FakeProgress();
    await progress.markLessonCompleted('u1', 'l1');
    await progress.markLessonCompleted('u2', 'l9');
    const useCase = new GetProgressUseCase(progress);
    await expect(useCase.execute('u1')).resolves.toEqual(['l1']);
  });
});
```

Run: `pnpm --filter @lingoleap/api test -- complete-lesson` — Expected: FAIL (firma nueva /
campos faltantes en `rewards`).

- [ ] **Step 2: Implementar** la extensión del caso de uso:

```ts
// apps/api/src/application/use-cases/complete-lesson.use-case.ts
import {
  applyLessonDay, lessonXp, levelProgress, loseHearts, regenerateHearts, unlockedAchievements,
  type LessonRewards
} from '@lingoleap/core';
import { LessonNotFoundError } from '../../domain/errors';
import { defaultUserStats } from '../../domain/user-stats';
import type { AchievementsRepository } from '../ports/achievements.repository';
import type { CourseRepository } from '../ports/course.repository';
import type { ProgressRepository } from '../ports/progress.repository';
import type { StatsRepository } from '../ports/stats.repository';

export interface CompleteLessonInput {
  userId: string;
  lessonId: string;
  errorCount: number;
  clientDate: string | null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ERRORS = 50;

export class CompleteLessonUseCase {
  constructor(
    private readonly deps: {
      courses: CourseRepository;
      progress: ProgressRepository;
      stats: StatsRepository;
      achievements: AchievementsRepository;
      now?: () => string;
    }
  ) {}

  async execute(input: CompleteLessonInput): Promise<LessonRewards> {
    const lesson = await this.deps.courses.findLessonById(input.lessonId);
    if (lesson === null) {
      throw new LessonNotFoundError(input.lessonId);
    }
    await this.deps.progress.markLessonCompleted(input.userId, input.lessonId);

    const nowIso = (this.deps.now ?? (() => new Date().toISOString()))();
    const today =
      input.clientDate !== null && DATE_PATTERN.test(input.clientDate)
        ? input.clientDate
        : nowIso.slice(0, 10);
    const errorCount = Math.min(MAX_ERRORS, Math.max(0, Math.floor(input.errorCount)));

    const stored = (await this.deps.stats.findByUser(input.userId)) ?? defaultUserStats(input.userId, nowIso);
    const regen = regenerateHearts({ hearts: stored.hearts, updatedAt: stored.heartsUpdatedAt }, nowIso);
    const hearts = loseHearts(regen.hearts, errorCount);
    const xpEarned = lessonXp(errorCount);
    const totalXp = stored.xp + xpEarned;
    const streak = applyLessonDay(
      { count: stored.streakCount, lastDate: stored.lastLessonDate, freezes: stored.streakFreezes },
      today
    );
    const level = levelProgress(totalXp).level;

    const lessonsCompleted = (await this.deps.progress.listCompletedLessonIds(input.userId)).length;
    const alreadyUnlocked = await this.deps.achievements.listUnlockedIds(input.userId);
    const newlyUnlocked = unlockedAchievements(
      { streakCount: streak.count, lessonsCompleted, level },
      alreadyUnlocked
    );
    const gemsEarned = newlyUnlocked.reduce((sum, a) => sum + a.gems, 0);

    await this.deps.stats.save({
      userId: input.userId,
      xp: totalXp,
      streakCount: streak.count,
      lastLessonDate: streak.lastDate,
      hearts,
      heartsUpdatedAt: regen.updatedAt,
      gems: stored.gems + gemsEarned,
      streakFreezes: streak.freezes
    });

    for (const achievement of newlyUnlocked) {
      await this.deps.achievements.unlock(input.userId, achievement.id, nowIso);
    }

    return {
      xpEarned,
      totalXp,
      level,
      streakCount: streak.count,
      freezeUsed: streak.freezeUsed,
      hearts,
      gemsEarned,
      achievementsUnlocked: newlyUnlocked
    };
  }
}
```

- [ ] **Step 3: Verificar unit GREEN** — Run: `pnpm --filter @lingoleap/api test -- complete-lesson`
  — Expected: PASS (8 tests).

- [ ] **Step 4: Actualizar el wiring** en `apps/api/src/presentation/content-api.module.ts` —
  agregar el import y el provider de `ACHIEVEMENTS_REPOSITORY`, e inyectarlo en el factory de
  `CompleteLessonUseCase`:

```ts
// apps/api/src/presentation/content-api.module.ts
import { Module } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACHIEVEMENTS_REPOSITORY, type AchievementsRepository } from '../application/ports/achievements.repository';
import { AUTH_VERIFIER } from '../application/ports/auth-verifier.port';
import { COURSE_REPOSITORY, type CourseRepository } from '../application/ports/course.repository';
import { PROGRESS_REPOSITORY, type ProgressRepository } from '../application/ports/progress.repository';
import { STATS_REPOSITORY, type StatsRepository } from '../application/ports/stats.repository';
import { CompleteLessonUseCase } from '../application/use-cases/complete-lesson.use-case';
import { GetCourseUseCase } from '../application/use-cases/get-course.use-case';
import { GetLessonUseCase } from '../application/use-cases/get-lesson.use-case';
import { GetProgressUseCase } from '../application/use-cases/get-progress.use-case';
import { GetStatsUseCase } from '../application/use-cases/get-stats.use-case';
import { ListCoursesUseCase } from '../application/use-cases/list-courses.use-case';
import { SupabaseAuthVerifier } from '../infrastructure/auth/supabase-auth.verifier';
import { IngestModule } from '../infrastructure/ingest.module';
import { SupabaseAchievementsRepository } from '../infrastructure/persistence/supabase/supabase-achievements.repository';
import { SupabaseProgressRepository } from '../infrastructure/persistence/supabase/supabase-progress.repository';
import { SupabaseStatsRepository } from '../infrastructure/persistence/supabase/supabase-stats.repository';
import { SUPABASE_CLIENT } from '../infrastructure/persistence/supabase/supabase-client.factory';
import { AuthGuard } from './auth.guard';
import { CoursesController } from './courses.controller';
import { LessonsController } from './lessons.controller';
import { ProgressController } from './progress.controller';
import { StatsController } from './stats.controller';

@Module({
  imports: [IngestModule],
  controllers: [CoursesController, LessonsController, ProgressController, StatsController],
  providers: [
    {
      provide: ListCoursesUseCase,
      useFactory: (repo: CourseRepository) => new ListCoursesUseCase(repo),
      inject: [COURSE_REPOSITORY]
    },
    {
      provide: GetCourseUseCase,
      useFactory: (repo: CourseRepository) => new GetCourseUseCase(repo),
      inject: [COURSE_REPOSITORY]
    },
    {
      provide: GetLessonUseCase,
      useFactory: (repo: CourseRepository) => new GetLessonUseCase(repo),
      inject: [COURSE_REPOSITORY]
    },
    {
      provide: AUTH_VERIFIER,
      useFactory: (c: SupabaseClient) => new SupabaseAuthVerifier(c),
      inject: [SUPABASE_CLIENT]
    },
    {
      provide: PROGRESS_REPOSITORY,
      useFactory: (c: SupabaseClient) => new SupabaseProgressRepository(c),
      inject: [SUPABASE_CLIENT]
    },
    {
      provide: ACHIEVEMENTS_REPOSITORY,
      useFactory: (c: SupabaseClient) => new SupabaseAchievementsRepository(c),
      inject: [SUPABASE_CLIENT]
    },
    {
      provide: CompleteLessonUseCase,
      useFactory: (
        courses: CourseRepository,
        progress: ProgressRepository,
        stats: StatsRepository,
        achievements: AchievementsRepository
      ) => new CompleteLessonUseCase({ courses, progress, stats, achievements }),
      inject: [COURSE_REPOSITORY, PROGRESS_REPOSITORY, STATS_REPOSITORY, ACHIEVEMENTS_REPOSITORY]
    },
    {
      provide: GetProgressUseCase,
      useFactory: (p: ProgressRepository) => new GetProgressUseCase(p),
      inject: [PROGRESS_REPOSITORY]
    },
    {
      provide: STATS_REPOSITORY,
      useFactory: (c: SupabaseClient) => new SupabaseStatsRepository(c),
      inject: [SUPABASE_CLIENT]
    },
    {
      provide: GetStatsUseCase,
      useFactory: (stats: StatsRepository) => new GetStatsUseCase({ stats }),
      inject: [STATS_REPOSITORY]
    },
    AuthGuard
  ]
})
export class ContentApiModule {}
```

- [ ] **Step 5: Actualizar el e2e existente** `apps/api/src/presentation/progress-api.spec.ts`
  — este test instancia `ContentApiModule` completo y ejecuta `CompleteLessonUseCase` de
  verdad, así que ahora necesita un `FakeAchievements` igual que ya hace con
  `STATS_REPOSITORY`/`PROGRESS_REPOSITORY` (si no se agrega, el test intentará una llamada de
  red real a Supabase y fallará). Reescribir el archivo completo:

```ts
// apps/api/src/presentation/progress-api.spec.ts
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedUser, AuthVerifier } from '../application/ports/auth-verifier.port';
import { AUTH_VERIFIER } from '../application/ports/auth-verifier.port';
import type { AchievementsRepository } from '../application/ports/achievements.repository';
import { ACHIEVEMENTS_REPOSITORY } from '../application/ports/achievements.repository';
import type { ProgressRepository } from '../application/ports/progress.repository';
import { PROGRESS_REPOSITORY } from '../application/ports/progress.repository';
import { COURSE_REPOSITORY, type CourseRepository } from '../application/ports/course.repository';
import { STATS_REPOSITORY, type StatsRepository } from '../application/ports/stats.repository';
import type { UserStats } from '../domain/user-stats';
import type { Lesson } from '@lingoleap/core';
import { ContentApiModule } from './content-api.module';
import { DomainExceptionFilter } from './domain-exception.filter';

const lesson: Lesson = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', title: 'L1', position: 1, exercises: [
  { id: 'e1', type: 'match-pairs', pairs: [{ left: 'water', right: 'agua' }] }
] };

class FakeVerifier implements AuthVerifier {
  async verifyToken(token: string): Promise<AuthenticatedUser | null> {
    return token === 'valid-token' ? { id: 'user-1', email: 'a@b.com' } : null;
  }
}

class FakeProgress implements ProgressRepository {
  saved: string[] = [];
  async markLessonCompleted(_userId: string, lessonId: string): Promise<void> { this.saved.push(lessonId); }
  async listCompletedLessonIds(): Promise<string[]> { return this.saved; }
}

class FakeCourses implements CourseRepository {
  async saveCourse(): Promise<void> {}
  async findByLanguageAndLevel(): Promise<null> { return null; }
  async listSummaries(): Promise<[]> { return []; }
  async findLessonById(id: string): Promise<Lesson | null> { return id === lesson.id ? lesson : null; }
}

class FakeStats implements StatsRepository {
  stored: UserStats | null = null;
  async findByUser(): Promise<UserStats | null> { return this.stored; }
  async save(stats: UserStats): Promise<void> { this.stored = stats; }
}

class FakeAchievements implements AchievementsRepository {
  unlocked: string[] = [];
  async listUnlockedIds(): Promise<string[]> { return this.unlocked; }
  async unlock(_userId: string, achievementId: string): Promise<void> { this.unlocked.push(achievementId); }
}

describe('API de progreso', () => {
  let app: INestApplication;
  const progress = new FakeProgress();

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
    process.env.PEXELS_API_KEY = 'stub';
    const moduleRef = await Test.createTestingModule({ imports: [ContentApiModule] })
      .overrideProvider(AUTH_VERIFIER).useValue(new FakeVerifier())
      .overrideProvider(PROGRESS_REPOSITORY).useValue(progress)
      .overrideProvider(COURSE_REPOSITORY).useValue(new FakeCourses())
      .overrideProvider(STATS_REPOSITORY).useValue(new FakeStats())
      .overrideProvider(ACHIEVEMENTS_REPOSITORY).useValue(new FakeAchievements())
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('rechaza sin token', async () => {
    const res = await request(app.getHttpServer())
      .post(`/progress/lessons/${lesson.id}/complete`).expect(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('completa una lección con token válido y devuelve recompensas', async () => {
    const res = await request(app.getHttpServer())
      .post(`/progress/lessons/${lesson.id}/complete`)
      .set('Authorization', 'Bearer valid-token')
      .send({ errorCount: 2, date: '2026-07-12' })
      .expect(201);
    expect(res.body.completed).toBe(true);
    expect(res.body.rewards).toMatchObject({ xpEarned: 13, streakCount: 1, hearts: 3 });
    expect(progress.saved).toEqual([lesson.id]);
  });

  it('404 si la lección no existe', async () => {
    const res = await request(app.getHttpServer())
      .post('/progress/lessons/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/complete')
      .set('Authorization', 'Bearer valid-token')
      .expect(404);
    expect(res.body.code).toBe('LESSON_NOT_FOUND');
  });

  it('lista el progreso del usuario', async () => {
    const res = await request(app.getHttpServer())
      .get('/progress/lessons')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
    expect(res.body).toEqual({ lessonIds: [lesson.id] });
  });
});
```

Nota: `stats-api.spec.ts` (endpoint `GET /me/stats`) NO necesita este override — `GetStatsUseCase`
no depende de `AchievementsRepository`, así que Nest instancia el provider real
(`SupabaseAchievementsRepository`) sin que su constructor haga ninguna llamada de red; solo se
ejecutaría una consulta real si algo en ese test invocara `listUnlockedIds`/`unlock`, y no ocurre.

- [ ] **Step 6: Verificar todo** — Run: `pnpm --filter @lingoleap/api test && pnpm build && pnpm lint`
  — Expected: todo PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): completar lección otorga logros y gemas al cruzar un hito"
```

---

### Task 4: GetAchievementsUseCase + endpoint GET /me/achievements

**Files:**
- Create: `apps/api/src/application/use-cases/get-achievements.use-case.ts`,
  `apps/api/src/presentation/achievements.controller.ts`
- Modify: `apps/api/src/presentation/content-api.module.ts`
- Test: `apps/api/src/application/use-cases/get-achievements.use-case.spec.ts`,
  `apps/api/src/presentation/achievements-api.spec.ts`

**Interfaces:**
- Consumes: `ACHIEVEMENTS`, `AchievementStatus` de `@lingoleap/core` (Task 2);
  `AchievementsRepository`/`ACHIEVEMENTS_REPOSITORY` (Task 1); `AuthGuard` existente.
- Produces:
```ts
export class GetAchievementsUseCase {
  constructor(achievements: AchievementsRepository);
  execute(userId: string): Promise<AchievementStatus[]>;
}
// GET /me/achievements (con AuthGuard) → 200 AchievementStatus[]
```

- [ ] **Step 1: Test unit que falla** — `get-achievements.use-case.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AchievementsRepository } from '../ports/achievements.repository';
import { GetAchievementsUseCase } from './get-achievements.use-case';

class FakeAchievements implements AchievementsRepository {
  constructor(private readonly unlocked: string[]) {}
  async listUnlockedIds(): Promise<string[]> { return this.unlocked; }
  async unlock(): Promise<void> {}
}

describe('GetAchievementsUseCase', () => {
  it('devuelve los 8 logros marcando cuáles ya desbloqueó el usuario', async () => {
    const useCase = new GetAchievementsUseCase(new FakeAchievements(['streak-3', 'level-5']));
    const result = await useCase.execute('u1');
    expect(result).toHaveLength(8);
    expect(result.find((a) => a.id === 'streak-3')).toMatchObject({ unlocked: true });
    expect(result.find((a) => a.id === 'streak-7')).toMatchObject({ unlocked: false });
    expect(result.find((a) => a.id === 'level-5')).toMatchObject({ unlocked: true });
  });

  it('devuelve los 8 con unlocked=false si el usuario no tiene ninguno', async () => {
    const useCase = new GetAchievementsUseCase(new FakeAchievements([]));
    const result = await useCase.execute('u1');
    expect(result.every((a) => a.unlocked === false)).toBe(true);
  });
});
```

Run: `pnpm --filter @lingoleap/api test -- get-achievements` — Expected: FAIL.

- [ ] **Step 2: Implementar el caso de uso**:

```ts
// apps/api/src/application/use-cases/get-achievements.use-case.ts
import { ACHIEVEMENTS, type AchievementStatus } from '@lingoleap/core';
import type { AchievementsRepository } from '../ports/achievements.repository';

export class GetAchievementsUseCase {
  constructor(private readonly achievements: AchievementsRepository) {}

  async execute(userId: string): Promise<AchievementStatus[]> {
    const unlockedIds = await this.achievements.listUnlockedIds(userId);
    return ACHIEVEMENTS.map((a) => ({ ...a, unlocked: unlockedIds.includes(a.id) }));
  }
}
```

Run unit de nuevo — Expected: PASS.

- [ ] **Step 3: Test e2e que falla** — `achievements-api.spec.ts` (calcar el arnés de
  `stats-api.spec.ts`: mismo `FakeVerifier`, mismos env stubs, override de
  `ACHIEVEMENTS_REPOSITORY` con un fake en memoria):

```ts
// apps/api/src/presentation/achievements-api.spec.ts
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedUser, AuthVerifier } from '../application/ports/auth-verifier.port';
import { AUTH_VERIFIER } from '../application/ports/auth-verifier.port';
import type { AchievementsRepository } from '../application/ports/achievements.repository';
import { ACHIEVEMENTS_REPOSITORY } from '../application/ports/achievements.repository';
import { ContentApiModule } from './content-api.module';
import { DomainExceptionFilter } from './domain-exception.filter';

class FakeVerifier implements AuthVerifier {
  async verifyToken(token: string): Promise<AuthenticatedUser | null> {
    return token === 'valid-token' ? { id: 'user-1', email: 'a@b.com' } : null;
  }
}

class FakeAchievements implements AchievementsRepository {
  unlocked: string[] = ['streak-3'];
  async listUnlockedIds(): Promise<string[]> { return this.unlocked; }
  async unlock(_userId: string, achievementId: string): Promise<void> { this.unlocked.push(achievementId); }
}

describe('API de logros', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
    process.env.PEXELS_API_KEY = 'stub';
    const moduleRef = await Test.createTestingModule({ imports: [ContentApiModule] })
      .overrideProvider(AUTH_VERIFIER).useValue(new FakeVerifier())
      .overrideProvider(ACHIEVEMENTS_REPOSITORY).useValue(new FakeAchievements())
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('rechaza sin token', async () => {
    await request(app.getHttpServer()).get('/me/achievements').expect(401);
  });

  it('devuelve los 8 logros con el estado de desbloqueo del usuario', async () => {
    const res = await request(app.getHttpServer())
      .get('/me/achievements')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
    expect(res.body).toHaveLength(8);
    expect(res.body.find((a: { id: string }) => a.id === 'streak-3')).toMatchObject({ unlocked: true });
    expect(res.body.find((a: { id: string }) => a.id === 'streak-7')).toMatchObject({ unlocked: false });
  });
});
```

Run: `pnpm --filter @lingoleap/api test -- achievements-api` — Expected: FAIL (controller no
existe).

- [ ] **Step 4: Implementar controller y wiring**:

```ts
// apps/api/src/presentation/achievements.controller.ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { AchievementStatus } from '@lingoleap/core';
import { GetAchievementsUseCase } from '../application/use-cases/get-achievements.use-case';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';

@Controller('me')
@UseGuards(AuthGuard)
export class AchievementsController {
  constructor(private readonly getAchievements: GetAchievementsUseCase) {}

  @Get('achievements')
  achievements(@Req() req: AuthenticatedRequest): Promise<AchievementStatus[]> {
    return this.getAchievements.execute(req.user.id);
  }
}
```

En `content-api.module.ts`: agregar `AchievementsController` a `controllers`, importar
`GetAchievementsUseCase` y `AchievementsController`, y agregar su provider (después del
provider de `GetStatsUseCase`):

```ts
// content-api.module.ts — agregar a los imports:
import { GetAchievementsUseCase } from '../application/use-cases/get-achievements.use-case';
import { AchievementsController } from './achievements.controller';

// controllers: agregar AchievementsController
controllers: [CoursesController, LessonsController, ProgressController, StatsController, AchievementsController],

// providers: agregar después de GetStatsUseCase
{
  provide: GetAchievementsUseCase,
  useFactory: (achievements: AchievementsRepository) => new GetAchievementsUseCase(achievements),
  inject: [ACHIEVEMENTS_REPOSITORY]
},
```

- [ ] **Step 5: Verificar** — Run: `pnpm --filter @lingoleap/api test` — Expected: PASS (todos,
  nuevos y previos).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): endpoint GET /me/achievements con el catálogo y su estado"
```

---

### Task 5: api-client — getAchievements()

**Files:**
- Modify: `packages/api-client/src/client.ts`
- Test: `packages/api-client/src/client.spec.ts`

**Interfaces:**
- Consumes: `AchievementStatus` de `@lingoleap/core`; endpoint de Task 4.
- Produces:
```ts
getAchievements(): Promise<AchievementStatus[]>;
```

- [ ] **Step 1: Test que falla (msw)** — agregar a `client.spec.ts`:

```ts
it('getAchievements envía el token y devuelve el catálogo con su estado', async () => {
  server.use(
    http.get(`${BASE}/me/achievements`, ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer token-123');
      return HttpResponse.json([
        { id: 'streak-3', category: 'streak', threshold: 3, gems: 5, unlocked: true },
        { id: 'streak-7', category: 'streak', threshold: 7, gems: 15, unlocked: false }
      ]);
    })
  );
  const client = new LingoApiClient({ baseUrl: BASE, getAccessToken: async () => 'token-123' });
  const achievements = await client.getAchievements();
  expect(achievements).toHaveLength(2);
  expect(achievements[0]).toMatchObject({ id: 'streak-3', unlocked: true });
});
```

Run: `pnpm --filter @lingoleap/api-client test` — Expected: FAIL.

- [ ] **Step 2: Implementar** en `client.ts` (ampliar el import de tipos y agregar el método,
  después de `getStats`):

```ts
import type {
  AchievementStatus, CEFRLevel, Course, CourseSummary, LearningLanguage, Lesson, LessonRewards, StatsSummary
} from '@lingoleap/core';

// ...

getAchievements(): Promise<AchievementStatus[]> {
  return this.request('/me/achievements');
}
```

- [ ] **Step 3: Verificar** — Run: `pnpm --filter @lingoleap/api-client test && pnpm build` —
  Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api-client/src
git commit -m "feat(api-client): getAchievements para el catálogo de logros"
```

---

### Task 6: Web — página de Logros

**Files:**
- Create: `apps/web/src/features/achievements/queries.ts`,
  `apps/web/src/features/achievements/achievementLabels.ts`,
  `apps/web/src/features/achievements/AchievementsPage.tsx`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/features/stats/StatsBar.tsx`,
  `apps/web/src/features/stats/StatsBar.spec.tsx`, `apps/web/src/styles.css`
- Test: `apps/web/src/features/achievements/AchievementsPage.spec.tsx`

**Interfaces:**
- Consumes: `api.getAchievements()` (Task 5), `renderWithProviders` existente.
- Produces:
```ts
// queries.ts
export function useAchievements(): UseQueryResult<AchievementStatus[]>; // queryKey ['achievements']
// achievementLabels.ts
export const ACHIEVEMENT_LABEL: Record<string, string>; // copy en español por id de logro, la usa también CompletionScreen en la Task 7
// AchievementsPage.tsx
export function AchievementsPage(): JSX.Element;
```

- [ ] **Step 1: Test que falla** — `AchievementsPage.spec.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const getAchievements = vi.hoisted(() => vi.fn());
vi.mock('../../app/api', () => ({ api: { getAchievements } }));

import { AchievementsPage } from './AchievementsPage';
import { renderWithProviders } from '../../test/render';

describe('AchievementsPage', () => {
  it('agrupa los logros por categoría y marca cuáles están desbloqueados', async () => {
    getAchievements.mockResolvedValue([
      { id: 'streak-3', category: 'streak', threshold: 3, gems: 5, unlocked: true },
      { id: 'streak-7', category: 'streak', threshold: 7, gems: 15, unlocked: false },
      { id: 'lessons-10', category: 'lessons', threshold: 10, gems: 5, unlocked: false }
    ]);
    renderWithProviders(<AchievementsPage />, { route: '/achievements' });
    expect(await screen.findByText('Racha de 3 días')).toBeInTheDocument();
    expect(screen.getByText('Lecciones completadas')).toBeInTheDocument();
    const unlockedItem = screen.getByText('Racha de 3 días').closest('li');
    expect(unlockedItem).toHaveTextContent('✅');
    const lockedItem = screen.getByText('Racha de 7 días').closest('li');
    expect(lockedItem).toHaveTextContent('🔒');
  });

  it('muestra un error si falla la carga', async () => {
    getAchievements.mockRejectedValue(new Error('network'));
    renderWithProviders(<AchievementsPage />, { route: '/achievements' });
    expect(await screen.findByText('No pudimos cargar tus logros.')).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @lingoleap/web test` — Expected: FAIL.

- [ ] **Step 2: Implementar**:

```ts
// apps/web/src/features/achievements/queries.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../../app/api';

export function useAchievements() {
  return useQuery({ queryKey: ['achievements'], queryFn: () => api.getAchievements() });
}
```

```ts
// apps/web/src/features/achievements/achievementLabels.ts
// Copy en español por id de logro. Vive separado del catálogo puro de packages/core
// (que solo tiene id/categoría/umbral/gemas) para no mezclar texto de UI con lógica —
// la reusa también CompletionScreen (Task 7).
export const ACHIEVEMENT_LABEL: Record<string, string> = {
  'streak-3': 'Racha de 3 días',
  'streak-7': 'Racha de 7 días',
  'streak-30': 'Racha de 30 días',
  'lessons-10': '10 lecciones completadas',
  'lessons-50': '50 lecciones completadas',
  'lessons-100': '100 lecciones completadas',
  'level-5': 'Nivel 5 alcanzado',
  'level-10': 'Nivel 10 alcanzado'
};
```

```tsx
// apps/web/src/features/achievements/AchievementsPage.tsx
import type { AchievementCategory, AchievementStatus } from '@lingoleap/core';
import { ACHIEVEMENT_LABEL } from './achievementLabels';
import { useAchievements } from './queries';

const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  streak: 'Racha',
  lessons: 'Lecciones completadas',
  level: 'Nivel'
};

const CATEGORY_ORDER: AchievementCategory[] = ['streak', 'lessons', 'level'];

function groupByCategory(items: AchievementStatus[]): Record<AchievementCategory, AchievementStatus[]> {
  const groups: Record<AchievementCategory, AchievementStatus[]> = { streak: [], lessons: [], level: [] };
  for (const item of items) {
    groups[item.category].push(item);
  }
  return groups;
}

export function AchievementsPage() {
  const { data, isPending, isError } = useAchievements();

  if (isPending) {
    return (
      <div className="container">
        <p>Cargando…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container">
        <p role="alert">No pudimos cargar tus logros.</p>
      </div>
    );
  }

  const groups = groupByCategory(data);

  return (
    <div className="container">
      <h2>Logros</h2>
      {CATEGORY_ORDER.map((category) => (
        <section key={category} className="achievements-group">
          <h3>{CATEGORY_LABEL[category]}</h3>
          <ul className="achievements-list">
            {groups[category].map((item) => (
              <li key={item.id} className="achievements-item">
                <span aria-hidden="true">{item.unlocked ? '✅' : '🔒'}</span>
                <span>{ACHIEVEMENT_LABEL[item.id]}</span>
                <span className="achievements-gems">+{item.gems}💎</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Ruta nueva** en `apps/web/src/App.tsx` (agregar el import y la `<Route>`, después
  de la ruta `/lesson/:lessonId`):

```tsx
import { Route, Routes } from 'react-router-dom';
import { AchievementsPage } from './features/achievements/AchievementsPage';
import { LoginPage } from './features/auth/LoginPage';
import { RequireAuth } from './features/auth/RequireAuth';
import { CoursesPage } from './features/course-path/CoursesPage';
import { CoursePathPage } from './features/course-path/CoursePathPage';
import { LessonPlayerPage } from './features/lesson-player/LessonPlayerPage';

export default function App() {
  return (
    <>
      <h1>LingoLeap</h1>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <CoursesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/course/:language/:level"
          element={
            <RequireAuth>
              <CoursePathPage />
            </RequireAuth>
          }
        />
        <Route
          path="/lesson/:lessonId"
          element={
            <RequireAuth>
              <LessonPlayerPage />
            </RequireAuth>
          }
        />
        <Route
          path="/achievements"
          element={
            <RequireAuth>
              <AchievementsPage />
            </RequireAuth>
          }
        />
      </Routes>
    </>
  );
}
```

- [ ] **Step 4: Acceso desde la StatsBar** — modificar `StatsBar.tsx` para que el contador de
  gemas sea un link a `/achievements`:

```tsx
// apps/web/src/features/stats/StatsBar.tsx
import { Link } from 'react-router-dom';
import { useStats } from './queries';

export function StatsBar() {
  const { data } = useStats();
  if (!data) return null;
  const levelTotal = data.xpIntoLevel + data.xpToNextLevel;
  const percent = levelTotal === 0 ? 0 : Math.round((data.xpIntoLevel / levelTotal) * 100);
  return (
    <div className="stats-bar">
      <span className="stats-item" title="Racha de días seguidos">🔥 {data.streakCount}</span>
      <span className="stats-item" title="Corazones">❤️ {data.hearts}</span>
      <Link to="/achievements" className="stats-item stats-gems-link" title="Ver logros">💎 {data.gems}</Link>
      <span className="stats-item" title="Nivel">⚡ Nivel {data.level}</span>
      <div
        className="stats-level-bar"
        role="progressbar"
        aria-label={`Progreso del nivel ${data.level}`}
        aria-valuenow={data.xpIntoLevel}
        aria-valuemin={0}
        aria-valuemax={levelTotal}
      >
        <div className="stats-level-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
```

Actualizar `StatsBar.spec.tsx` (agregar la aserción del link, al final del test existente):

```tsx
// apps/web/src/features/stats/StatsBar.spec.tsx — agregar antes del cierre del it():
    expect(screen.getByRole('link', { name: /💎 0/ })).toHaveAttribute('href', '/achievements');
```

- [ ] **Step 5: CSS** — agregar a `apps/web/src/styles.css` (al final del archivo, solo tokens):

```css
.stats-gems-link {
  text-decoration: none;
  color: inherit;
}

.achievements-group {
  margin-bottom: var(--space-lg);
}

.achievements-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.achievements-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.achievements-gems {
  margin-left: auto;
  color: var(--color-text-muted);
  font-weight: 700;
}
```

- [ ] **Step 6: Verificar** — Run: `pnpm --filter @lingoleap/web test && pnpm build && pnpm lint`
  — Expected: PASS (los specs existentes de `StatsBar`/`App` siguen verdes).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): página de Logros y acceso desde la StatsBar"
```

---

### Task 7: Web — aviso de logro nuevo en CompletionScreen

**Files:**
- Modify: `apps/web/src/features/lesson-player/CompletionScreen.tsx`,
  `apps/web/src/features/lesson-player/LessonPlayerPage.spec.tsx`, `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `ACHIEVEMENT_LABEL` de `../achievements/achievementLabels` (Task 6);
  `rewards.gemsEarned`/`rewards.achievementsUnlocked` (ya llegan en `LessonRewards`, Task 2 — no
  hay cambios en `LessonPlayerPage.tsx`, que ya pasa `rewards` completo como prop).

- [ ] **Step 1: Extender el fixture y los tests existentes (RED)** — en
  `LessonPlayerPage.spec.tsx`, el `rewards` de `vi.hoisted` gana los 2 campos nuevos, y se agrega
  un test para el aviso de logro nuevo. Localizar el bloque `vi.hoisted` al inicio del archivo y
  reemplazar `rewards` así (el resto del `vi.hoisted` no cambia):

```ts
    rewards: { xpEarned: 15, totalXp: 15, level: 1, streakCount: 1, freezeUsed: false, hearts: 5, gemsEarned: 0, achievementsUnlocked: [] },
```

Agregar al final del `describe('LessonPlayerPage', ...)`, antes del cierre:

```ts
  it('muestra un aviso por cada logro nuevo al completar la lección', async () => {
    completeLesson.mockResolvedValue({
      xpEarned: 15, totalXp: 15, level: 1, streakCount: 1, freezeUsed: false, hearts: 5,
      gemsEarned: 5,
      achievementsUnlocked: [{ id: 'streak-3', category: 'streak', threshold: 3, gems: 5 }]
    });
    renderWithProviders(<LessonPlayerPage />, { route: '/lesson/l1?lang=en', path: '/lesson/:lessonId' });

    await userEvent.click(await screen.findByRole('button', { name: 'water' }));
    await userEvent.click(screen.getByRole('button', { name: 'agua' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await userEvent.click(screen.getByRole('button', { name: /milk/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByText('🏆 Nuevo logro: Racha de 3 días (+5💎)')).toBeInTheDocument();
  });
```

Run: `pnpm --filter @lingoleap/web test -- LessonPlayerPage` — Expected: FAIL (el test del
fixture actualizado falla por `toEqual` con campos faltantes en el `LessonRewards` que devuelve
`CompletionScreen`, y el test nuevo del aviso falla porque el aviso no existe todavía).

- [ ] **Step 2: Implementar** en `CompletionScreen.tsx`:

```tsx
// apps/web/src/features/lesson-player/CompletionScreen.tsx
import type { LessonRewards } from '@lingoleap/core';
import { ACHIEVEMENT_LABEL } from '../achievements/achievementLabels';

export interface CompletionScreenProps {
  correctCount: number;
  wrongCount: number;
  onBack: () => void;
  saveError?: boolean;
  onRetry?: () => void;
  retryPending?: boolean;
  rewards?: LessonRewards;
}

export function CompletionScreen({
  correctCount,
  wrongCount,
  onBack,
  saveError,
  onRetry,
  retryPending,
  rewards
}: CompletionScreenProps) {
  return (
    <div className="container">
      <h2>¡Lección completada!</h2>
      {rewards && (
        <div className="completion-rewards">
          <p className="completion-xp">+{rewards.xpEarned} XP</p>
          <p>🔥 Racha: {rewards.streakCount} {rewards.streakCount === 1 ? 'día' : 'días'}</p>
          {rewards.freezeUsed && <p>🧊 Un congelador salvó tu racha</p>}
          {rewards.achievementsUnlocked.map((achievement) => (
            <p key={achievement.id} className="completion-achievement">
              🏆 Nuevo logro: {ACHIEVEMENT_LABEL[achievement.id]} (+{achievement.gems}💎)
            </p>
          ))}
        </div>
      )}
      <p className="completion-screen-phrase">¡Gran trabajo! Cada lección te acerca más.</p>
      <p>Aciertos: {correctCount}</p>
      <p>Errores: {wrongCount}</p>
      {(saveError || retryPending) && (
        <div role="alert" style={{ color: 'var(--color-danger)', marginBottom: 'var(--space-md)' }}>
          <p style={{ margin: 0 }}>No pudimos guardar tu progreso.</p>
          <button
            type="button"
            className="button button-primary"
            onClick={onRetry}
            disabled={retryPending}
            style={{ marginTop: 'var(--space-sm)' }}
          >
            Reintentar
          </button>
        </div>
      )}
      <button type="button" className="button button-primary" onClick={onBack}>
        Volver al curso
      </button>
    </div>
  );
}
```

- [ ] **Step 3: CSS** — agregar a `apps/web/src/styles.css` (junto a `.completion-xp`):

```css
.completion-achievement {
  font-weight: 700;
  color: var(--color-warning);
}
```

- [ ] **Step 4: Verificar** — Run: `pnpm --filter @lingoleap/web test && pnpm build && pnpm lint`
  — Expected: PASS (todos, incluidos los previos del player).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): aviso de logro nuevo al completar una lección"
```

---

### Task 8: Documentación de la fase

**Files:**
- Modify: `README.md` (sección "Gamificación" con los logros y sus gemas; roadmap sin cambiar de
  fase — sigue siendo "Fase 3A" la completa, este es un sub-corte de 3B), `docs/BITACORA.md`
  (entrada "Fase 3B (logros y gemas)" con el mismo formato que las fases anteriores:
  decisiones+alternativas+porqués, problemas reales de los reportes de tareas, deuda técnica, y
  guía de entrevista con los temas nuevos: catálogo estático vs. tabla de catálogo, idempotencia
  de logros en reintentos, por qué el copy de logros vive en la web y no en `packages/core`)

- [ ] **Step 1: Actualizar ambos documentos.** La entrada de BITACORA se escribe con los
  problemas reales que hayan aparecido en las tareas 1-7 (revisar los reportes en
  `.superpowers/sdd/` y los commits) — nada genérico. Documentar explícitamente las decisiones de
  diseño de este corte y su porqué: (1) catálogo estático en código en vez de tabla en base de
  datos; (2) tabla `user_achievements` como join table (mismo patrón que `user_progress`) en vez
  de un array/jsonb en `user_stats`; (3) evaluación de logros dentro de `CompleteLessonUseCase`
  en el mismo request, no en un job aparte.

- [ ] **Step 2: Verificar y commitear**

Run: `pnpm lint && pnpm build && pnpm test` — Expected: PASS.

```bash
git add README.md docs/BITACORA.md
git commit -m "docs: bitácora y README de logros y gemas (Fase 3B, primer corte)"
```

---

### Task 9: Smoke real end-to-end (manual, con el usuario)

**Prerrequisitos que hace el usuario (guiarlo):**
1. En Supabase SQL Editor: ejecutar `supabase/migrations/0004_achievements.sql` (una sola vez).

- [ ] **Step 1: Levantar API y web**: `pnpm --filter @lingoleap/api dev` y
  `pnpm --filter @lingoleap/web dev`.
- [ ] **Step 2: Recorrido completo en el navegador** (el usuario):
  - Completar lecciones hasta la décima → en la pantalla final aparece
    "🏆 Nuevo logro: 10 lecciones completadas (+5💎)", y la StatsBar refleja 💎5 al volver.
  - Entrar a `/achievements` desde el contador de gemas → se ven los 8 logros agrupados por
    categoría, con "10 lecciones completadas" ya con ✅ y el resto con 🔒.
  - Completar 2 lecciones más el mismo día → la StatsBar sigue mostrando 5 gemas si no se cruzó
    ningún otro umbral (no se duplican gemas por seguir jugando).
  - Cerrar sesión y volver a entrar → los logros desbloqueados persisten (verificar también la
    fila en Supabase → Table Editor → `user_achievements`).
- [ ] **Step 3: Registrar resultado** en `.superpowers/sdd/progress.md` y en la BITACORA si hubo
  hallazgos.

---

## Verificación final de este corte de la Fase 3B

- [ ] `pnpm lint && pnpm build && pnpm test` en verde (core + api + api-client + web).
- [ ] Smoke del Task 9 completado con el recorrido real.
- [ ] Merge a master + push + CI verde (flujo de cierre habitual).
