# Fase 3A — Gamificación: XP, niveles, racha y corazones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stats individuales de gamificación end-to-end: el usuario gana XP y sube de nivel al completar lecciones, mantiene una racha diaria, y pierde/regenera corazones — visible en la web y validado siempre en el backend.

**Architecture:** Las reglas (fórmulas de XP, racha, corazones) viven en `packages/core` como funciones puras TDD (las reutilizará la app móvil); el backend las aplica dentro de `CompleteLessonUseCase` (extendido) y un nuevo `GetStatsUseCase`, persistiendo en la tabla `user_stats` (Supabase, RLS) vía el puerto `StatsRepository`. La web muestra una StatsBar (TanStack Query `['stats']`), envía `errorCount` + fecha local al completar, muestra recompensas en la CompletionScreen y bloquea lecciones nuevas sin corazones.

**Tech Stack:** El existente del monorepo: NestJS 11 hexagonal, Supabase (Postgres + RLS), Vitest (+ msw, supertest, Testing Library), React 18 + TanStack Query + zustand, tokens CSS.

**Fuera de alcance (Fase 3B, plan aparte):** logros, gemas ganadas, compra de congelador de racha, liga semanal y cron. En 3A las columnas `gems` y `streak_freezes` existen en BD y en los tipos (para no re-migrar), pero ninguna operación las incrementa; el congelador SÍ se consume si el usuario ya tuviera alguno (la regla de racha lo contempla desde ya).

## Global Constraints

- TypeScript `strict: true`; prohibido `any` explícito. Copy de UI y mensajes de error en español.
- Regla de capas API: `domain/` puro; `application/` solo domain+core; `infrastructure/` implementa puertos; `presentation/` solo llama casos de uso. Clases de application/infrastructure sin decoradores NestJS (wiring por `useFactory` en `content-api.module.ts`).
- La web NUNCA llama `fetch` directo: todo por `@lingoleap/api-client`; auth por `@supabase/supabase-js`.
- Colores/espaciados solo desde `@lingoleap/tokens` (verde `#58CC02`, rojo `#FF4B4B`, azul `#1CB0F6`, amarillo `#FFC800`); sombras solo `var(--shadow-sm)`.
- Reglas de gamificación en `packages/core` (funciones puras, sin frameworks) y **aplicadas/validadas en el backend**; la UI solo refleja.
- **Fórmulas exactas (del spec §9, cerradas aquí):** XP por lección = `clamp(15 − errores, 10, 15)`. XP acumulado para alcanzar el nivel n = `100 · (2^(n−1) − 1)` (nivel 1 = 0 XP, nivel 2 = 100, nivel 3 = 300, nivel 4 = 700). Racha: la extiende ≥1 lección/día (fecha local del usuario enviada por el cliente como `YYYY-MM-DD`; si falta o es inválida, el servidor usa su fecha UTC); un día saltado se cubre con 1 congelador si hay disponibles; si no, la racha vuelve a 1. Corazones: máx. 5, −1 por error, regeneran 1 cada 4 horas (calculado al leer, no con jobs); sin corazones solo se pueden abrir lecciones ya completadas (repaso).
- TDD en `packages/core` y backend (evidencia RED→GREEN); componentes web con Testing Library.
- Commits convencionales en español al final de cada tarea + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- pnpm 11; monorepo existente en `lingoleap/`; rama de trabajo nueva sobre `master`.

---

### Task 1: Migración `user_stats` + dominio + puerto + adaptador Supabase

**Files:**
- Create: `supabase/migrations/0003_stats.sql`, `apps/api/src/domain/user-stats.ts`, `apps/api/src/application/ports/stats.repository.ts`, `apps/api/src/infrastructure/persistence/supabase/supabase-stats.repository.ts`
- Test: `apps/api/src/infrastructure/persistence/supabase/supabase-stats.repository.spec.ts`

**Interfaces:**
- Consumes: factory `SUPABASE_CLIENT` existente (mismo patrón que `SupabaseProgressRepository`).
- Produces:
```ts
// apps/api/src/domain/user-stats.ts
export interface UserStats {
  userId: string;
  xp: number;
  streakCount: number;
  lastLessonDate: string | null; // YYYY-MM-DD
  hearts: number;
  heartsUpdatedAt: string; // ISO timestamp desde el que se cuenta la regeneración
  gems: number;
  streakFreezes: number;
}
export function defaultUserStats(userId: string, nowIso: string): UserStats;

// apps/api/src/application/ports/stats.repository.ts
export interface StatsRepository {
  findByUser(userId: string): Promise<UserStats | null>;
  save(stats: UserStats): Promise<void>; // upsert por user_id
}
```

- [ ] **Step 1: Escribir la migración** `supabase/migrations/0003_stats.sql` (se ejecuta UNA vez a mano en el SQL Editor, como 0001/0002):

```sql
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
```

- [ ] **Step 2: Test que falla** — `supabase-stats.repository.spec.ts` (mismo estilo de mock encadenado que `supabase-progress.repository.spec.ts` — leerlo antes y calcar su forma de mockear el cliente):

```ts
import { describe, expect, it, vi } from 'vitest';
import { SupabaseStatsRepository } from './supabase-stats.repository';

const row = {
  user_id: 'u1', xp: 120, streak_count: 3, last_lesson_date: '2026-07-12',
  hearts: 4, hearts_updated_at: '2026-07-12T10:00:00.000Z', gems: 0, streak_freezes: 0
};

function clientWith(result: { data: unknown; error: { message: string } | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ select, upsert });
  return { client: { from } as never, from, upsert };
}

describe('SupabaseStatsRepository', () => {
  it('mapea la fila snake_case al dominio', async () => {
    const { client } = clientWith({ data: row, error: null });
    const repo = new SupabaseStatsRepository(client);
    const stats = await repo.findByUser('u1');
    expect(stats).toEqual({
      userId: 'u1', xp: 120, streakCount: 3, lastLessonDate: '2026-07-12',
      hearts: 4, heartsUpdatedAt: '2026-07-12T10:00:00.000Z', gems: 0, streakFreezes: 0
    });
  });

  it('devuelve null si el usuario no tiene fila', async () => {
    const { client } = clientWith({ data: null, error: null });
    const repo = new SupabaseStatsRepository(client);
    expect(await repo.findByUser('u1')).toBeNull();
  });

  it('guarda con upsert en snake_case', async () => {
    const { client, upsert } = clientWith({ data: null, error: null });
    const repo = new SupabaseStatsRepository(client);
    await repo.save({
      userId: 'u1', xp: 120, streakCount: 3, lastLessonDate: '2026-07-12',
      hearts: 4, heartsUpdatedAt: '2026-07-12T10:00:00.000Z', gems: 0, streakFreezes: 0
    });
    expect(upsert).toHaveBeenCalledWith(row);
  });
});
```

Run: `pnpm --filter @lingoleap/api test -- supabase-stats` — Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar** dominio, puerto y adaptador:

```ts
// apps/api/src/domain/user-stats.ts
export interface UserStats {
  userId: string;
  xp: number;
  streakCount: number;
  lastLessonDate: string | null;
  hearts: number;
  heartsUpdatedAt: string;
  gems: number;
  streakFreezes: number;
}

export function defaultUserStats(userId: string, nowIso: string): UserStats {
  return {
    userId, xp: 0, streakCount: 0, lastLessonDate: null,
    hearts: 5, heartsUpdatedAt: nowIso, gems: 0, streakFreezes: 0
  };
}
```

```ts
// apps/api/src/application/ports/stats.repository.ts
import type { UserStats } from '../../domain/user-stats';

export const STATS_REPOSITORY = Symbol('StatsRepository');

export interface StatsRepository {
  findByUser(userId: string): Promise<UserStats | null>;
  save(stats: UserStats): Promise<void>;
}
```

```ts
// apps/api/src/infrastructure/persistence/supabase/supabase-stats.repository.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StatsRepository } from '../../../application/ports/stats.repository';
import type { UserStats } from '../../../domain/user-stats';

interface UserStatsRow {
  user_id: string;
  xp: number;
  streak_count: number;
  last_lesson_date: string | null;
  hearts: number;
  hearts_updated_at: string;
  gems: number;
  streak_freezes: number;
}

export class SupabaseStatsRepository implements StatsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findByUser(userId: string): Promise<UserStats | null> {
    const { data, error } = await this.client
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`No se pudo leer user_stats: ${error.message}`);
    if (data === null) return null;
    const row = data as UserStatsRow;
    return {
      userId: row.user_id, xp: row.xp, streakCount: row.streak_count,
      lastLessonDate: row.last_lesson_date, hearts: row.hearts,
      heartsUpdatedAt: row.hearts_updated_at, gems: row.gems, streakFreezes: row.streak_freezes
    };
  }

  async save(stats: UserStats): Promise<void> {
    const { error } = await this.client.from('user_stats').upsert({
      user_id: stats.userId, xp: stats.xp, streak_count: stats.streakCount,
      last_lesson_date: stats.lastLessonDate, hearts: stats.hearts,
      hearts_updated_at: stats.heartsUpdatedAt, gems: stats.gems, streak_freezes: stats.streakFreezes
    });
    if (error) throw new Error(`No se pudo guardar user_stats: ${error.message}`);
  }
}
```

- [ ] **Step 4: Verificar** — Run: `pnpm --filter @lingoleap/api test -- supabase-stats` — Expected: PASS (3 tests). Luego `pnpm --filter @lingoleap/api test` completo: los 49 previos siguen verdes.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_stats.sql apps/api/src/domain/user-stats.ts apps/api/src/application/ports/stats.repository.ts apps/api/src/infrastructure/persistence/supabase/
git commit -m "feat(api): tabla user_stats con puerto y adaptador de estadísticas"
```

---

### Task 2: Core — XP y niveles

**Files:**
- Create: `packages/core/src/logic/xp.ts`
- Modify: `packages/core/src/index.ts` (agregar `export * from './logic/xp';`)
- Test: `packages/core/src/logic/xp.spec.ts`

**Interfaces:**
- Produces:
```ts
export const XP_MIN_PER_LESSON = 10;
export const XP_MAX_PER_LESSON = 15;
export function lessonXp(errorCount: number): number;
export function xpRequiredForLevel(level: number): number; // XP acumulado para ALCANZAR el nivel
export interface LevelProgress { level: number; xpIntoLevel: number; xpToNextLevel: number }
export function levelProgress(totalXp: number): LevelProgress;
```

- [ ] **Step 1: Test que falla** — `xp.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lessonXp, levelProgress, xpRequiredForLevel } from './xp';

describe('lessonXp', () => {
  it('da 15 XP sin errores y resta 1 por error hasta el piso de 10', () => {
    expect(lessonXp(0)).toBe(15);
    expect(lessonXp(3)).toBe(12);
    expect(lessonXp(5)).toBe(10);
    expect(lessonXp(20)).toBe(10);
  });

  it('trata entradas inválidas como 0 errores hacia abajo', () => {
    expect(lessonXp(-4)).toBe(15);
  });
});

describe('niveles', () => {
  it('la curva es exponencial: 0, 100, 300, 700', () => {
    expect(xpRequiredForLevel(1)).toBe(0);
    expect(xpRequiredForLevel(2)).toBe(100);
    expect(xpRequiredForLevel(3)).toBe(300);
    expect(xpRequiredForLevel(4)).toBe(700);
  });

  it('calcula nivel actual, XP dentro del nivel y XP restante', () => {
    expect(levelProgress(0)).toEqual({ level: 1, xpIntoLevel: 0, xpToNextLevel: 100 });
    expect(levelProgress(120)).toEqual({ level: 2, xpIntoLevel: 20, xpToNextLevel: 180 });
    expect(levelProgress(300)).toEqual({ level: 3, xpIntoLevel: 0, xpToNextLevel: 400 });
  });
});
```

- [ ] **Step 2: Verificar RED** — Run: `pnpm --filter @lingoleap/core test` — Expected: FAIL (`./xp` no existe).

- [ ] **Step 3: Implementar** `xp.ts`:

```ts
export const XP_MIN_PER_LESSON = 10;
export const XP_MAX_PER_LESSON = 15;

export function lessonXp(errorCount: number): number {
  const errors = Math.max(0, Math.floor(errorCount));
  return Math.max(XP_MIN_PER_LESSON, XP_MAX_PER_LESSON - errors);
}

export function xpRequiredForLevel(level: number): number {
  return 100 * (2 ** (level - 1) - 1);
}

export interface LevelProgress {
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
}

export function levelProgress(totalXp: number): LevelProgress {
  let level = 1;
  while (xpRequiredForLevel(level + 1) <= totalXp) {
    level += 1;
  }
  const base = xpRequiredForLevel(level);
  return { level, xpIntoLevel: totalXp - base, xpToNextLevel: xpRequiredForLevel(level + 1) - totalXp };
}
```

- [ ] **Step 4: Verificar GREEN** — Run: `pnpm --filter @lingoleap/core test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/logic/xp.ts packages/core/src/logic/xp.spec.ts packages/core/src/index.ts
git commit -m "feat(core): fórmula de XP por lección y curva exponencial de niveles"
```

---

### Task 3: Core — racha diaria

**Files:**
- Create: `packages/core/src/logic/streak.ts`
- Modify: `packages/core/src/index.ts` (agregar `export * from './logic/streak';`)
- Test: `packages/core/src/logic/streak.spec.ts`

**Interfaces:**
- Produces:
```ts
export interface StreakInput { count: number; lastDate: string | null; freezes: number }
export interface StreakResult { count: number; lastDate: string; freezes: number; freezeUsed: boolean }
export function applyLessonDay(input: StreakInput, today: string): StreakResult;
```
Fechas siempre `YYYY-MM-DD`. Un congelador cubre exactamente 1 día saltado.

- [ ] **Step 1: Test que falla** — `streak.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyLessonDay } from './streak';

