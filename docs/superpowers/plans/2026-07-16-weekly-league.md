# Liga semanal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Liga semanal por XP en cohortes de hasta 30 usuarios y 4 divisiones, con cierre híbrido
(cron + perezoso), gemas al podio, página `/league` y división en la `StatsBar`.

**Architecture:** Reglas puras en `packages/core/src/logic/league.ts`; tablas `league_cohorts` y
`league_memberships` en Supabase (migración `0005_league.sql`); puerto `LeagueRepository` +
adaptador Supabase; `CompleteLessonUseCase` acumula XP semanal; `CloseLeagueWeekUseCase` cierra
cohortes vencidas (disparado por cron `@nestjs/schedule` y como fallback al leer
`GET /me/league`); la web solo refleja vía `@lingoleap/api-client` + TanStack Query.

**Tech Stack:** El existente del monorepo (NestJS 11 hexagonal, Supabase, Vitest + msw +
supertest + Testing Library, React 18 + TanStack Query, tokens CSS) + dependencia nueva
`@nestjs/schedule` en `apps/api`.

## Global Constraints

- TypeScript `strict: true`; prohibido `any` explícito. Copy de UI en español.
- Regla de capas API: `domain/` puro; `application/` solo domain+core; `infrastructure/`
  implementa puertos; `presentation/` llama casos de uso. Clases de application/infrastructure
  sin decoradores NestJS (wiring por `useFactory` en `content-api.module.ts`). El scheduler del
  cron vive en `presentation/` (como los controllers/guard, que sí usan decoradores).
- La web NUNCA llama `fetch` directo: todo por `@lingoleap/api-client`.
- Colores/espaciados solo desde `@lingoleap/tokens`; sombras solo `var(--shadow-sm)`.
- **Constantes (cerradas en el spec `docs/superpowers/specs/2026-07-16-weekly-league-design.md`):**
  `LEAGUE_COHORT_SIZE = 30`, `LEAGUE_PROMOTE_COUNT = 10`, `LEAGUE_DEMOTE_COUNT = 5`,
  `LEAGUE_PODIUM_GEMS = [20, 10, 5]`, divisiones `bronze → silver → gold → diamond`. Definidas
  una sola vez en `packages/core`.
- Semana lunes→domingo en UTC; fechas `YYYY-MM-DD`; reloj siempre inyectado (`now?: () => string`).
- Tras cambiar `packages/core`, correr `pnpm --filter @lingoleap/core build` antes de los tests
  del API (el API resuelve core por su `dist/` compilado — lección de la BITACORA 2026-07-16).
- TDD (evidencia RED→GREEN). Commits convencionales en español al final de cada tarea + trailer
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Rama de trabajo nueva sobre `master`: `feature/weekly-league`.

---

### Task 1: Core — semana, divisiones y zonas

**Files:**
- Create: `packages/core/src/logic/league.ts`, `packages/core/src/logic/league.spec.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces:
```ts
export const LEAGUE_DIVISIONS = ['bronze', 'silver', 'gold', 'diamond'] as const;
export type LeagueDivision = (typeof LEAGUE_DIVISIONS)[number];
export const LEAGUE_COHORT_SIZE = 30;
export const LEAGUE_PROMOTE_COUNT = 10;
export const LEAGUE_DEMOTE_COUNT = 5;
export const LEAGUE_PODIUM_GEMS: readonly number[] = [20, 10, 5];
export type LeagueMemberResult = 'promoted' | 'demoted' | 'stayed';
export type LeagueZone = 'promotion' | 'demotion' | 'none';
export function weekStartOf(dateIso: string): string;                    // lunes YYYY-MM-DD (UTC)
export function divisionAfter(division: LeagueDivision, result: LeagueMemberResult): LeagueDivision;
export function leagueZone(position: number, cohortSize: number, division: LeagueDivision): LeagueZone;
```

- [ ] **Step 1: Test que falla (RED)** — crear `packages/core/src/logic/league.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { divisionAfter, leagueZone, weekStartOf } from './league';

describe('weekStartOf', () => {
  it('devuelve el mismo día si es lunes', () => {
    expect(weekStartOf('2026-07-13')).toBe('2026-07-13');
  });

  it('retrocede al lunes desde un jueves', () => {
    expect(weekStartOf('2026-07-16')).toBe('2026-07-13');
  });

  it('retrocede al lunes desde un domingo (fin de la semana)', () => {
    expect(weekStartOf('2026-07-19')).toBe('2026-07-13');
  });

  it('cruza el cambio de mes y de año', () => {
    expect(weekStartOf('2026-01-01')).toBe('2025-12-29');
  });
});

describe('divisionAfter', () => {
  it('asciende a la siguiente división', () => {
    expect(divisionAfter('bronze', 'promoted')).toBe('silver');
  });

  it('no asciende más allá de diamante', () => {
    expect(divisionAfter('diamond', 'promoted')).toBe('diamond');
  });

  it('desciende a la división anterior', () => {
    expect(divisionAfter('gold', 'demoted')).toBe('silver');
  });

  it('no desciende por debajo de bronce', () => {
    expect(divisionAfter('bronze', 'demoted')).toBe('bronze');
  });

  it('se queda igual con stayed', () => {
    expect(divisionAfter('silver', 'stayed')).toBe('silver');
  });
});

describe('leagueZone', () => {
  it('marca zona de ascenso para el top 10', () => {
    expect(leagueZone(1, 30, 'silver')).toBe('promotion');
    expect(leagueZone(10, 30, 'silver')).toBe('promotion');
    expect(leagueZone(11, 30, 'silver')).toBe('none');
  });

  it('marca zona de descenso para los últimos 5', () => {
    expect(leagueZone(26, 30, 'silver')).toBe('demotion');
    expect(leagueZone(25, 30, 'silver')).toBe('none');
  });

  it('en diamante nadie asciende', () => {
    expect(leagueZone(1, 30, 'diamond')).toBe('none');
  });

  it('en bronce nadie desciende', () => {
    expect(leagueZone(30, 30, 'bronze')).toBe('none');
  });

  it('en cohortes chicas el ascenso gana al solaparse las zonas', () => {
    expect(leagueZone(3, 4, 'silver')).toBe('promotion');
    expect(leagueZone(4, 4, 'silver')).toBe('promotion');
  });
});
```

Run: `pnpm --filter @lingoleap/core test -- league` — Expected: FAIL (módulo no existe).

- [ ] **Step 2: Implementar** — crear `packages/core/src/logic/league.ts`:

```ts
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
```

Y agregar a `packages/core/src/index.ts`, después de `export * from './logic/achievements';`:

```ts
export * from './logic/league';
```

- [ ] **Step 3: Verificar GREEN** — Run: `pnpm --filter @lingoleap/core test` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): semana, divisiones y zonas de la liga semanal"
```

---

### Task 2: Core — cierre de la semana y tipos del resumen

**Files:**
- Modify: `packages/core/src/logic/league.ts`, `packages/core/src/logic/league.spec.ts`

**Interfaces:**
- Consumes: `leagueZone`, `LEAGUE_PODIUM_GEMS` (Task 1).
- Produces:
```ts
export interface LeagueMemberInput { userId: string; weeklyXp: number; lastXpAt: string; }
export interface LeagueMemberOutcome {
  userId: string; position: number; result: LeagueMemberResult; gemsAwarded: number;
}
export function closeLeagueWeek(members: LeagueMemberInput[], division: LeagueDivision): LeagueMemberOutcome[];

export interface LeagueStanding {
  position: number; displayName: string; weeklyXp: number; isMe: boolean; zone: LeagueZone;
}
export interface LeagueCohortSummary { weekStart: string; standings: LeagueStanding[]; }
export interface LeagueSummary { division: LeagueDivision; cohort: LeagueCohortSummary | null; }
```

- [ ] **Step 1: Test que falla (RED)** — agregar al final de `league.spec.ts` (importar
  `closeLeagueWeek` en el import existente):

```ts
describe('closeLeagueWeek', () => {
  const member = (userId: string, weeklyXp: number, lastXpAt = '2026-07-15T10:00:00.000Z') =>
    ({ userId, weeklyXp, lastXpAt });

  it('ordena por XP, asciende al top 10, desciende a los últimos 5 y premia al podio', () => {
    const members = Array.from({ length: 30 }, (_, i) => member(`u${i + 1}`, 300 - i * 10));
    const outcomes = closeLeagueWeek(members, 'silver');
    expect(outcomes[0]).toEqual({ userId: 'u1', position: 1, result: 'promoted', gemsAwarded: 20 });
    expect(outcomes[1]).toEqual({ userId: 'u2', position: 2, result: 'promoted', gemsAwarded: 10 });
    expect(outcomes[2]).toEqual({ userId: 'u3', position: 3, result: 'promoted', gemsAwarded: 5 });
    expect(outcomes[9].result).toBe('promoted');
    expect(outcomes[10].result).toBe('stayed');
    expect(outcomes[24].result).toBe('stayed');
    expect(outcomes[25].result).toBe('demoted');
    expect(outcomes[29].result).toBe('demoted');
  });

  it('desempata por quién llegó antes a ese XP (lastXpAt ascendente)', () => {
    const outcomes = closeLeagueWeek(
      [
        member('tarde', 100, '2026-07-15T20:00:00.000Z'),
        member('temprano', 100, '2026-07-15T08:00:00.000Z')
      ],
      'bronze'
    );
    expect(outcomes[0].userId).toBe('temprano');
    expect(outcomes[1].userId).toBe('tarde');
  });

  it('en bronce nadie desciende y en diamante nadie asciende', () => {
    const members = Array.from({ length: 30 }, (_, i) => member(`u${i + 1}`, 300 - i * 10));
    expect(closeLeagueWeek(members, 'bronze').every((o) => o.result !== 'demoted')).toBe(true);
    expect(closeLeagueWeek(members, 'diamond').every((o) => o.result !== 'promoted')).toBe(true);
  });

  it('en cohortes chicas todos ascienden si caben en el top 10 (nadie desciende doble)', () => {
    const outcomes = closeLeagueWeek(
      [member('a', 30), member('b', 20), member('c', 10)],
      'silver'
    );
    expect(outcomes.map((o) => o.result)).toEqual(['promoted', 'promoted', 'promoted']);
    expect(outcomes.map((o) => o.gemsAwarded)).toEqual([20, 10, 5]);
  });
});
```

Run: `pnpm --filter @lingoleap/core test -- league` — Expected: FAIL (`closeLeagueWeek` no existe).

- [ ] **Step 2: Implementar** — agregar al final de `league.ts`:

```ts
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
```

- [ ] **Step 3: Verificar GREEN y compilar core** — Run:
  `pnpm --filter @lingoleap/core test && pnpm --filter @lingoleap/core build` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): cierre de la semana de liga con podio y tipos del resumen"
```

---

### Task 3: Migración, dominio, puerto y adaptador Supabase

**Files:**
- Create: `supabase/migrations/0005_league.sql`, `apps/api/src/domain/league.ts`,
  `apps/api/src/application/ports/league.repository.ts`,
  `apps/api/src/infrastructure/persistence/supabase/supabase-league.repository.ts`,
  `apps/api/src/infrastructure/persistence/supabase/supabase-league.repository.spec.ts`

**Interfaces:**
- Consumes: `LeagueDivision`, `LeagueMemberResult` de `@lingoleap/core` (Task 1).
- Produces:
```ts
// apps/api/src/domain/league.ts
export interface LeagueCohort { id: string; division: LeagueDivision; weekStart: string; closedAt: string | null; }
export interface LeagueMembership {
  cohortId: string; userId: string; displayName: string;
  weeklyXp: number; lastXpAt: string; result: LeagueMemberResult | null;
}

// apps/api/src/application/ports/league.repository.ts
export const LEAGUE_REPOSITORY: unique symbol;
export interface LeagueMembershipWithCohort { cohort: LeagueCohort; membership: LeagueMembership; }
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
```

- [ ] **Step 1: Migración** — crear `supabase/migrations/0005_league.sql`:

```sql
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
```

(No se puede ejecutar desde el repo: recordar en el reporte final que hay que correrla en el
SQL Editor de Supabase antes del smoke.)

- [ ] **Step 2: Dominio** — crear `apps/api/src/domain/league.ts`:

```ts
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
```

- [ ] **Step 3: Puerto** — crear `apps/api/src/application/ports/league.repository.ts`:

```ts
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
```

- [ ] **Step 4: Test del adaptador que falla (RED)** — crear
  `supabase-league.repository.spec.ts` (mismo patrón de client falso que
  `supabase-stats.repository.spec.ts`; el adaptador trae las membresías del usuario con su
  cohorte embebida y filtra/ordena en JS — cohortes por usuario son pocas):

```ts
import { describe, expect, it, vi } from 'vitest';
import { SupabaseLeagueRepository } from './supabase-league.repository';

const cohortRow = {
  id: 'c1', division: 'bronze', week_start: '2026-07-13', closed_at: null
};
const membershipRow = {
  cohort_id: 'c1', user_id: 'u1', display_name: 'ana', weekly_xp: 30,
  last_xp_at: '2026-07-15T10:00:00.000Z', result: null,
  cohort: cohortRow
};

type QueryResult = { data: unknown; error: { message: string } | null };

function clientReturning(result: QueryResult) {
  const terminal = vi.fn().mockResolvedValue(result);
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'lt', 'insert', 'update', 'upsert', 'single']) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  builder.then = (resolve: (r: QueryResult) => unknown) => terminal().then(resolve);
  const from = vi.fn().mockReturnValue(builder);
  return { client: { from } as never, from, builder };
}