describe('applyLessonDay', () => {
  it('inicia la racha en 1 con la primera lección', () => {
    expect(applyLessonDay({ count: 0, lastDate: null, freezes: 0 }, '2026-07-12'))
      .toEqual({ count: 1, lastDate: '2026-07-12', freezes: 0, freezeUsed: false });
  });

  it('no cambia si ya hubo lección hoy', () => {
    expect(applyLessonDay({ count: 4, lastDate: '2026-07-12', freezes: 1 }, '2026-07-12'))
      .toEqual({ count: 4, lastDate: '2026-07-12', freezes: 1, freezeUsed: false });
  });

  it('extiende la racha si la última lección fue ayer (incluye cambio de mes)', () => {
    expect(applyLessonDay({ count: 4, lastDate: '2026-06-30', freezes: 0 }, '2026-07-01'))
      .toEqual({ count: 5, lastDate: '2026-07-01', freezes: 0, freezeUsed: false });
  });

  it('cubre 1 día saltado consumiendo un congelador', () => {
    expect(applyLessonDay({ count: 4, lastDate: '2026-07-10', freezes: 2 }, '2026-07-12'))
      .toEqual({ count: 5, lastDate: '2026-07-12', freezes: 1, freezeUsed: true });
  });

  it('reinicia a 1 si se saltó un día sin congeladores', () => {
    expect(applyLessonDay({ count: 9, lastDate: '2026-07-10', freezes: 0 }, '2026-07-12'))
      .toEqual({ count: 1, lastDate: '2026-07-12', freezes: 0, freezeUsed: false });
  });

  it('reinicia a 1 si se saltaron 2+ días aunque haya congeladores', () => {
    expect(applyLessonDay({ count: 9, lastDate: '2026-07-08', freezes: 3 }, '2026-07-12'))
      .toEqual({ count: 1, lastDate: '2026-07-12', freezes: 3, freezeUsed: false });
  });
});
```

- [ ] **Step 2: Verificar RED** — Run: `pnpm --filter @lingoleap/core test` — Expected: FAIL.

- [ ] **Step 3: Implementar** `streak.ts`:

```ts
export interface StreakInput {
  count: number;
  lastDate: string | null;
  freezes: number;
}

export interface StreakResult {
  count: number;
  lastDate: string;
  freezes: number;
  freezeUsed: boolean;
}

function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function applyLessonDay(input: StreakInput, today: string): StreakResult {
  const { count, lastDate, freezes } = input;
  if (lastDate === today) {
    return { count, lastDate: today, freezes, freezeUsed: false };
  }
  if (lastDate === shiftDay(today, -1)) {
    return { count: count + 1, lastDate: today, freezes, freezeUsed: false };
  }
  if (lastDate === shiftDay(today, -2) && freezes > 0) {
    return { count: count + 1, lastDate: today, freezes: freezes - 1, freezeUsed: true };
  }
  return { count: 1, lastDate: today, freezes, freezeUsed: false };
}
```

- [ ] **Step 4: Verificar GREEN** — Run: `pnpm --filter @lingoleap/core test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/logic/streak.ts packages/core/src/logic/streak.spec.ts packages/core/src/index.ts
git commit -m "feat(core): regla de racha diaria con congelador"
```

---

### Task 4: Core — corazones + tipos compartidos de stats

**Files:**
- Create: `packages/core/src/logic/hearts.ts`, `packages/core/src/stats.ts`
- Modify: `packages/core/src/index.ts` (agregar `export * from './logic/hearts';` y `export * from './stats';`)
- Test: `packages/core/src/logic/hearts.spec.ts`

**Interfaces:**
- Produces:
```ts
// hearts.ts
export const MAX_HEARTS = 5;
export const HEART_REGEN_MS = 14400000; // 4 horas
export interface HeartsState { hearts: number; updatedAt: string } // updatedAt: ISO
export function regenerateHearts(state: HeartsState, nowIso: string): HeartsState;
export function loseHearts(hearts: number, errorCount: number): number;
export function nextHeartAt(state: HeartsState): string | null;
export function canStartLesson(hearts: number, lessonAlreadyCompleted: boolean): boolean;

// stats.ts — DTOs compartidos entre API, api-client y web
export interface StatsSummary {
  xp: number; level: number; xpIntoLevel: number; xpToNextLevel: number;
  streakCount: number; streakFreezes: number; gems: number;
  hearts: number; maxHearts: number; nextHeartAt: string | null;
}
export interface LessonRewards {
  xpEarned: number; totalXp: number; level: number;
  streakCount: number; freezeUsed: boolean; hearts: number;
}
```

- [ ] **Step 1: Test que falla** — `hearts.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canStartLesson, loseHearts, nextHeartAt, regenerateHearts } from './hearts';

describe('regenerateHearts', () => {
  it('suma 1 corazón por cada 4 horas transcurridas, conservando el resto del tiempo', () => {
    const state = { hearts: 2, updatedAt: '2026-07-12T00:00:00.000Z' };
    expect(regenerateHearts(state, '2026-07-12T09:00:00.000Z')).toEqual({
      hearts: 4,
      updatedAt: '2026-07-12T08:00:00.000Z'
    });
  });

  it('no pasa del máximo de 5 y reancla el contador al llegar al tope', () => {
    const state = { hearts: 4, updatedAt: '2026-07-12T00:00:00.000Z' };
    expect(regenerateHearts(state, '2026-07-12T23:00:00.000Z')).toEqual({
      hearts: 5,
      updatedAt: '2026-07-12T23:00:00.000Z'
    });
  });

  it('no cambia nada si no ha pasado un ciclo completo', () => {
    const state = { hearts: 3, updatedAt: '2026-07-12T00:00:00.000Z' };
    expect(regenerateHearts(state, '2026-07-12T03:59:59.000Z')).toEqual(state);
  });
});