describe('SupabaseLeagueRepository', () => {
  it('findMembership mapea la fila con su cohorte al dominio', async () => {
    const { client } = clientReturning({ data: [membershipRow], error: null });
    const repo = new SupabaseLeagueRepository(client);
    const found = await repo.findMembership('u1', '2026-07-13');
    expect(found).toEqual({
      cohort: { id: 'c1', division: 'bronze', weekStart: '2026-07-13', closedAt: null },
      membership: {
        cohortId: 'c1', userId: 'u1', displayName: 'ana', weeklyXp: 30,
        lastXpAt: '2026-07-15T10:00:00.000Z', result: null
      }
    });
  });

  it('findMembership devuelve null si no hay membresía de esa semana', async () => {
    const { client } = clientReturning({ data: [], error: null });
    const repo = new SupabaseLeagueRepository(client);
    expect(await repo.findMembership('u1', '2026-07-13')).toBeNull();
  });

  it('findLatestClosedMembership devuelve la cerrada más reciente', async () => {
    const closedOld = {
      ...membershipRow, result: 'stayed',
      cohort: { id: 'c0', division: 'bronze', week_start: '2026-06-29', closed_at: '2026-07-06T00:05:00.000Z' }
    };
    const closedNew = {
      ...membershipRow, cohort_id: 'c2', result: 'promoted',
      cohort: { id: 'c2', division: 'bronze', week_start: '2026-07-06', closed_at: '2026-07-13T00:05:00.000Z' }
    };
    const { client } = clientReturning({ data: [closedOld, closedNew, membershipRow], error: null });
    const repo = new SupabaseLeagueRepository(client);
    const found = await repo.findLatestClosedMembership('u1');
    expect(found?.cohort.id).toBe('c2');
    expect(found?.membership.result).toBe('promoted');
  });

  it('saveMembership hace upsert en snake_case', async () => {
    const { client, builder } = clientReturning({ data: null, error: null });
    const repo = new SupabaseLeagueRepository(client);
    await repo.saveMembership({
      cohortId: 'c1', userId: 'u1', displayName: 'ana', weeklyXp: 45,
      lastXpAt: '2026-07-15T12:00:00.000Z', result: null
    });
    expect(builder.upsert).toHaveBeenCalledWith({
      cohort_id: 'c1', user_id: 'u1', display_name: 'ana', weekly_xp: 45,
      last_xp_at: '2026-07-15T12:00:00.000Z', result: null
    });
  });
});
```

Run: `pnpm --filter @lingoleap/api test -- supabase-league` — Expected: FAIL (módulo no existe).

- [ ] **Step 5: Implementar el adaptador** — crear `supabase-league.repository.ts`:

```ts
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
```

Nota: si el test del `clientReturning` encadenado no encaja con la forma real en que el builder
de Supabase resuelve promesas, ajustar el fake del test (no el adaptador) siguiendo el patrón
que ya funciona en `supabase-achievements.repository.spec.ts`.

- [ ] **Step 6: Verificar GREEN** — Run: `pnpm --filter @lingoleap/api test -- supabase-league`
  — Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0005_league.sql apps/api/src
git commit -m "feat(api): migración, dominio, puerto y adaptador Supabase de la liga"
```

---

### Task 4: Backend — acumular XP semanal al completar lección

**Files:**
- Modify: `apps/api/src/application/use-cases/complete-lesson.use-case.ts`,
  `apps/api/src/application/use-cases/complete-lesson.use-case.spec.ts`,
  `apps/api/src/presentation/progress.controller.ts`,
  `apps/api/src/presentation/content-api.module.ts`,
  `apps/api/src/presentation/progress-api.spec.ts`

**Interfaces:**
- Consumes: `LeagueRepository`/`LEAGUE_REPOSITORY` (Task 3); `weekStartOf`, `divisionAfter`,
  `LEAGUE_COHORT_SIZE` de `@lingoleap/core` (Task 1).
- Produces: `CompleteLessonInput` gana el campo `userEmail: string`; `CompleteLessonUseCase`
  recibe `league: LeagueRepository` en sus deps (requerido). `LessonRewards` no cambia.

- [ ] **Step 1: FakeLeague reutilizable y tests que fallan (RED)** — en
  `complete-lesson.use-case.spec.ts`: agregar un fake in-memory del puerto y pasarlo en todas
  las instancias existentes de `new CompleteLessonUseCase({...})` (los tests actuales deben
  seguir pasando con `userEmail: 'ana@test.com'` agregado a cada `execute({...})`), y sumar
  estos dos tests nuevos al final del describe:

```ts
class FakeLeague implements LeagueRepository {
  cohorts: LeagueCohort[] = [];
  memberships: LeagueMembership[] = [];
  private nextId = 1;
  async findMembership(userId: string, weekStart: string) {
    const cohortIds = new Set(this.cohorts.filter((c) => c.weekStart === weekStart).map((c) => c.id));
    const m = this.memberships.find((x) => x.userId === userId && cohortIds.has(x.cohortId)) ?? null;
    if (!m) return null;
    return { cohort: this.cohorts.find((c) => c.id === m.cohortId)!, membership: m };
  }
  async findLatestClosedMembership(userId: string) {
    const closed = this.memberships
      .map((m) => ({ membership: m, cohort: this.cohorts.find((c) => c.id === m.cohortId)! }))
      .filter((x) => x.membership.userId === userId && x.cohort.closedAt !== null)
      .sort((a, b) => b.cohort.weekStart.localeCompare(a.cohort.weekStart));
    return closed[0] ?? null;
  }
  async findOpenCohort(division: LeagueDivision, weekStart: string, maxSize: number) {
    return this.cohorts.find(
      (c) => c.division === division && c.weekStart === weekStart && c.closedAt === null &&
        this.memberships.filter((m) => m.cohortId === c.id).length < maxSize
    ) ?? null;
  }
  async createCohort(division: LeagueDivision, weekStart: string) {
    const cohort = { id: `cohort-${this.nextId++}`, division, weekStart, closedAt: null };
    this.cohorts.push(cohort);
    return cohort;
  }
  async saveMembership(membership: LeagueMembership) {
    const i = this.memberships.findIndex(
      (m) => m.cohortId === membership.cohortId && m.userId === membership.userId
    );
    if (i >= 0) this.memberships[i] = membership;
    else this.memberships.push(membership);
  }
  async listMemberships(cohortId: string) {
    return this.memberships.filter((m) => m.cohortId === cohortId);
  }
  async listExpiredOpenCohorts(currentWeekStart: string) {
    return this.cohorts.filter((c) => c.closedAt === null && c.weekStart < currentWeekStart);
  }
  async closeCohort(cohortId: string, closedAt: string) {
    const c = this.cohorts.find((x) => x.id === cohortId);
    if (c) c.closedAt = closedAt;
  }
}
```

(Imports nuevos del spec: `type { LeagueRepository } from '../ports/league.repository'`,
`type { LeagueCohort, LeagueMembership } from '../../domain/league'`,
`type { LeagueDivision } from '@lingoleap/core'`.)

Tests nuevos:

```ts
it('crea la membresía de liga en bronce con el XP de la primera lección de la semana', async () => {
  const league = new FakeLeague();
  const useCase = makeUseCase({ league }); // helper del spec con todos los fakes
  await useCase.execute({ userId: 'u1', userEmail: 'ana@test.com', lessonId: LESSON_ID, errorCount: 0, clientDate: '2026-07-16' });
  expect(league.cohorts).toHaveLength(1);
  expect(league.cohorts[0]).toMatchObject({ division: 'bronze', weekStart: '2026-07-13' });
  expect(league.memberships[0]).toMatchObject({ displayName: 'ana', weeklyXp: 15, result: null });
});

it('acumula XP en la membresía existente de la semana sin crear otra cohorte', async () => {
  const league = new FakeLeague();
  const useCase = makeUseCase({ league });
  await useCase.execute({ userId: 'u1', userEmail: 'ana@test.com', lessonId: LESSON_ID, errorCount: 0, clientDate: '2026-07-16' });
  await useCase.execute({ userId: 'u1', userEmail: 'ana@test.com', lessonId: LESSON_ID, errorCount: 5, clientDate: '2026-07-16' });
  expect(league.cohorts).toHaveLength(1);
  expect(league.memberships).toHaveLength(1);
  expect(league.memberships[0].weeklyXp).toBe(25); // 15 + 10
});
```

Adaptar los nombres (`makeUseCase`, `LESSON_ID`) a los helpers/constantes que ya existan en el
spec; si no hay helper, construir el use case como lo hacen los tests existentes, añadiendo
`league`. Run: `pnpm --filter @lingoleap/api test -- complete-lesson` — Expected: FAIL
(compilación: `league`/`userEmail` no existen).

- [ ] **Step 2: Implementar** — en `complete-lesson.use-case.ts`:
  - Import: `divisionAfter, LEAGUE_COHORT_SIZE, weekStartOf` (sumar al import de core) y
    `type { LeagueRepository } from '../ports/league.repository'`.
  - `CompleteLessonInput` gana `userEmail: string`.
  - Deps ganan `league: LeagueRepository`.
  - Después del bucle `for (const achievement of newlyUnlocked)` y antes del `return`, agregar:

```ts
    const weekStart = weekStartOf(today);
    const active = await this.deps.league.findMembership(input.userId, weekStart);
    if (active) {
      await this.deps.league.saveMembership({
        ...active.membership,
        weeklyXp: active.membership.weeklyXp + xpEarned,
        lastXpAt: nowIso
      });
    } else {
      const latest = await this.deps.league.findLatestClosedMembership(input.userId);
      const division = latest
        ? divisionAfter(latest.cohort.division, latest.membership.result ?? 'stayed')
        : 'bronze';
      const cohort =
        (await this.deps.league.findOpenCohort(division, weekStart, LEAGUE_COHORT_SIZE)) ??
        (await this.deps.league.createCohort(division, weekStart));
      await this.deps.league.saveMembership({
        cohortId: cohort.id,
        userId: input.userId,
        displayName: input.userEmail.split('@')[0],
        weeklyXp: xpEarned,
        lastXpAt: nowIso,
        result: null
      });
    }
```

- [ ] **Step 3: Controller y wiring** — en `progress.controller.ts`, agregar
  `userEmail: req.user.email` al objeto de `this.completeLesson.execute({...})`. En
  `content-api.module.ts`: importar `LEAGUE_REPOSITORY, type LeagueRepository` y
  `SupabaseLeagueRepository`, agregar el provider del repositorio y sumar `league` al factory de
  `CompleteLessonUseCase`:

```ts
    {
      provide: LEAGUE_REPOSITORY,
      useFactory: (c: SupabaseClient) => new SupabaseLeagueRepository(c),
      inject: [SUPABASE_CLIENT]
    },
    {
      provide: CompleteLessonUseCase,
      useFactory: (
        courses: CourseRepository,
        progress: ProgressRepository,
        stats: StatsRepository,
        achievements: AchievementsRepository,
        league: LeagueRepository
      ) => new CompleteLessonUseCase({ courses, progress, stats, achievements, league }),
      inject: [COURSE_REPOSITORY, PROGRESS_REPOSITORY, STATS_REPOSITORY, ACHIEVEMENTS_REPOSITORY, LEAGUE_REPOSITORY]
    },
```

En `progress-api.spec.ts`: agregar un override
`.overrideProvider(LEAGUE_REPOSITORY).useValue(fakeLeague)` con un fake mínimo que implemente
el puerto (puede ser la misma clase `FakeLeague` copiada, o un objeto literal con las 8
funciones devolviendo valores vacíos y creando cohortes en memoria) para que los tests e2e de
progreso sigan pasando.

- [ ] **Step 4: Verificar** — Run: `pnpm --filter @lingoleap/api test` — Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): el XP de cada lección alimenta la liga semanal"
```

---

### Task 5: Backend — CloseLeagueWeekUseCase

**Files:**
- Create: `apps/api/src/application/use-cases/close-league-week.use-case.ts`,
  `apps/api/src/application/use-cases/close-league-week.use-case.spec.ts`

**Interfaces:**
- Consumes: `LeagueRepository` (Task 3), `StatsRepository`, `closeLeagueWeek`, `weekStartOf` de
  `@lingoleap/core` (Task 2), `defaultUserStats`.
- Produces:
```ts
export class CloseLeagueWeekUseCase {
  constructor(deps: { league: LeagueRepository; stats: StatsRepository; now?: () => string });
  execute(): Promise<void>;
}
```

- [ ] **Step 1: Test que falla (RED)** — crear el spec (reusar la clase `FakeLeague` de la
  Task 4 copiándola — cada spec es autónomo — y un `FakeStats` in-memory como el de
  `buy-streak-freeze.use-case.spec.ts` pero con `Map` por usuario):

```ts
import { describe, expect, it } from 'vitest';
import type { UserStats } from '../../domain/user-stats';
import type { StatsRepository } from '../ports/stats.repository';
import { CloseLeagueWeekUseCase } from './close-league-week.use-case';
// + FakeLeague copiada de complete-lesson.use-case.spec.ts (misma implementación)

class FakeStatsMap implements StatsRepository {
  rows = new Map<string, UserStats>();
  async findByUser(userId: string): Promise<UserStats | null> { return this.rows.get(userId) ?? null; }
  async save(stats: UserStats): Promise<void> { this.rows.set(stats.userId, stats); }
}

const NOW = '2026-07-16T12:00:00.000Z'; // jueves; semana actual empieza 2026-07-13