describe('loseHearts / canStartLesson / nextHeartAt', () => {
  it('resta errores sin bajar de 0', () => {
    expect(loseHearts(5, 2)).toBe(3);
    expect(loseHearts(1, 4)).toBe(0);
  });

  it('sin corazones solo permite repaso de lecciones completadas', () => {
    expect(canStartLesson(0, false)).toBe(false);
    expect(canStartLesson(0, true)).toBe(true);
    expect(canStartLesson(1, false)).toBe(true);
  });

  it('anuncia cuándo llega el próximo corazón, o null si está lleno', () => {
    expect(nextHeartAt({ hearts: 2, updatedAt: '2026-07-12T08:00:00.000Z' })).toBe('2026-07-12T12:00:00.000Z');
    expect(nextHeartAt({ hearts: 5, updatedAt: '2026-07-12T08:00:00.000Z' })).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar RED** — Run: `pnpm --filter @lingoleap/core test` — Expected: FAIL.

- [ ] **Step 3: Implementar** `hearts.ts` y `stats.ts`:

```ts
// packages/core/src/logic/hearts.ts
export const MAX_HEARTS = 5;
export const HEART_REGEN_MS = 4 * 60 * 60 * 1000;

export interface HeartsState {
  hearts: number;
  updatedAt: string;
}

export function regenerateHearts(state: HeartsState, nowIso: string): HeartsState {
  if (state.hearts >= MAX_HEARTS) {
    return { hearts: MAX_HEARTS, updatedAt: nowIso };
  }
  const elapsed = Date.parse(nowIso) - Date.parse(state.updatedAt);
  const gained = Math.floor(elapsed / HEART_REGEN_MS);
  if (gained <= 0) return state;
  const hearts = Math.min(MAX_HEARTS, state.hearts + gained);
  const updatedAt =
    hearts >= MAX_HEARTS
      ? nowIso
      : new Date(Date.parse(state.updatedAt) + gained * HEART_REGEN_MS).toISOString();
  return { hearts, updatedAt };
}

export function loseHearts(hearts: number, errorCount: number): number {
  return Math.max(0, hearts - Math.max(0, Math.floor(errorCount)));
}

export function nextHeartAt(state: HeartsState): string | null {
  if (state.hearts >= MAX_HEARTS) return null;
  return new Date(Date.parse(state.updatedAt) + HEART_REGEN_MS).toISOString();
}

export function canStartLesson(hearts: number, lessonAlreadyCompleted: boolean): boolean {
  return lessonAlreadyCompleted || hearts > 0;
}
```

```ts
// packages/core/src/stats.ts
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
}
```

- [ ] **Step 4: Verificar GREEN** — Run: `pnpm --filter @lingoleap/core test && pnpm build` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/logic/hearts.ts packages/core/src/logic/hearts.spec.ts packages/core/src/stats.ts packages/core/src/index.ts
git commit -m "feat(core): regla de corazones con regeneración y DTOs compartidos de stats"
```

---

### Task 5: GetStatsUseCase + endpoint `GET /me/stats`

**Files:**
- Create: `apps/api/src/application/use-cases/get-stats.use-case.ts`, `apps/api/src/presentation/stats.controller.ts`
- Modify: `apps/api/src/presentation/content-api.module.ts` (registrar controller y providers)
- Test: `apps/api/src/application/use-cases/get-stats.use-case.spec.ts`, `apps/api/src/presentation/stats-api.spec.ts`

**Interfaces:**
- Consumes: `StatsRepository`/`STATS_REPOSITORY` (Task 1), `regenerateHearts`, `nextHeartAt`, `levelProgress`, `MAX_HEARTS`, `StatsSummary` de `@lingoleap/core` (Tasks 2 y 4), `AuthGuard` existente.
- Produces:
```ts
export class GetStatsUseCase {
  constructor(deps: { stats: StatsRepository; now?: () => string });
  execute(userId: string): Promise<StatsSummary>;
}
// GET /me/stats (con AuthGuard) → 200 StatsSummary
```
La regeneración de corazones se CALCULA al leer; no se persiste en el GET (se persiste solo al completar lecciones, Task 6).

- [ ] **Step 1: Test unit que falla** — `get-stats.use-case.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { StatsRepository } from '../ports/stats.repository';
import type { UserStats } from '../../domain/user-stats';
import { GetStatsUseCase } from './get-stats.use-case';

class FakeStats implements StatsRepository {
  constructor(private readonly stored: UserStats | null) {}
  saved: UserStats[] = [];
  async findByUser(): Promise<UserStats | null> { return this.stored; }
  async save(stats: UserStats): Promise<void> { this.saved.push(stats); }
}

const NOW = '2026-07-12T12:00:00.000Z';

describe('GetStatsUseCase', () => {
  it('devuelve stats por defecto (5 corazones, nivel 1) para un usuario sin fila', async () => {
    const useCase = new GetStatsUseCase({ stats: new FakeStats(null), now: () => NOW });
    const summary = await useCase.execute('u1');
    expect(summary).toEqual({
      xp: 0, level: 1, xpIntoLevel: 0, xpToNextLevel: 100,
      streakCount: 0, streakFreezes: 0, gems: 0,
      hearts: 5, maxHearts: 5, nextHeartAt: null
    });
  });

  it('regenera corazones al leer sin persistir', async () => {
    const repo = new FakeStats({
      userId: 'u1', xp: 120, streakCount: 3, lastLessonDate: '2026-07-11',
      hearts: 2, heartsUpdatedAt: '2026-07-12T03:00:00.000Z', gems: 0, streakFreezes: 1
    });
    const useCase = new GetStatsUseCase({ stats: repo, now: () => NOW });
    const summary = await useCase.execute('u1');
    expect(summary.hearts).toBe(4); // 9h transcurridas = +2
    expect(summary.nextHeartAt).toBe('2026-07-12T15:00:00.000Z');
    expect(summary.level).toBe(2);
    expect(summary.xpIntoLevel).toBe(20);
    expect(repo.saved).toEqual([]); // el GET no escribe
  });
});
```

Run: `pnpm --filter @lingoleap/api test -- get-stats` — Expected: FAIL.

- [ ] **Step 2: Implementar el caso de uso**:

```ts
// apps/api/src/application/use-cases/get-stats.use-case.ts
import { levelProgress, MAX_HEARTS, nextHeartAt, regenerateHearts, type StatsSummary } from '@lingoleap/core';
import { defaultUserStats } from '../../domain/user-stats';
import type { StatsRepository } from '../ports/stats.repository';

export class GetStatsUseCase {
  constructor(private readonly deps: { stats: StatsRepository; now?: () => string }) {}

  async execute(userId: string): Promise<StatsSummary> {
    const nowIso = (this.deps.now ?? (() => new Date().toISOString()))();
    const stored = (await this.deps.stats.findByUser(userId)) ?? defaultUserStats(userId, nowIso);
    const regen = regenerateHearts({ hearts: stored.hearts, updatedAt: stored.heartsUpdatedAt }, nowIso);
    const level = levelProgress(stored.xp);
    return {
      xp: stored.xp,
      level: level.level,
      xpIntoLevel: level.xpIntoLevel,
      xpToNextLevel: level.xpToNextLevel,
      streakCount: stored.streakCount,
      streakFreezes: stored.streakFreezes,
      gems: stored.gems,
      hearts: regen.hearts,
      maxHearts: MAX_HEARTS,
      nextHeartAt: nextHeartAt(regen)
    };
  }
}
```

Run unit de nuevo — Expected: PASS.

- [ ] **Step 3: Test e2e que falla** — `stats-api.spec.ts` (calcar el arnés de `progress-api.spec.ts`: mismo FakeVerifier, mismos env stubs, override de `STATS_REPOSITORY` con un fake en memoria):

```ts
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedUser, AuthVerifier } from '../application/ports/auth-verifier.port';
import { AUTH_VERIFIER } from '../application/ports/auth-verifier.port';
import { STATS_REPOSITORY, type StatsRepository } from '../application/ports/stats.repository';
import type { UserStats } from '../domain/user-stats';
import { ContentApiModule } from './content-api.module';
import { DomainExceptionFilter } from './domain-exception.filter';

class FakeVerifier implements AuthVerifier {
  async verifyToken(token: string): Promise<AuthenticatedUser | null> {
    return token === 'valid-token' ? { id: 'user-1', email: 'a@b.com' } : null;
  }
}

class FakeStats implements StatsRepository {
  stored: UserStats | null = null;
  async findByUser(): Promise<UserStats | null> { return this.stored; }
  async save(stats: UserStats): Promise<void> { this.stored = stats; }
}

describe('API de stats', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
    process.env.PEXELS_API_KEY = 'stub';
    const moduleRef = await Test.createTestingModule({ imports: [ContentApiModule] })
      .overrideProvider(AUTH_VERIFIER).useValue(new FakeVerifier())
      .overrideProvider(STATS_REPOSITORY).useValue(new FakeStats())
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('rechaza sin token', async () => {
    await request(app.getHttpServer()).get('/me/stats').expect(401);
  });

  it('devuelve el resumen por defecto para un usuario nuevo', async () => {
    const res = await request(app.getHttpServer())
      .get('/me/stats')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
    expect(res.body).toMatchObject({ xp: 0, level: 1, hearts: 5, maxHearts: 5, streakCount: 0 });
  });
});
```

Run: `pnpm --filter @lingoleap/api test -- stats-api` — Expected: FAIL (controller no existe).

- [ ] **Step 4: Implementar controller y wiring**:

```ts
// apps/api/src/presentation/stats.controller.ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { StatsSummary } from '@lingoleap/core';
import { GetStatsUseCase } from '../application/use-cases/get-stats.use-case';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';

@Controller('me')
@UseGuards(AuthGuard)
export class StatsController {
  constructor(private readonly getStats: GetStatsUseCase) {}

  @Get('stats')
  stats(@Req() req: AuthenticatedRequest): Promise<StatsSummary> {
    return this.getStats.execute(req.user.id);
  }
}
```

En `content-api.module.ts`: agregar `StatsController` a `controllers`, y providers (siguiendo el patrón useFactory existente):

```ts
{
  provide: STATS_REPOSITORY,
  useFactory: (c: SupabaseClient) => new SupabaseStatsRepository(c),
  inject: [SUPABASE_CLIENT]
},
{
  provide: GetStatsUseCase,
  useFactory: (stats: StatsRepository) => new GetStatsUseCase({ stats }),
  inject: [STATS_REPOSITORY]
}
```

con sus imports: `STATS_REPOSITORY, type StatsRepository` desde el puerto, `GetStatsUseCase`, `SupabaseStatsRepository`, `StatsController`.

- [ ] **Step 5: Verificar** — Run: `pnpm --filter @lingoleap/api test` — Expected: PASS (todos, nuevos y previos).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src supabase
git commit -m "feat(api): endpoint GET /me/stats con regeneración de corazones al leer"
```

---

### Task 6: CompleteLessonUseCase extendido — recompensas al completar

**Files:**
- Modify: `apps/api/src/application/use-cases/complete-lesson.use-case.ts` (reescritura), `apps/api/src/presentation/progress.controller.ts` (body + respuesta), `apps/api/src/presentation/content-api.module.ts` (inyectar stats al use case), `apps/api/src/application/use-cases/complete-lesson.use-case.spec.ts` (extender), `apps/api/src/presentation/progress-api.spec.ts` (respuesta nueva)

**Interfaces:**
- Consumes: `lessonXp`, `levelProgress`, `applyLessonDay`, `regenerateHearts`, `loseHearts`, `LessonRewards` de core; `StatsRepository`.
- Produces:
```ts
export interface CompleteLessonInput {
  userId: string;
  lessonId: string;
  errorCount: number;        // se clampa a enteros [0, 50]
  clientDate: string | null; // YYYY-MM-DD local del usuario; inválida/ausente → fecha UTC del servidor
}
export class CompleteLessonUseCase {
  constructor(deps: { courses: CourseRepository; progress: ProgressRepository; stats: StatsRepository; now?: () => string });
  execute(input: CompleteLessonInput): Promise<LessonRewards>;
}
// POST /progress/lessons/:lessonId/complete  body { errorCount?: number; date?: string }
// → 201 { completed: true, rewards: LessonRewards }
```
Decisión documentada: la fecha la envía el cliente porque la racha corre en la zona horaria del usuario (spec §9); un cliente malicioso solo altera su propia racha. XP y corazones se calculan SIEMPRE en el servidor con `errorCount` clampado.

- [ ] **Step 1: Extender el test unit (RED)** — en `complete-lesson.use-case.spec.ts`, actualizar el test existente a la nueva firma (usar `{ userId, lessonId, errorCount: 0, clientDate: '2026-07-12' }`) y agregar (FakeStats = el de `get-stats.use-case.spec.ts`):

```ts
const NOW = '2026-07-12T12:00:00.000Z';

it('primera lección: 15 XP sin errores, racha 1, corazones intactos', async () => {
  const stats = new FakeStats(null);
  const useCase = new CompleteLessonUseCase({ courses, progress, stats, now: () => NOW });
  const rewards = await useCase.execute({ userId: 'u1', lessonId: lesson.id, errorCount: 0, clientDate: '2026-07-12' });
  expect(rewards).toEqual({ xpEarned: 15, totalXp: 15, level: 1, streakCount: 1, freezeUsed: false, hearts: 5 });
  expect(stats.saved[0]).toMatchObject({ xp: 15, streakCount: 1, lastLessonDate: '2026-07-12', hearts: 5 });
});

it('con 3 errores: 12 XP y pierde 3 corazones', async () => {
  const stats = new FakeStats(null);
  const useCase = new CompleteLessonUseCase({ courses, progress, stats, now: () => NOW });
  const rewards = await useCase.execute({ userId: 'u1', lessonId: lesson.id, errorCount: 3, clientDate: '2026-07-12' });
  expect(rewards.xpEarned).toBe(12);
  expect(rewards.hearts).toBe(2);
});

it('extiende la racha de ayer y usa la fecha del servidor si la del cliente es inválida', async () => {
  const stats = new FakeStats({
    userId: 'u1', xp: 90, streakCount: 4, lastLessonDate: '2026-07-11',
    hearts: 5, heartsUpdatedAt: NOW, gems: 0, streakFreezes: 0
  });
  const useCase = new CompleteLessonUseCase({ courses, progress, stats, now: () => NOW });
  const rewards = await useCase.execute({ userId: 'u1', lessonId: lesson.id, errorCount: 0, clientDate: 'no-es-fecha' });
  expect(rewards.streakCount).toBe(5); // el servidor usa 2026-07-12 (UTC de NOW); ayer fue 07-11
  expect(rewards.totalXp).toBe(105);
  expect(rewards.level).toBe(2);
});
```

Run: `pnpm --filter @lingoleap/api test -- complete-lesson` — Expected: FAIL (firma nueva).

- [ ] **Step 2: Implementar** la reescritura del caso de uso:

```ts
// apps/api/src/application/use-cases/complete-lesson.use-case.ts
import {
  applyLessonDay, lessonXp, levelProgress, loseHearts, regenerateHearts, type LessonRewards
} from '@lingoleap/core';
import { LessonNotFoundError } from '../../domain/errors';
import { defaultUserStats } from '../../domain/user-stats';
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

    await this.deps.stats.save({
      userId: input.userId,
      xp: totalXp,
      streakCount: streak.count,
      lastLessonDate: streak.lastDate,
      hearts,
      heartsUpdatedAt: regen.updatedAt,
      gems: stored.gems,
      streakFreezes: streak.freezes
    });

    return {
      xpEarned,
      totalXp,
      level: levelProgress(totalXp).level,
      streakCount: streak.count,
      freezeUsed: streak.freezeUsed,
      hearts
    };
  }
}
```

- [ ] **Step 3: Actualizar controller y wiring**:

```ts
// progress.controller.ts — reemplazar el handler complete (agregar Body a los imports de @nestjs/common
// y el tipo LessonRewards de @lingoleap/core)
interface CompleteLessonBody {
  errorCount?: number;
  date?: string;
}

@Post('lessons/:lessonId/complete')
async complete(
  @Param('lessonId', ParseUUIDPipe) lessonId: string,
  @Body() body: CompleteLessonBody,
  @Req() req: AuthenticatedRequest
): Promise<{ completed: true; rewards: LessonRewards }> {
  const rewards = await this.completeLesson.execute({
    userId: req.user.id,
    lessonId,
    errorCount: typeof body?.errorCount === 'number' ? body.errorCount : 0,
    clientDate: typeof body?.date === 'string' ? body.date : null
  });
  return { completed: true, rewards };
}
```

En `content-api.module.ts`, el provider de `CompleteLessonUseCase` pasa a inyectar también stats:

```ts
{
  provide: CompleteLessonUseCase,
  useFactory: (courses: CourseRepository, progress: ProgressRepository, stats: StatsRepository) =>
    new CompleteLessonUseCase({ courses, progress, stats }),
  inject: [COURSE_REPOSITORY, PROGRESS_REPOSITORY, STATS_REPOSITORY]
}
```

- [ ] **Step 4: Actualizar el e2e** `progress-api.spec.ts`: agregar `.overrideProvider(STATS_REPOSITORY).useValue(new FakeStats())` (copiar la clase FakeStats de `stats-api.spec.ts`) y reemplazar el test de completar por:

```ts
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
```

- [ ] **Step 5: Verificar** — Run: `pnpm --filter @lingoleap/api test && pnpm build && pnpm lint` — Expected: todo PASS. (La web sigue compilando: `completeLesson(lessonId)` del api-client viejo sigue siendo válido porque el body es opcional en el servidor; el api-client se actualiza en Task 7.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): completar lección otorga XP, racha y descuenta corazones"
```

---

### Task 7: api-client — `getStats` y `completeLesson` con recompensas

**Files:**
- Modify: `packages/api-client/src/client.ts`
- Test: `packages/api-client/src/client.spec.ts` (extender con msw, mismo patrón de handlers existente)

**Interfaces:**
- Consumes: `StatsSummary`, `LessonRewards` de `@lingoleap/core`; endpoints de Tasks 5-6.
- Produces:
```ts
getStats(): Promise<StatsSummary>;
completeLesson(lessonId: string, options?: { errorCount?: number; date?: string }): Promise<LessonRewards>;
```

- [ ] **Step 1: Tests que fallan (msw)** — agregar a `client.spec.ts` (leer los handlers existentes y calcar su forma; usar la misma baseUrl del spec):

```ts
it('getStats envía el token y devuelve el resumen', async () => {
  server.use(
    http.get(`${BASE}/me/stats`, ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer token-123');
      return HttpResponse.json({
        xp: 120, level: 2, xpIntoLevel: 20, xpToNextLevel: 180,
        streakCount: 3, streakFreezes: 0, gems: 0,
        hearts: 4, maxHearts: 5, nextHeartAt: null
      });
    })
  );
  const stats = await client.getStats();
  expect(stats.level).toBe(2);
});

it('completeLesson envía errorCount y fecha, y devuelve las recompensas', async () => {
  server.use(
    http.post(`${BASE}/progress/lessons/l1/complete`, async ({ request }) => {
      expect(await request.json()).toEqual({ errorCount: 2, date: '2026-07-12' });
      return HttpResponse.json(
        { completed: true, rewards: { xpEarned: 13, totalXp: 13, level: 1, streakCount: 1, freezeUsed: false, hearts: 3 } },
        { status: 201 }
      );
    })
  );
  const rewards = await client.completeLesson('l1', { errorCount: 2, date: '2026-07-12' });
  expect(rewards.xpEarned).toBe(13);
});
```

Run: `pnpm --filter @lingoleap/api-client test` — Expected: FAIL.

- [ ] **Step 2: Implementar** en `client.ts` (reemplaza el `completeLesson` actual; amplía el import de tipos):

```ts
import type {
  CEFRLevel, Course, CourseSummary, LearningLanguage, Lesson, LessonRewards, StatsSummary
} from '@lingoleap/core';

getStats(): Promise<StatsSummary> {
  return this.request('/me/stats');
}

async completeLesson(lessonId: string, options?: { errorCount?: number; date?: string }): Promise<LessonRewards> {
  const body = await this.request<{ completed: true; rewards: LessonRewards }>(
    `/progress/lessons/${lessonId}/complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errorCount: options?.errorCount ?? 0, date: options?.date ?? null })
    }
  );
  return body.rewards;
}
```

- [ ] **Step 3: Verificar** — Run: `pnpm --filter @lingoleap/api-client test && pnpm build` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api-client/src
git commit -m "feat(api-client): getStats y completeLesson con recompensas"
```

---

### Task 8: Web — StatsBar (racha, corazones, gemas, nivel)

**Files:**
- Create: `apps/web/src/features/stats/queries.ts`, `apps/web/src/features/stats/StatsBar.tsx`
- Modify: `apps/web/src/features/course-path/CoursesPage.tsx` y `apps/web/src/features/course-path/CoursePathPage.tsx` (montar `<StatsBar />` arriba del contenido, dentro del contenedor existente), `apps/web/src/styles.css` (clases nuevas)
- Test: `apps/web/src/features/stats/StatsBar.spec.tsx`

**Interfaces:**
- Consumes: `api.getStats()` (Task 7), `renderWithProviders` existente.
- Produces:
```ts
// queries.ts
export function useStats(): UseQueryResult<StatsSummary>; // queryKey ['stats']
// StatsBar.tsx
export function StatsBar(): JSX.Element | null; // null mientras carga o si falla (no bloquea la página)
```
Nota: los specs existentes de CoursesPage/CoursePathPage mockean `api` sin `getStats`; como StatsBar devuelve `null` en error/carga, esos specs siguen pasando sin cambios. Si alguno rompe por el mock incompleto, agregar `getStats: vi.fn().mockResolvedValue(...)` a su mock — cambio permitido y esperado.

- [ ] **Step 1: Test que falla** — `StatsBar.spec.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const getStats = vi.hoisted(() => vi.fn());
vi.mock('../../app/api', () => ({ api: { getStats } }));

import { StatsBar } from './StatsBar';
import { renderWithProviders } from '../../test/render';

describe('StatsBar', () => {
  it('muestra racha, corazones, gemas y nivel con su progreso', async () => {
    getStats.mockResolvedValue({
      xp: 120, level: 2, xpIntoLevel: 20, xpToNextLevel: 180,
      streakCount: 3, streakFreezes: 0, gems: 0,
      hearts: 4, maxHearts: 5, nextHeartAt: null
    });
    renderWithProviders(<StatsBar />, { route: '/' });
    expect(await screen.findByText('🔥 3')).toBeInTheDocument();
    expect(screen.getByText('❤️ 4')).toBeInTheDocument();
    expect(screen.getByText('💎 0')).toBeInTheDocument();
    expect(screen.getByText('⚡ Nivel 2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progreso del nivel 2' })).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @lingoleap/web test` — Expected: FAIL.

- [ ] **Step 2: Implementar**:

```ts
// apps/web/src/features/stats/queries.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../../app/api';

export function useStats() {
  return useQuery({ queryKey: ['stats'], queryFn: () => api.getStats() });
}
```

```tsx
// apps/web/src/features/stats/StatsBar.tsx
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
      <span className="stats-item" title="Gemas">💎 {data.gems}</span>
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

CSS en `styles.css` (solo tokens; calcar la convención de `.progress-bar` existente):

```css
.stats-bar {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-lg);
  font-weight: 700;
}

.stats-item {
  white-space: nowrap;
}

.stats-level-bar {
  flex: 1;
  height: var(--space-sm);
  background: var(--color-border);
  border-radius: var(--radius-pill);
  overflow: hidden;
  min-width: 60px;
}

.stats-level-fill {
  height: 100%;
  background: var(--color-accent);
  border-radius: var(--radius-pill);
}
```

(Si `--color-accent` no existe en `packages/tokens/src/tokens.css`, usar el token amarillo existente; verificar el nombre real en ese archivo antes de escribir.)

Montar en las dos páginas: `<StatsBar />` como primer hijo del contenedor de `CoursesPage` y de `CoursePathPage` (import relativo `../stats/StatsBar`).

- [ ] **Step 3: Verificar** — Run: `pnpm --filter @lingoleap/web test && pnpm build && pnpm lint` — Expected: PASS (los specs de páginas existentes siguen verdes).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): barra de estadísticas con racha, corazones, gemas y nivel"
```

---

### Task 9: Web — el reproductor reporta errores y muestra recompensas

**Files:**
- Create: `apps/web/src/shared/localDate.ts`
- Modify: `apps/web/src/features/lesson-player/LessonPlayerPage.tsx` (mutación con errorCount+fecha, invalidar `['stats']`, pasar rewards y corazones), `apps/web/src/features/lesson-player/CompletionScreen.tsx` (mostrar recompensas)
- Test: `apps/web/src/features/lesson-player/LessonPlayerPage.spec.tsx` (actualizar aserciones), `apps/web/src/shared/localDate.spec.ts`

**Interfaces:**
- Consumes: `api.completeLesson(lessonId, { errorCount, date })` → `LessonRewards` (Task 7), `useStats` (Task 8), `state.wrongCount` del sessionStore existente.
- Produces:
```ts
// localDate.ts
export function localDateString(now?: Date): string; // YYYY-MM-DD en hora LOCAL del navegador
// CompletionScreen: nueva prop opcional rewards?: LessonRewards (además de las existentes)
```

- [ ] **Step 1: Test de localDate (RED→GREEN rápido)** — `localDate.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { localDateString } from './localDate';

describe('localDateString', () => {
  it('formatea la fecha local como YYYY-MM-DD con ceros', () => {
    expect(localDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(localDateString(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});
```

Implementación:

```ts
// apps/web/src/shared/localDate.ts
export function localDateString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
```

(Se usa la fecha LOCAL a propósito — la racha corre en la zona horaria del usuario; `toISOString()` daría el día UTC y rompería rachas nocturnas.)

- [ ] **Step 2: Actualizar el spec del player (RED)** — en `LessonPlayerPage.spec.tsx`: el mock de `completeLesson` pasa a resolver recompensas y las aserciones cambian:

```ts
const rewards = { xpEarned: 15, totalXp: 15, level: 1, streakCount: 1, freezeUsed: false, hearts: 5 };
// en el mock del api: completeLesson: (...a: unknown[]) => completeLesson(...a)
// y en beforeEach: completeLesson.mockResolvedValue(rewards);
```

En el test del recorrido completo (las 2 respuestas correctas → 0 errores):

```ts
expect(completeLesson).toHaveBeenCalledWith('l1', {
  errorCount: 0,
  date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
});
expect(completeLesson).toHaveBeenCalledTimes(1);
expect(await screen.findByText('+15 XP')).toBeInTheDocument();
expect(screen.getByText(/Racha: 1/)).toBeInTheDocument();
```

Los demás tests del archivo (lección vacía, error/reintento, no-arrastre entre lecciones) conservan su comportamiento — solo ajustar la forma de llamada (`toHaveBeenCalledWith('l1', expect.anything())` donde aplique) y el `mockResolvedValue(rewards)`.

Run: `pnpm --filter @lingoleap/web test` — Expected: FAIL.

- [ ] **Step 3: Implementar**:

En `LessonPlayerPage.tsx`:
- La mutación pasa a: `mutationFn: () => api.completeLesson(lessonId, { errorCount: sessionWrongCount, date: localDateString() })` donde `sessionWrongCount` es `state.wrongCount` capturado del store al momento de disparar (el efecto de completar ya conoce el estado `finished`).
- `onSuccess` invalida `['progress']` **y** `['stats']`.
- Pasar `rewards={completeMutation.data}` a `CompletionScreen` (tipo `LessonRewards | undefined`).
- El reintento ("Reintentar") reutiliza la misma mutación (ya recibe los mismos argumentos).

En `CompletionScreen.tsx` — agregar la prop y el bloque (debajo del título, antes del mensaje motivacional):

```tsx
{rewards && (
  <div className="completion-rewards">
    <p className="completion-xp">+{rewards.xpEarned} XP</p>
    <p>🔥 Racha: {rewards.streakCount} {rewards.streakCount === 1 ? 'día' : 'días'}</p>
    {rewards.freezeUsed && <p>🧊 Un congelador salvó tu racha</p>}
  </div>
)}
```

CSS `.completion-rewards` / `.completion-xp` con tokens (texto grande verde `var(--color-primary)` para el XP).

- [ ] **Step 4: Verificar** — Run: `pnpm --filter @lingoleap/web test && pnpm build && pnpm lint` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): recompensas de XP y racha al completar la lección"
```

---

### Task 10: Web — corazones en el reproductor y bloqueo sin corazones

**Files:**
- Modify: `apps/web/src/features/lesson-player/LessonPlayerPage.tsx` (corazones en la cabecera; pantalla de bloqueo), `apps/web/src/styles.css`
- Test: `apps/web/src/features/lesson-player/LessonPlayerPage.spec.tsx` (2 tests nuevos)

**Interfaces:**
- Consumes: `useStats` (Task 8), `canStartLesson` de `@lingoleap/core` (Task 4), el hook de progreso existente en `features/course-path/queries.ts` (leerlo: expone la query `['progress']` con los ids de lecciones completadas — reusar ese hook, no crear otro).
- Produces: dentro del player, cabecera con `❤️ N` (corazones restantes en vivo = `max(0, stats.hearts - state.wrongCount)`); pantalla de bloqueo cuando `!canStartLesson(stats.hearts, yaCompletada)`.

- [ ] **Step 1: Tests que fallan** — agregar a `LessonPlayerPage.spec.tsx` (el mock del api necesita ahora `getStats` y el método de progreso que use el hook existente — leer su nombre real en `course-path/queries.ts` y mockearlo igual):

```ts
it('bloquea una lección nueva sin corazones y ofrece volver', async () => {
  getStats.mockResolvedValue({ ...statsFixture, hearts: 0, nextHeartAt: '2026-07-12T16:00:00.000Z' });
  getCompletedLessonIds.mockResolvedValue([]); // l1 NO está completada
  renderWithProviders(<LessonPlayerPage />, { route: '/lesson/l1?lang=en', path: '/lesson/:lessonId' });
  expect(await screen.findByText('Te quedaste sin corazones')).toBeInTheDocument();
  expect(screen.getByText(/repasa una lección completada/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'water' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Volver al curso' })).toBeInTheDocument();
});

it('permite repasar sin corazones una lección ya completada', async () => {
  getStats.mockResolvedValue({ ...statsFixture, hearts: 0, nextHeartAt: null });
  getCompletedLessonIds.mockResolvedValue(['l1']); // repaso
  renderWithProviders(<LessonPlayerPage />, { route: '/lesson/l1?lang=en', path: '/lesson/:lessonId' });
  expect(await screen.findByRole('button', { name: 'water' })).toBeInTheDocument();
});
```

Donde `statsFixture` es el mismo objeto de StatsSummary usado en Task 8 y `getStats`/`getCompletedLessonIds` se agregan al `vi.mock` del api con `vi.hoisted`. Los tests EXISTENTES del player deben seguir pasando: en su `beforeEach`, `getStats` resuelve el fixture con `hearts: 5` y el progreso vacío.

Run: `pnpm --filter @lingoleap/web test` — Expected: FAIL.

- [ ] **Step 2: Implementar** en `LessonPlayerPage.tsx`:

- Cabecera del player: junto al contador "Ejercicio X de Y", mostrar `❤️ {heartsLeft}` con `heartsLeft = Math.max(0, (stats?.hearts ?? 5) - state.wrongCount)` (clase `.player-hearts`, rojo `var(--color-danger)` cuando llega a 0).
- Antes de renderizar el ejercicio (después de cargar lección, stats y progreso): si `stats` y el progreso están cargados y `!canStartLesson(stats.hearts, completedIds.includes(lessonId))` → renderizar la pantalla de bloqueo en lugar del ejercicio:

```tsx
<div className="container no-hearts">
  <h2>Te quedaste sin corazones</h2>
  <p>Se regenera 1 corazón cada 4 horas.</p>
  {stats.nextHeartAt && (
    <p>
      El próximo llega a las{' '}
      {new Date(stats.nextHeartAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.
    </p>
  )}
  <p>Mientras tanto, repasa una lección completada: no pierdes corazones por repasar lo aprendido.</p>
  <button type="button" className="button button-primary" onClick={() => navigate(-1)}>
    Volver al curso
  </button>
</div>
```

- El bloqueo se evalúa ANTES de `start(lesson)` (no iniciar sesión de lección bloqueada). Mientras stats/progreso cargan, se mantiene el "Cargando…" actual.

- [ ] **Step 3: Verificar** — Run: `pnpm --filter @lingoleap/web test && pnpm build && pnpm lint` — Expected: PASS (todos, incluidos los previos del player).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): corazones en vivo y bloqueo de lecciones nuevas sin corazones"
```

---

### Task 11: Documentación de la fase

**Files:**
- Modify: `README.md` (roadmap: marcar Fase 3A; sección nueva breve "Gamificación" con las fórmulas), `docs/BITACORA.md` (entrada "Fase 3A" con el formato de las fases anteriores: decisiones+alternativas+porqués, problemas REALES de los reportes de tareas, deuda técnica, y guía de entrevista con los temas nuevos: funciones puras compartidas core↔backend, cálculo lazy de regeneración vs jobs, confianza cliente/servidor en errorCount y fecha)

- [ ] **Step 1: Actualizar ambos documentos.** La entrada de BITACORA se escribe con los problemas reales que hayan aparecido en las tareas 1-10 (revisar los reportes en `.superpowers/sdd/` y los commits) — nada genérico. Documentar explícitamente las 3 decisiones de diseño de esta fase y su porqué: (1) regeneración de corazones calculada al leer (sin cron ni jobs — costo $0 y sin estado extra); (2) la fecha de racha la aporta el cliente (zona horaria del usuario, spec §9) pero XP/corazones se calculan solo en el servidor con entrada clampada; (3) `gems`/`streak_freezes` nacen en la migración aunque se activan en 3B (evitar una segunda migración).

- [ ] **Step 2: Verificar y commitear**

Run: `pnpm lint && pnpm build && pnpm test` — Expected: PASS.

```bash
git add README.md docs/BITACORA.md
git commit -m "docs: bitácora y README de la Fase 3A (stats de gamificación)"
```

---

### Task 12: Smoke real end-to-end (manual, con el usuario)

**Prerrequisitos que hace el usuario (guiarlo):**
1. En Supabase SQL Editor: ejecutar `supabase/migrations/0003_stats.sql` (una sola vez).

- [ ] **Step 1: Levantar API y web**: `pnpm --filter @lingoleap/api dev` y `pnpm --filter @lingoleap/web dev`.
- [ ] **Step 2: Recorrido completo en el navegador** (el usuario):
  - Al entrar, la StatsBar muestra 🔥 0 · ❤️ 5 · 💎 0 · ⚡ Nivel 1 (o su racha real si ya jugó hoy).
  - Completar una lección SIN errores → CompletionScreen muestra "+15 XP" y "Racha: N"; al volver, la StatsBar refleja XP y racha actualizados.
  - Completar otra lección fallando a propósito 2-3 veces → gana 12-13 XP y los corazones bajan en vivo durante la lección y en la StatsBar al salir.
  - Agotar los 5 corazones fallando → al abrir una lección NUEVA aparece "Te quedaste sin corazones" con la hora del próximo corazón; abrir una lección YA COMPLETADA sí funciona (repaso).
  - Cerrar sesión y volver a entrar → XP, racha y corazones persisten (verificar también la fila en Supabase → Table Editor → `user_stats`).
- [ ] **Step 3: Registrar resultado** en `.superpowers/sdd/progress.md` y en la BITACORA si hubo hallazgos.

---

## Verificación final de la Fase 3A

- [ ] `pnpm lint && pnpm build && pnpm test` en verde (core + api + api-client + web).
- [ ] Smoke del Task 12 completado con el recorrido real.
- [ ] Merge a master + push + CI verde (flujo de cierre habitual).