describe('CloseLeagueWeekUseCase', () => {
  it('cierra la cohorte vencida: resultados, gemas al podio y closed_at', async () => {
    const league = new FakeLeague();
    const stats = new FakeStatsMap();
    const cohort = await league.createCohort('bronze', '2026-07-06'); // semana vencida
    await league.saveMembership({ cohortId: cohort.id, userId: 'u1', displayName: 'a', weeklyXp: 50, lastXpAt: NOW, result: null });
    await league.saveMembership({ cohortId: cohort.id, userId: 'u2', displayName: 'b', weeklyXp: 30, lastXpAt: NOW, result: null });
    const useCase = new CloseLeagueWeekUseCase({ league, stats, now: () => NOW });
    await useCase.execute();
    expect(league.cohorts[0].closedAt).toBe(NOW);
    expect(league.memberships.find((m) => m.userId === 'u1')?.result).toBe('promoted');
    expect(stats.rows.get('u1')?.gems).toBe(20);
    expect(stats.rows.get('u2')?.gems).toBe(10);
  });

  it('no toca cohortes de la semana en curso ni ya cerradas', async () => {
    const league = new FakeLeague();
    const stats = new FakeStatsMap();
    await league.createCohort('bronze', '2026-07-13'); // semana actual
    const closed = await league.createCohort('silver', '2026-07-06');
    await league.closeCohort(closed.id, '2026-07-13T00:05:00.000Z');
    const useCase = new CloseLeagueWeekUseCase({ league, stats, now: () => NOW });
    await useCase.execute();
    expect(league.cohorts[0].closedAt).toBeNull();
    expect(league.cohorts[1].closedAt).toBe('2026-07-13T00:05:00.000Z');
  });

  it('suma las gemas del podio sobre las gemas existentes del usuario', async () => {
    const league = new FakeLeague();
    const stats = new FakeStatsMap();
    stats.rows.set('u1', {
      userId: 'u1', xp: 100, streakCount: 1, lastLessonDate: '2026-07-10',
      hearts: 5, heartsUpdatedAt: NOW, gems: 7, streakFreezes: 0
    });
    const cohort = await league.createCohort('gold', '2026-07-06');
    await league.saveMembership({ cohortId: cohort.id, userId: 'u1', displayName: 'a', weeklyXp: 10, lastXpAt: NOW, result: null });
    const useCase = new CloseLeagueWeekUseCase({ league, stats, now: () => NOW });
    await useCase.execute();
    expect(stats.rows.get('u1')?.gems).toBe(27);
  });
});
```

Run: `pnpm --filter @lingoleap/api test -- close-league-week` — Expected: FAIL (módulo no
existe).

- [ ] **Step 2: Implementar**:

```ts
// apps/api/src/application/use-cases/close-league-week.use-case.ts
import { closeLeagueWeek, weekStartOf } from '@lingoleap/core';
import { defaultUserStats } from '../../domain/user-stats';
import type { LeagueRepository } from '../ports/league.repository';
import type { StatsRepository } from '../ports/stats.repository';

export class CloseLeagueWeekUseCase {
  constructor(
    private readonly deps: { league: LeagueRepository; stats: StatsRepository; now?: () => string }
  ) {}

  async execute(): Promise<void> {
    const nowIso = (this.deps.now ?? (() => new Date().toISOString()))();
    const currentWeekStart = weekStartOf(nowIso.slice(0, 10));
    const expired = await this.deps.league.listExpiredOpenCohorts(currentWeekStart);
    for (const cohort of expired) {
      const members = await this.deps.league.listMemberships(cohort.id);
      const outcomes = closeLeagueWeek(
        members.map((m) => ({ userId: m.userId, weeklyXp: m.weeklyXp, lastXpAt: m.lastXpAt })),
        cohort.division
      );
      for (const outcome of outcomes) {
        const membership = members.find((m) => m.userId === outcome.userId);
        if (!membership) continue;
        await this.deps.league.saveMembership({ ...membership, result: outcome.result });
        if (outcome.gemsAwarded > 0) {
          const stored =
            (await this.deps.stats.findByUser(outcome.userId)) ??
            defaultUserStats(outcome.userId, nowIso);
          await this.deps.stats.save({ ...stored, gems: stored.gems + outcome.gemsAwarded });
        }
      }
      await this.deps.league.closeCohort(cohort.id, nowIso);
    }
  }
}
```

- [ ] **Step 3: Verificar GREEN** — Run: `pnpm --filter @lingoleap/api test -- close-league-week`
  — Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): cierre de la semana de liga con ascensos, descensos y podio"
```

---

### Task 6: Backend — GetLeagueUseCase, endpoint, cron y e2e

**Files:**
- Create: `apps/api/src/application/use-cases/get-league.use-case.ts`,
  `apps/api/src/application/use-cases/get-league.use-case.spec.ts`,
  `apps/api/src/presentation/league.controller.ts`,
  `apps/api/src/presentation/league-scheduler.service.ts`,
  `apps/api/src/presentation/league-api.spec.ts`
- Modify: `apps/api/src/presentation/content-api.module.ts`, `apps/api/package.json`
  (dependencia `@nestjs/schedule`)

**Interfaces:**
- Consumes: `CloseLeagueWeekUseCase` (Task 5), `LeagueRepository` (Task 3), `LeagueSummary`,
  `leagueZone`, `weekStartOf`, `divisionAfter` de `@lingoleap/core` (Tasks 1-2).
- Produces:
```ts
export class GetLeagueUseCase {
  constructor(deps: { league: LeagueRepository; closeWeek: CloseLeagueWeekUseCase; now?: () => string });
  execute(userId: string): Promise<LeagueSummary>;
}
// GET /me/league (AuthGuard) → 200 LeagueSummary
// LeagueSchedulerService: @Cron('5 0 * * 1', { timeZone: 'UTC' }) → closeWeek.execute()
```

- [ ] **Step 1: Instalar dependencia** — Run:
  `pnpm --filter @lingoleap/api add @nestjs/schedule` — Expected: agrega la dependencia sin
  conflictos de peer deps (NestJS 11).

- [ ] **Step 2: Test del use case que falla (RED)** — crear `get-league.use-case.spec.ts`
  (reusar `FakeLeague` copiada y `FakeStatsMap` de la Task 5):

```ts
const NOW = '2026-07-16T12:00:00.000Z'; // semana actual: 2026-07-13

function makeUseCase(league: FakeLeague, stats: FakeStatsMap) {
  const closeWeek = new CloseLeagueWeekUseCase({ league, stats, now: () => NOW });
  return new GetLeagueUseCase({ league, closeWeek, now: () => NOW });
}

describe('GetLeagueUseCase', () => {
  it('devuelve bronce y cohorte null para quien nunca jugó', async () => {
    const useCase = makeUseCase(new FakeLeague(), new FakeStatsMap());
    expect(await useCase.execute('u1')).toEqual({ division: 'bronze', cohort: null });
  });

  it('devuelve la tabla ordenada con posiciones, zonas y isMe', async () => {
    const league = new FakeLeague();
    const cohort = await league.createCohort('silver', '2026-07-13');
    await league.saveMembership({ cohortId: cohort.id, userId: 'u1', displayName: 'ana', weeklyXp: 10, lastXpAt: NOW, result: null });
    await league.saveMembership({ cohortId: cohort.id, userId: 'u2', displayName: 'bo', weeklyXp: 40, lastXpAt: NOW, result: null });
    const summary = await makeUseCase(league, new FakeStatsMap()).execute('u1');
    expect(summary.division).toBe('silver');
    expect(summary.cohort?.standings).toEqual([
      { position: 1, displayName: 'bo', weeklyXp: 40, isMe: false, zone: 'promotion' },
      { position: 2, displayName: 'ana', weeklyXp: 10, isMe: true, zone: 'promotion' }
    ]);
  });

  it('cierra perezosamente la cohorte vencida antes de responder', async () => {
    const league = new FakeLeague();
    const stats = new FakeStatsMap();
    const old = await league.createCohort('bronze', '2026-07-06');
    await league.saveMembership({ cohortId: old.id, userId: 'u1', displayName: 'ana', weeklyXp: 30, lastXpAt: NOW, result: null });
    const summary = await makeUseCase(league, stats).execute('u1');
    expect(league.cohorts[0].closedAt).toBe(NOW);           // cerrada al leer
    expect(summary).toEqual({ division: 'silver', cohort: null }); // ascendió, sin XP esta semana
    expect(stats.rows.get('u1')?.gems).toBe(20);            // podio acreditado
  });
});
```

Run: `pnpm --filter @lingoleap/api test -- get-league` — Expected: FAIL.

- [ ] **Step 3: Implementar el use case**:

```ts
// apps/api/src/application/use-cases/get-league.use-case.ts
import { divisionAfter, leagueZone, weekStartOf, type LeagueSummary } from '@lingoleap/core';
import type { LeagueRepository } from '../ports/league.repository';
import type { CloseLeagueWeekUseCase } from './close-league-week.use-case';

export class GetLeagueUseCase {
  constructor(
    private readonly deps: {
      league: LeagueRepository;
      closeWeek: CloseLeagueWeekUseCase;
      now?: () => string;
    }
  ) {}

  async execute(userId: string): Promise<LeagueSummary> {
    await this.deps.closeWeek.execute(); // cierre perezoso: nunca servir una cohorte vencida
    const nowIso = (this.deps.now ?? (() => new Date().toISOString()))();
    const weekStart = weekStartOf(nowIso.slice(0, 10));

    const active = await this.deps.league.findMembership(userId, weekStart);
    if (active) {
      const members = await this.deps.league.listMemberships(active.cohort.id);
      const sorted = [...members].sort(
        (a, b) => b.weeklyXp - a.weeklyXp || a.lastXpAt.localeCompare(b.lastXpAt)
      );
      return {
        division: active.cohort.division,
        cohort: {
          weekStart: active.cohort.weekStart,
          standings: sorted.map((m, i) => ({
            position: i + 1,
            displayName: m.displayName,
            weeklyXp: m.weeklyXp,
            isMe: m.userId === userId,
            zone: leagueZone(i + 1, sorted.length, active.cohort.division)
          }))
        }
      };
    }

    const latest = await this.deps.league.findLatestClosedMembership(userId);
    const division = latest
      ? divisionAfter(latest.cohort.division, latest.membership.result ?? 'stayed')
      : 'bronze';
    return { division, cohort: null };
  }
}
```

Run: `pnpm --filter @lingoleap/api test -- get-league` — Expected: PASS (3 tests).

- [ ] **Step 4: Controller y scheduler**:

```ts
// apps/api/src/presentation/league.controller.ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { LeagueSummary } from '@lingoleap/core';
import { GetLeagueUseCase } from '../application/use-cases/get-league.use-case';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';

@Controller('me')
@UseGuards(AuthGuard)
export class LeagueController {
  constructor(private readonly getLeague: GetLeagueUseCase) {}

  @Get('league')
  league(@Req() req: AuthenticatedRequest): Promise<LeagueSummary> {
    return this.getLeague.execute(req.user.id);
  }
}
```

```ts
// apps/api/src/presentation/league-scheduler.service.ts
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CloseLeagueWeekUseCase } from '../application/use-cases/close-league-week.use-case';

@Injectable()
export class LeagueSchedulerService {
  constructor(private readonly closeWeek: CloseLeagueWeekUseCase) {}

  // Lunes 00:05 UTC — la semana de liga corre de lunes a domingo en UTC.
  @Cron('5 0 * * 1', { timeZone: 'UTC' })
  async closeExpiredWeeks(): Promise<void> {
    await this.closeWeek.execute();
  }
}
```

- [ ] **Step 5: Wiring** — en `content-api.module.ts`:
  - Imports nuevos: `ScheduleModule` de `@nestjs/schedule`, `CloseLeagueWeekUseCase`,
    `GetLeagueUseCase`, `LeagueController`, `LeagueSchedulerService`.
  - `imports: [IngestModule, ScheduleModule.forRoot()]`.
  - `controllers`: agregar `LeagueController`.
  - `providers`: agregar (después del provider de `LEAGUE_REPOSITORY`):

```ts
    {
      provide: CloseLeagueWeekUseCase,
      useFactory: (league: LeagueRepository, stats: StatsRepository) =>
        new CloseLeagueWeekUseCase({ league, stats }),
      inject: [LEAGUE_REPOSITORY, STATS_REPOSITORY]
    },
    {
      provide: GetLeagueUseCase,
      useFactory: (league: LeagueRepository, closeWeek: CloseLeagueWeekUseCase) =>
        new GetLeagueUseCase({ league, closeWeek }),
      inject: [LEAGUE_REPOSITORY, CloseLeagueWeekUseCase]
    },
    LeagueSchedulerService,
```

- [ ] **Step 6: Test e2e que falla (RED)** — crear `league-api.spec.ts` (mismo esqueleto que
  `stats-api.spec.ts`: FakeVerifier, overrides, filtro global; el fake de liga es la misma
  `FakeLeague` in-memory copiada):

```ts
describe('API de liga', () => {
  // beforeAll igual a stats-api.spec.ts con:
  //   .overrideProvider(LEAGUE_REPOSITORY).useValue(league)
  //   .overrideProvider(STATS_REPOSITORY).useValue(stats)
  // beforeEach: league.cohorts = []; league.memberships = []; stats.rows.clear();

  it('rechaza sin token', async () => {
    await request(app.getHttpServer()).get('/me/league').expect(401);
  });

  it('devuelve bronce sin cohorte para un usuario nuevo', async () => {
    const res = await request(app.getHttpServer())
      .get('/me/league')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
    expect(res.body).toEqual({ division: 'bronze', cohort: null });
  });

  it('devuelve la tabla de la cohorte activa con el usuario marcado', async () => {
    const cohort = await league.createCohort('bronze', weekStartOf(new Date().toISOString().slice(0, 10)));
    await league.saveMembership({ cohortId: cohort.id, userId: 'user-1', displayName: 'ana', weeklyXp: 15, lastXpAt: new Date().toISOString(), result: null });
    const res = await request(app.getHttpServer())
      .get('/me/league')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
    expect(res.body.cohort.standings[0]).toMatchObject({ position: 1, displayName: 'ana', isMe: true });
  });

  it('cierra perezosamente una cohorte vencida y acredita el podio', async () => {
    const cohort = await league.createCohort('bronze', '2026-01-05'); // semana pasada segura
    await league.saveMembership({ cohortId: cohort.id, userId: 'user-1', displayName: 'ana', weeklyXp: 30, lastXpAt: '2026-01-06T10:00:00.000Z', result: null });
    const res = await request(app.getHttpServer())
      .get('/me/league')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
    expect(res.body).toEqual({ division: 'silver', cohort: null });
    expect(stats.rows.get('user-1')?.gems).toBe(20);
  });
});
```

Run: `pnpm --filter @lingoleap/api test -- league-api` — Expected: con Steps 3-5 aplicados,
PASS directo (el RED real de esta tarea fue el use case en Step 2); si falla, revisar wiring.

- [ ] **Step 7: Verificar todo** — Run: `pnpm --filter @lingoleap/api test && pnpm build && pnpm lint`
  — Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): endpoint de liga con cierre híbrido (cron + perezoso)"
```

---

### Task 7: api-client — getLeague()

**Files:**
- Modify: `packages/api-client/src/client.ts`, `packages/api-client/src/client.spec.ts`

**Interfaces:**
- Consumes: `LeagueSummary` de `@lingoleap/core` (Task 2); endpoint de Task 6.
- Produces: `getLeague(): Promise<LeagueSummary>;`

- [ ] **Step 1: Test que falla (msw)** — agregar a `client.spec.ts` después del test de
  `buyStreakFreeze`:

```ts
it('getLeague envía el token y devuelve el resumen de la liga', async () => {
  server.use(
    http.get(`${BASE}/me/league`, ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer token-123');
      return HttpResponse.json({
        division: 'silver',
        cohort: {
          weekStart: '2026-07-13',
          standings: [
            { position: 1, displayName: 'ana', weeklyXp: 40, isMe: true, zone: 'promotion' }
          ]
        }
      });
    })
  );
  const client = new LingoApiClient({ baseUrl: BASE, getAccessToken: async () => 'token-123' });
  const league = await client.getLeague();
  expect(league.division).toBe('silver');
  expect(league.cohort?.standings[0].isMe).toBe(true);
});
```

Run: `pnpm --filter @lingoleap/api-client test` — Expected: FAIL (`getLeague` no existe).

- [ ] **Step 2: Implementar** — en `client.ts`: sumar `LeagueSummary` al import de tipos de
  `@lingoleap/core` y agregar después de `buyStreakFreeze`:

```ts
  getLeague(): Promise<LeagueSummary> {
    return this.request('/me/league');
  }
```

- [ ] **Step 3: Verificar** — Run: `pnpm --filter @lingoleap/api-client test && pnpm build` —
  Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api-client/src
git commit -m "feat(api-client): getLeague para el resumen de la liga semanal"
```

---

### Task 8: Web — página /league y división en la StatsBar

**Files:**
- Create: `apps/web/src/features/league/queries.ts`,
  `apps/web/src/features/league/divisionLabels.ts`,
  `apps/web/src/features/league/LeaguePage.tsx`,
  `apps/web/src/features/league/LeaguePage.spec.tsx`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/features/stats/StatsBar.tsx`,
  `apps/web/src/features/stats/StatsBar.spec.tsx`, `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `api.getLeague()` (Task 7), `LeagueDivision`, `LeagueSummary` de `@lingoleap/core`.
- Produces:
```ts
export function useLeague(): UseQueryResult<LeagueSummary, ApiError>;
export const DIVISION_LABEL: Record<LeagueDivision, string>; // Bronce/Plata/Oro/Diamante
```

- [ ] **Step 1: Test de la página que falla (RED)** — crear `LeaguePage.spec.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const getLeague = vi.hoisted(() => vi.fn());
vi.mock('../../app/api', () => ({ api: { getLeague } }));

import { LeaguePage } from './LeaguePage';
import { renderWithProviders } from '../../test/render';

describe('LeaguePage', () => {
  it('muestra la tabla con posiciones, zonas y la fila propia resaltada', async () => {
    getLeague.mockResolvedValue({
      division: 'silver',
      cohort: {
        weekStart: '2026-07-13',
        standings: [
          { position: 1, displayName: 'bo', weeklyXp: 40, isMe: false, zone: 'promotion' },
          { position: 2, displayName: 'ana', weeklyXp: 10, isMe: true, zone: 'promotion' }
        ]
      }
    });
    renderWithProviders(<LeaguePage />, { route: '/league' });
    expect(await screen.findByText('Liga Plata')).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1); // sin el header
    expect(rows[0]).toHaveTextContent('bo');
    expect(rows[0]).toHaveTextContent('40 XP');
    expect(rows[1]).toHaveTextContent('ana');
    expect(rows[1]).toHaveClass('league-row-me');
    expect(rows[0]).toHaveClass('league-row-promotion');
  });

  it('muestra el estado vacío si aún no hay cohorte esta semana', async () => {
    getLeague.mockResolvedValue({ division: 'bronze', cohort: null });
    renderWithProviders(<LeaguePage />, { route: '/league' });
    expect(await screen.findByText('Liga Bronce')).toBeInTheDocument();
    expect(screen.getByText('Completá una lección para entrar a la liga.')).toBeInTheDocument();
  });

  it('muestra un error si falla la carga', async () => {
    getLeague.mockRejectedValue(new Error('network'));
    renderWithProviders(<LeaguePage />, { route: '/league' });
    expect(await screen.findByText('No pudimos cargar tu liga.')).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @lingoleap/web test -- LeaguePage` — Expected: FAIL (módulo no existe).

- [ ] **Step 2: Implementar queries, labels y página**:

```ts
// apps/web/src/features/league/queries.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../../app/api';

export function useLeague() {
  return useQuery({ queryKey: ['league'], queryFn: () => api.getLeague() });
}
```

```ts
// apps/web/src/features/league/divisionLabels.ts
import type { LeagueDivision } from '@lingoleap/core';

export const DIVISION_LABEL: Record<LeagueDivision, string> = {
  bronze: 'Bronce',
  silver: 'Plata',
  gold: 'Oro',
  diamond: 'Diamante'
};
```

```tsx
// apps/web/src/features/league/LeaguePage.tsx
import type { LeagueZone } from '@lingoleap/core';
import { DIVISION_LABEL } from './divisionLabels';
import { useLeague } from './queries';

const ZONE_CLASS: Record<LeagueZone, string> = {
  promotion: 'league-row-promotion',
  demotion: 'league-row-demotion',
  none: ''
};

export function LeaguePage() {
  const { data, isPending, isError } = useLeague();

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
        <p role="alert">No pudimos cargar tu liga.</p>
      </div>
    );
  }

  return (
    <div className="container">
      <h2>🏆 Liga {DIVISION_LABEL[data.division]}</h2>
      {data.cohort === null ? (
        <p>Completá una lección para entrar a la liga.</p>
      ) : (
        <table className="league-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Jugador</th>
              <th>XP semanal</th>
            </tr>
          </thead>
          <tbody>
            {data.cohort.standings.map((s) => (
              <tr
                key={s.position}
                className={`${ZONE_CLASS[s.zone]} ${s.isMe ? 'league-row-me' : ''}`.trim()}
              >
                <td>{s.position}</td>
                <td>{s.displayName}</td>
                <td>{s.weeklyXp} XP</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

Run: `pnpm --filter @lingoleap/web test -- LeaguePage` — Expected: PASS (3 tests).

- [ ] **Step 3: Ruta** — en `App.tsx`, importar `LeaguePage` y agregar tras la ruta de
  `/achievements`:

```tsx
        <Route
          path="/league"
          element={
            <RequireAuth>
              <LeaguePage />
            </RequireAuth>
          }
        />
```

- [ ] **Step 4: StatsBar con división (test primero, RED)** — reescribir
  `StatsBar.spec.tsx` completo (el mock de api gana `getLeague`):

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { getStats, getLeague } = vi.hoisted(() => ({ getStats: vi.fn(), getLeague: vi.fn() }));
vi.mock('../../app/api', () => ({ api: { getStats, getLeague } }));

import { StatsBar } from './StatsBar';
import { renderWithProviders } from '../../test/render';

describe('StatsBar', () => {
  it('muestra racha, corazones, gemas, congeladores, liga y nivel con su progreso', async () => {
    getStats.mockResolvedValue({
      xp: 120, level: 2, xpIntoLevel: 20, xpToNextLevel: 180,
      streakCount: 3, streakFreezes: 1, gems: 0,
      hearts: 4, maxHearts: 5, nextHeartAt: null
    });
    getLeague.mockResolvedValue({ division: 'silver', cohort: null });
    renderWithProviders(<StatsBar />, { route: '/' });
    expect(await screen.findByText('🔥 3')).toBeInTheDocument();
    expect(screen.getByText('❤️ 4')).toBeInTheDocument();
    expect(screen.getByText('💎 0')).toBeInTheDocument();
    expect(screen.getByText('🧊 1')).toBeInTheDocument();
    expect(await screen.findByText('🏆 Plata')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /🏆 Plata/ })).toHaveAttribute('href', '/league');
    expect(screen.getByText('⚡ Nivel 2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progreso del nivel 2' })).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @lingoleap/web test -- StatsBar` — Expected: FAIL (`🏆 Plata` no existe).

- [ ] **Step 5: Implementar StatsBar** — en `StatsBar.tsx`: importar `useLeague` y
  `DIVISION_LABEL` de `../league/...`, llamar `const { data: league } = useLeague();` junto a
  `useStats()`, y entre el ítem 🧊 y el de nivel agregar:

```tsx
      {league && (
        <Link to="/league" className="stats-item stats-league-link" title="Ver liga">
          🏆 {DIVISION_LABEL[league.division]}
        </Link>
      )}
```

- [ ] **Step 6: CSS** — agregar a `apps/web/src/styles.css`, después de `.store-reason`:

```css
.league-table {
  width: 100%;
  border-collapse: collapse;
}

.league-table th,
.league-table td {
  padding: var(--space-sm);
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}

.league-row-me {
  background: var(--color-surface);
  font-weight: 700;
}

.league-row-promotion td:first-child {
  color: var(--color-success);
}

.league-row-demotion td:first-child {
  color: var(--color-danger);
}

.stats-league-link {
  text-decoration: none;
  color: inherit;
}
```

(Verificar que `--color-border`, `--color-surface`, `--color-success` y `--color-danger`
existen en `packages/tokens/src/tokens.css`; si algún nombre difiere, usar el token real —
nunca un hex.)

- [ ] **Step 7: Verificar todo** — Run: `pnpm --filter @lingoleap/web test && pnpm build && pnpm lint`
  — Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): página de liga semanal y división en la StatsBar"
```

---

### Task 9: Documentación

**Files:**
- Modify: `README.md` (roadmap: liga completa; sección nueva breve "Liga semanal" tras "Logros
  y gemas" con divisiones, reglas de cierre y podio; instrucciones de BD: agregar
  `0005_league.sql` a la lista de migraciones), `docs/BITACORA.md` (entrada de cierre del
  sub-proyecto, mismo formato que las anteriores)

- [ ] **Step 1: Actualizar ambos documentos.** La entrada de BITACORA se escribe con los
  problemas reales aparecidos en las Tareas 1-8 (revisar commits y lo ocurrido en la sesión)
  — nada genérico. Documentar explícitamente: (1) el cierre híbrido cron+perezoso y por qué
  (proceso no vivo 24/7 con $0 de infra); (2) la decisión de derivar la división de la última
  membresía cerrada en vez de almacenarla; (3) `display_name` congelado al ingresar para no
  hacer joins contra Auth ni exponer emails; (4) la excepción de capas del scheduler (vive en
  `presentation/` porque `@Cron` exige decoradores, igual que controllers/guard).

- [ ] **Step 2: Verificar y commitear**

Run: `pnpm lint && pnpm build && pnpm test` — Expected: PASS.

```bash
git add README.md docs/BITACORA.md
git commit -m "docs: bitácora y README de la liga semanal"
```

---

### Task 10: Smoke real end-to-end (manual, con el usuario)

**Prerrequisito:** correr `supabase/migrations/0005_league.sql` en el SQL Editor de Supabase.

- [ ] **Step 1: Levantar API y web**: `pnpm --filter @lingoleap/api dev` y
  `pnpm --filter @lingoleap/web dev`.
- [ ] **Step 2: Recorrido en el navegador**:
  - Usuario sin liga: la StatsBar muestra 🏆 Bronce; `/league` muestra el estado vacío.
  - Completar una lección → `/league` muestra la tabla con tu fila (posición 1, tu XP), zona de
    ascenso marcada.
  - Completar otra lección → el XP semanal acumula (sin recargar, tras el refetch).
  - Simular cierre: en Supabase, editar `week_start` de la cohorte a un lunes anterior →
    recargar `/league` → el cierre perezoso corre: gemas del podio acreditadas (ver 💎 en la
    StatsBar), división asciende a Plata, estado vacío para la semana nueva.
- [ ] **Step 3: Registrar resultado** en la BITACORA si hubo hallazgos.

---

## Verificación final

- [ ] `pnpm lint && pnpm build && pnpm test` en verde (core + api + api-client + web).
- [ ] Smoke del Task 10 completado.
- [ ] Merge a master + push + CI verde.
