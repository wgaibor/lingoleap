# Congelador de racha comprable con gemas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir comprar un congelador de racha gastando gemas (precio fijo 10💎, tope 2
acumulados), validado siempre en el servidor, con una sección "Tienda" en `/achievements` y el
conteo de congeladores visible en la `StatsBar`.

**Architecture:** Regla de negocio pura (`buyStreakFreeze`) en `packages/core/src/logic/streak.ts`
junto a `applyLessonDay`; un caso de uso nuevo (`BuyStreakFreezeUseCase`) en el backend la aplica
sobre la tabla `user_stats` ya existente (sin migración nueva) y la expone en
`POST /me/streak-freezes`; la web solo refleja el resultado vía `@lingoleap/api-client` y
TanStack Query, igual que el resto de la gamificación.

**Tech Stack:** El existente del monorepo: NestJS 11 hexagonal, Supabase (Postgres), Vitest (+
msw, supertest, Testing Library), React 18 + TanStack Query, tokens CSS.

## Global Constraints

- TypeScript `strict: true`; prohibido `any` explícito. Copy de UI y mensajes de error en español.
- Regla de capas API: `domain/` puro; `application/` solo domain+core; `infrastructure/`
  implementa puertos; `presentation/` solo llama casos de uso. Clases de application/infrastructure
  sin decoradores NestJS (wiring por `useFactory` en `content-api.module.ts`).
- La web NUNCA llama `fetch` directo: todo por `@lingoleap/api-client`.
- Colores/espaciados solo desde `@lingoleap/tokens` (ver `packages/tokens/src/tokens.css`);
  sombras solo `var(--shadow-sm)`.
- Reglas de gamificación en `packages/core` (funciones puras, sin frameworks) y **aplicadas y
  recalculadas siempre en el backend**; la UI solo refleja. El cliente nunca envía precio, tope,
  ni ningún dato de la compra — `POST /me/streak-freezes` no lleva body.
- **Precio y tope (cerrados en el spec, `docs/superpowers/specs/2026-07-15-streak-freeze-purchase-design.md`):**
  `STREAK_FREEZE_PRICE = 10`, `MAX_STREAK_FREEZES = 2`. Definidos una sola vez en
  `packages/core`, nunca hardcodeados en la web ni en el backend.
- Sin tabla ni migración nueva: reusa `user_stats.gems` y `user_stats.streak_freezes` (existen
  desde la Fase 3A).
- TDD en `packages/core` y backend (evidencia RED→GREEN); componentes web con Testing Library.
- Commits convencionales en español al final de cada tarea + trailer
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- pnpm 11; monorepo existente en `lingoleap/`; rama de trabajo nueva sobre `master`.

---

### Task 1: Core — regla pura de compra del congelador

**Files:**
- Modify: `packages/core/src/logic/streak.ts`, `packages/core/src/logic/streak.spec.ts`

**Interfaces:**
- Produces:
```ts
export const STREAK_FREEZE_PRICE = 10;
export const MAX_STREAK_FREEZES = 2;

export interface StreakFreezePurchaseInput {
  gems: number;
  streakFreezes: number;
}

export type StreakFreezePurchaseResult =
  | { ok: true; gems: number; streakFreezes: number }
  | { ok: false; reason: 'insufficient-gems' | 'max-freezes-reached' };

export function buyStreakFreeze(input: StreakFreezePurchaseInput): StreakFreezePurchaseResult;
```

- [ ] **Step 1: Test que falla (RED)** — agregar a `packages/core/src/logic/streak.spec.ts`, al
  final del archivo, después del último `it(...)` de `describe('applyLessonDay', ...)` (antes del
  `});` de cierre del describe, agregar un `describe` nuevo hermano):

```ts
describe('buyStreakFreeze', () => {
  it('compra exitosa con gemas exactas: resta el precio y suma un congelador', () => {
    expect(buyStreakFreeze({ gems: 10, streakFreezes: 0 }))
      .toEqual({ ok: true, gems: 0, streakFreezes: 1 });
  });

  it('compra exitosa con más gemas de las necesarias', () => {
    expect(buyStreakFreeze({ gems: 25, streakFreezes: 1 }))
      .toEqual({ ok: true, gems: 15, streakFreezes: 2 });
  });

  it('rechaza con gemas insuficientes (un gema menos del precio)', () => {
    expect(buyStreakFreeze({ gems: 9, streakFreezes: 0 }))
      .toEqual({ ok: false, reason: 'insufficient-gems' });
  });

  it('rechaza al llegar al tope aunque sobren gemas', () => {
    expect(buyStreakFreeze({ gems: 100, streakFreezes: 2 }))
      .toEqual({ ok: false, reason: 'max-freezes-reached' });
  });

  it('prioriza el motivo de tope sobre el de gemas si ambos fallan a la vez', () => {
    expect(buyStreakFreeze({ gems: 0, streakFreezes: 2 }))
      .toEqual({ ok: false, reason: 'max-freezes-reached' });
  });
});
```

Y agregar el import al inicio del archivo (reemplazar la línea de import existente):

```ts
import { describe, expect, it } from 'vitest';
import { applyLessonDay, buyStreakFreeze } from './streak';
```

Run: `pnpm --filter @lingoleap/core test -- streak` — Expected: FAIL (`buyStreakFreeze` no
existe).

- [ ] **Step 2: Implementar** — agregar al final de `packages/core/src/logic/streak.ts` (el
  contenido existente de `applyLessonDay` no cambia):

```ts
export const STREAK_FREEZE_PRICE = 10;
export const MAX_STREAK_FREEZES = 2;

export interface StreakFreezePurchaseInput {
  gems: number;
  streakFreezes: number;
}

export type StreakFreezePurchaseResult =
  | { ok: true; gems: number; streakFreezes: number }
  | { ok: false; reason: 'insufficient-gems' | 'max-freezes-reached' };

export function buyStreakFreeze(input: StreakFreezePurchaseInput): StreakFreezePurchaseResult {
  if (input.streakFreezes >= MAX_STREAK_FREEZES) {
    return { ok: false, reason: 'max-freezes-reached' };
  }
  if (input.gems < STREAK_FREEZE_PRICE) {
    return { ok: false, reason: 'insufficient-gems' };
  }
  return { ok: true, gems: input.gems - STREAK_FREEZE_PRICE, streakFreezes: input.streakFreezes + 1 };
}
```

- [ ] **Step 3: Verificar GREEN** — Run: `pnpm --filter @lingoleap/core test` — Expected: PASS
  (todos los tests, incluidos los 5 nuevos de `buyStreakFreeze` y los 6 previos de
  `applyLessonDay`). No hace falta tocar `packages/core/src/index.ts`: ya existe
  `export * from './logic/streak';`, así que `buyStreakFreeze`/`STREAK_FREEZE_PRICE`/
  `MAX_STREAK_FREEZES` quedan exportados automáticamente.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/logic/streak.ts packages/core/src/logic/streak.spec.ts
git commit -m "feat(core): regla de compra del congelador de racha (precio y tope)"
```

---

### Task 2: Backend — BuyStreakFreezeUseCase, endpoint y wiring

**Files:**
- Create: `apps/api/src/application/use-cases/buy-streak-freeze.use-case.ts`,
  `apps/api/src/application/use-cases/buy-streak-freeze.use-case.spec.ts`
- Modify: `apps/api/src/domain/errors.ts`,
  `apps/api/src/application/use-cases/get-stats.use-case.ts`,
  `apps/api/src/presentation/stats.controller.ts`,
  `apps/api/src/presentation/content-api.module.ts`,
  `apps/api/src/presentation/stats-api.spec.ts`

**Interfaces:**
- Consumes: `buyStreakFreeze`, `StreakFreezePurchaseResult` de `@lingoleap/core` (Task 1);
  `StatsRepository`/`STATS_REPOSITORY` (puerto ya existente); `defaultUserStats` (ya existente).
- Produces:
```ts
// apps/api/src/domain/errors.ts — 2 clases nuevas
export class InsufficientGemsError extends DomainError { readonly code = 'INSUFFICIENT_GEMS'; }
export class StreakFreezeLimitReachedError extends DomainError { readonly code = 'STREAK_FREEZE_LIMIT_REACHED'; }

// apps/api/src/application/use-cases/get-stats.use-case.ts — función exportada nueva
export function toStatsSummary(stored: UserStats, nowIso: string): StatsSummary;

// apps/api/src/application/use-cases/buy-streak-freeze.use-case.ts
export class BuyStreakFreezeUseCase {
  constructor(deps: { stats: StatsRepository; now?: () => string });
  execute(userId: string): Promise<StatsSummary>; // lanza InsufficientGemsError o StreakFreezeLimitReachedError
}
// POST /me/streak-freezes (con AuthGuard) → 201 StatsSummary, o 400 { code, message } si se rechaza
```

- [ ] **Step 1: Test que falla (RED) — refactor de `GetStatsUseCase`** — reescribir
  `apps/api/src/application/use-cases/get-stats.use-case.ts` completo para extraer
  `toStatsSummary` como función exportada (el comportamiento no cambia; el spec existente
  `get-stats.use-case.spec.ts` debe seguir en verde sin tocarlo):

```ts
// apps/api/src/application/use-cases/get-stats.use-case.ts
import { levelProgress, MAX_HEARTS, nextHeartAt, regenerateHearts, type StatsSummary } from '@lingoleap/core';
import { defaultUserStats, type UserStats } from '../../domain/user-stats';
import type { StatsRepository } from '../ports/stats.repository';

export function toStatsSummary(stored: UserStats, nowIso: string): StatsSummary {
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

export class GetStatsUseCase {
  constructor(private readonly deps: { stats: StatsRepository; now?: () => string }) {}

  async execute(userId: string): Promise<StatsSummary> {
    const nowIso = (this.deps.now ?? (() => new Date().toISOString()))();
    const stored = (await this.deps.stats.findByUser(userId)) ?? defaultUserStats(userId, nowIso);
    return toStatsSummary(stored, nowIso);
  }
}
```

Run: `pnpm --filter @lingoleap/api test -- get-stats` — Expected: PASS (el refactor no cambia
comportamiento; si falla, revisar que `toStatsSummary` quedó idéntica a la lógica que tenía
`execute` antes).

- [ ] **Step 2: Agregar las 2 `DomainError` nuevas** — en `apps/api/src/domain/errors.ts`,
  agregar al final del archivo (las clases existentes no cambian):

```ts
export class InsufficientGemsError extends DomainError {
  readonly code = 'INSUFFICIENT_GEMS';
}

export class StreakFreezeLimitReachedError extends DomainError {
  readonly code = 'STREAK_FREEZE_LIMIT_REACHED';
}
```

- [ ] **Step 3: Test unit que falla (RED)** —
  `apps/api/src/application/use-cases/buy-streak-freeze.use-case.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { StatsRepository } from '../ports/stats.repository';
import type { UserStats } from '../../domain/user-stats';
import { InsufficientGemsError, StreakFreezeLimitReachedError } from '../../domain/errors';
import { BuyStreakFreezeUseCase } from './buy-streak-freeze.use-case';

class FakeStats implements StatsRepository {
  constructor(private readonly stored: UserStats | null) {}
  saved: UserStats[] = [];
  async findByUser(): Promise<UserStats | null> { return this.stored; }
  async save(stats: UserStats): Promise<void> { this.saved.push(stats); }
}

const NOW = '2026-07-15T12:00:00.000Z';

describe('BuyStreakFreezeUseCase', () => {
  it('compra exitosa: resta 10 gemas, suma 1 congelador, no toca el resto de campos', async () => {
    const stats = new FakeStats({
      userId: 'u1', xp: 50, streakCount: 3, lastLessonDate: '2026-07-14',
      hearts: 5, heartsUpdatedAt: NOW, gems: 15, streakFreezes: 0
    });
    const useCase = new BuyStreakFreezeUseCase({ stats, now: () => NOW });
    const summary = await useCase.execute('u1');
    expect(summary.gems).toBe(5);
    expect(summary.streakFreezes).toBe(1);
    expect(stats.saved).toEqual([{
      userId: 'u1', xp: 50, streakCount: 3, lastLessonDate: '2026-07-14',
      hearts: 5, heartsUpdatedAt: NOW, gems: 5, streakFreezes: 1
    }]);
  });

  it('lanza InsufficientGemsError sin guardar si no alcanzan las gemas', async () => {
    const stats = new FakeStats({
      userId: 'u1', xp: 0, streakCount: 0, lastLessonDate: null,
      hearts: 5, heartsUpdatedAt: NOW, gems: 9, streakFreezes: 0
    });
    const useCase = new BuyStreakFreezeUseCase({ stats, now: () => NOW });
    await expect(useCase.execute('u1')).rejects.toThrow(InsufficientGemsError);
    expect(stats.saved).toEqual([]);
  });

  it('lanza StreakFreezeLimitReachedError sin guardar si ya está en el tope', async () => {
    const stats = new FakeStats({
      userId: 'u1', xp: 0, streakCount: 0, lastLessonDate: null,
      hearts: 5, heartsUpdatedAt: NOW, gems: 100, streakFreezes: 2
    });
    const useCase = new BuyStreakFreezeUseCase({ stats, now: () => NOW });
    await expect(useCase.execute('u1')).rejects.toThrow(StreakFreezeLimitReachedError);
    expect(stats.saved).toEqual([]);
  });

  it('usa stats por defecto (0 gemas) si el usuario no tiene fila y rechaza la compra', async () => {
    const stats = new FakeStats(null);
    const useCase = new BuyStreakFreezeUseCase({ stats, now: () => NOW });
    await expect(useCase.execute('u1')).rejects.toThrow(InsufficientGemsError);
  });
});
```

Run: `pnpm --filter @lingoleap/api test -- buy-streak-freeze` — Expected: FAIL (módulo no
existe).

- [ ] **Step 4: Implementar el caso de uso**:

```ts
// apps/api/src/application/use-cases/buy-streak-freeze.use-case.ts
import { buyStreakFreeze, type StatsSummary } from '@lingoleap/core';
import { InsufficientGemsError, StreakFreezeLimitReachedError } from '../../domain/errors';
import { defaultUserStats } from '../../domain/user-stats';
import type { StatsRepository } from '../ports/stats.repository';
import { toStatsSummary } from './get-stats.use-case';

export class BuyStreakFreezeUseCase {
  constructor(private readonly deps: { stats: StatsRepository; now?: () => string }) {}

  async execute(userId: string): Promise<StatsSummary> {
    const nowIso = (this.deps.now ?? (() => new Date().toISOString()))();
    const stored = (await this.deps.stats.findByUser(userId)) ?? defaultUserStats(userId, nowIso);
    const result = buyStreakFreeze({ gems: stored.gems, streakFreezes: stored.streakFreezes });
    if (!result.ok) {
      if (result.reason === 'max-freezes-reached') {
        throw new StreakFreezeLimitReachedError('Ya tenés el máximo de congeladores de racha.');
      }
      throw new InsufficientGemsError('No tenés gemas suficientes para comprar un congelador de racha.');
    }
    const updated = { ...stored, gems: result.gems, streakFreezes: result.streakFreezes };
    await this.deps.stats.save(updated);
    return toStatsSummary(updated, nowIso);
  }
}
```

- [ ] **Step 5: Verificar unit GREEN** — Run: `pnpm --filter @lingoleap/api test -- buy-streak-freeze`
  — Expected: PASS (4 tests).

- [ ] **Step 6: Endpoint** — reescribir `apps/api/src/presentation/stats.controller.ts` completo:

```ts
// apps/api/src/presentation/stats.controller.ts
import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { StatsSummary } from '@lingoleap/core';
import { BuyStreakFreezeUseCase } from '../application/use-cases/buy-streak-freeze.use-case';
import { GetStatsUseCase } from '../application/use-cases/get-stats.use-case';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';

@Controller('me')
@UseGuards(AuthGuard)
export class StatsController {
  constructor(
    private readonly getStats: GetStatsUseCase,
    private readonly buyStreakFreezeUseCase: BuyStreakFreezeUseCase
  ) {}

  @Get('stats')
  stats(@Req() req: AuthenticatedRequest): Promise<StatsSummary> {
    return this.getStats.execute(req.user.id);
  }

  @Post('streak-freezes')
  buyStreakFreeze(@Req() req: AuthenticatedRequest): Promise<StatsSummary> {
    return this.buyStreakFreezeUseCase.execute(req.user.id);
  }
}
```

Nota: `@Post()` en NestJS devuelve `201 Created` por defecto (mismo status que ya usa
`POST /progress/lessons/:id/complete` en `ProgressController`) — no hace falta `@HttpCode`.

- [ ] **Step 7: Wiring** — en `apps/api/src/presentation/content-api.module.ts`, agregar el
  import y el provider (el resto del archivo no cambia):

```ts
// agregar a los imports, en orden alfabético junto a los demás use-cases:
import { BuyStreakFreezeUseCase } from '../application/use-cases/buy-streak-freeze.use-case';

// agregar a providers, después del provider de GetStatsUseCase:
{
  provide: BuyStreakFreezeUseCase,
  useFactory: (stats: StatsRepository) => new BuyStreakFreezeUseCase({ stats }),
  inject: [STATS_REPOSITORY]
},
```

- [ ] **Step 8: Test e2e que falla (RED)** — reescribir `apps/api/src/presentation/stats-api.spec.ts`
  completo (saca la instancia de `FakeStats` a nivel de `describe` para poder sembrar estado
  distinto en cada test, mismo patrón que `progress-api.spec.ts`):

```ts
// apps/api/src/presentation/stats-api.spec.ts
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  const stats = new FakeStats();

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
    process.env.PEXELS_API_KEY = 'stub';
    const moduleRef = await Test.createTestingModule({ imports: [ContentApiModule] })
      .overrideProvider(AUTH_VERIFIER).useValue(new FakeVerifier())
      .overrideProvider(STATS_REPOSITORY).useValue(stats)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  beforeEach(() => { stats.stored = null; });

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

  it('rechaza comprar un congelador sin token', async () => {
    await request(app.getHttpServer()).post('/me/streak-freezes').expect(401);
  });

  it('compra un congelador con gemas suficientes', async () => {
    stats.stored = {
      userId: 'user-1', xp: 0, streakCount: 1, lastLessonDate: '2026-07-14',
      hearts: 5, heartsUpdatedAt: '2026-07-15T00:00:00.000Z', gems: 10, streakFreezes: 0
    };
    const res = await request(app.getHttpServer())
      .post('/me/streak-freezes')
      .set('Authorization', 'Bearer valid-token')
      .expect(201);
    expect(res.body).toMatchObject({ gems: 0, streakFreezes: 1 });
  });

  it('rechaza la compra sin gemas suficientes', async () => {
    stats.stored = {
      userId: 'user-1', xp: 0, streakCount: 0, lastLessonDate: null,
      hearts: 5, heartsUpdatedAt: '2026-07-15T00:00:00.000Z', gems: 5, streakFreezes: 0
    };
    const res = await request(app.getHttpServer())
      .post('/me/streak-freezes')
      .set('Authorization', 'Bearer valid-token')
      .expect(400);
    expect(res.body.code).toBe('INSUFFICIENT_GEMS');
  });

  it('rechaza la compra en el tope de congeladores', async () => {
    stats.stored = {
      userId: 'user-1', xp: 0, streakCount: 0, lastLessonDate: null,
      hearts: 5, heartsUpdatedAt: '2026-07-15T00:00:00.000Z', gems: 100, streakFreezes: 2
    };
    const res = await request(app.getHttpServer())
      .post('/me/streak-freezes')
      .set('Authorization', 'Bearer valid-token')
      .expect(400);
    expect(res.body.code).toBe('STREAK_FREEZE_LIMIT_REACHED');
  });
});
```

Run: `pnpm --filter @lingoleap/api test -- stats-api` — Expected: FAIL (endpoint/wiring
todavía no completos si algún paso previo quedó a medias; con los Steps 6-7 aplicados debería
compilar y solo faltar verificar).

- [ ] **Step 9: Verificar todo** — Run: `pnpm --filter @lingoleap/api test && pnpm build && pnpm lint`
  — Expected: todo PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): endpoint para comprar un congelador de racha con gemas"
```

---

### Task 3: api-client — buyStreakFreeze()

**Files:**
- Modify: `packages/api-client/src/client.ts`, `packages/api-client/src/client.spec.ts`

**Interfaces:**
- Consumes: `StatsSummary` de `@lingoleap/core`; endpoint de Task 2.
- Produces:
```ts
buyStreakFreeze(): Promise<StatsSummary>;
```

- [ ] **Step 1: Test que falla (msw)** — agregar a `packages/api-client/src/client.spec.ts`,
  después del test `'getStats envía el token y devuelve el resumen'`:

```ts
it('buyStreakFreeze envía el token por POST y devuelve el resumen actualizado', async () => {
  server.use(
    http.post(`${BASE}/me/streak-freezes`, ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer token-123');
      return HttpResponse.json({
        xp: 50, level: 1, xpIntoLevel: 50, xpToNextLevel: 50,
        streakCount: 3, streakFreezes: 1, gems: 0,
        hearts: 5, maxHearts: 5, nextHeartAt: null
      });
    })
  );
  const client = new LingoApiClient({ baseUrl: BASE, getAccessToken: async () => 'token-123' });
  const stats = await client.buyStreakFreeze();
  expect(stats.streakFreezes).toBe(1);
  expect(stats.gems).toBe(0);
});
```

Run: `pnpm --filter @lingoleap/api-client test` — Expected: FAIL (`buyStreakFreeze` no existe).

- [ ] **Step 2: Implementar** en `packages/api-client/src/client.ts` — agregar el método después
  de `getAchievements` (el resto del archivo no cambia):

```ts
buyStreakFreeze(): Promise<StatsSummary> {
  return this.request('/me/streak-freezes', { method: 'POST' });
}
```

- [ ] **Step 3: Verificar** — Run: `pnpm --filter @lingoleap/api-client test && pnpm build` —
  Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api-client/src
git commit -m "feat(api-client): buyStreakFreeze para comprar un congelador de racha"
```

---

### Task 4: Web — Tienda en /achievements y contador en la StatsBar

**Files:**
- Modify: `apps/web/src/features/achievements/queries.ts`,
  `apps/web/src/features/achievements/AchievementsPage.tsx`,
  `apps/web/src/features/achievements/AchievementsPage.spec.tsx`,
  `apps/web/src/features/stats/StatsBar.tsx`, `apps/web/src/features/stats/StatsBar.spec.tsx`,
  `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `api.buyStreakFreeze()` (Task 3); `useStats()` (`apps/web/src/features/stats/queries.ts`,
  ya existente); `STREAK_FREEZE_PRICE`, `MAX_STREAK_FREEZES` de `@lingoleap/core` (Task 1).
- Produces:
```ts
// queries.ts
export function useBuyStreakFreeze(): UseMutationResult<StatsSummary, ApiError, void>;
```

- [ ] **Step 1: Test que falla (RED)** — reescribir
  `apps/web/src/features/achievements/AchievementsPage.spec.tsx` completo (agrega mocks de
  `getStats`/`buyStreakFreeze` a los 2 tests existentes, que si no se actualizan rompen porque el
  componente ahora también llama a `api.getStats`, y suma 3 tests nuevos de la Tienda):

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const { getAchievements, getStats, buyStreakFreeze } = vi.hoisted(() => ({
  getAchievements: vi.fn(),
  getStats: vi.fn(),
  buyStreakFreeze: vi.fn()
}));
vi.mock('../../app/api', () => ({ api: { getAchievements, getStats, buyStreakFreeze } }));

import { AchievementsPage } from './AchievementsPage';
import { renderWithProviders } from '../../test/render';

const statsFixture = {
  xp: 0, level: 1, xpIntoLevel: 0, xpToNextLevel: 100,
  streakCount: 3, streakFreezes: 0, gems: 20,
  hearts: 5, maxHearts: 5, nextHeartAt: null
};

describe('AchievementsPage', () => {
  it('agrupa los logros por categoría y marca cuáles están desbloqueados', async () => {
    getAchievements.mockResolvedValue([
      { id: 'streak-3', category: 'streak', threshold: 3, gems: 5, unlocked: true },
      { id: 'streak-7', category: 'streak', threshold: 7, gems: 15, unlocked: false },
      { id: 'lessons-10', category: 'lessons', threshold: 10, gems: 5, unlocked: false }
    ]);
    getStats.mockResolvedValue(statsFixture);
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
    getStats.mockResolvedValue(statsFixture);
    renderWithProviders(<AchievementsPage />, { route: '/achievements' });
    expect(await screen.findByText('No pudimos cargar tus logros.')).toBeInTheDocument();
  });

  it('muestra el precio y permite comprar un congelador con gemas suficientes', async () => {
    getAchievements.mockResolvedValue([]);
    getStats.mockResolvedValueOnce(statsFixture)
      .mockResolvedValueOnce({ ...statsFixture, gems: 10, streakFreezes: 1 });
    buyStreakFreeze.mockResolvedValue({ ...statsFixture, gems: 10, streakFreezes: 1 });
    renderWithProviders(<AchievementsPage />, { route: '/achievements' });

    expect(await screen.findByText(/🧊 0 congeladores/)).toBeInTheDocument();
    expect(screen.getByText(/💎 20 gemas/)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Comprar congelador (10💎)' });
    expect(button).toBeEnabled();

    await userEvent.click(button);
    expect(buyStreakFreeze).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText(/🧊 1 congeladores/)).toBeInTheDocument());
  });

  it('deshabilita comprar sin gemas suficientes', async () => {
    getAchievements.mockResolvedValue([]);
    getStats.mockResolvedValue({ ...statsFixture, gems: 5 });
    renderWithProviders(<AchievementsPage />, { route: '/achievements' });
    const button = await screen.findByRole('button', { name: 'Comprar congelador (10💎)' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Necesitás 10💎.')).toBeInTheDocument();
  });

  it('deshabilita comprar al llegar al tope de congeladores', async () => {
    getAchievements.mockResolvedValue([]);
    getStats.mockResolvedValue({ ...statsFixture, streakFreezes: 2 });
    renderWithProviders(<AchievementsPage />, { route: '/achievements' });
    const button = await screen.findByRole('button', { name: 'Comprar congelador (10💎)' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Ya tenés el máximo de congeladores.')).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @lingoleap/web test -- AchievementsPage` — Expected: FAIL (`api.getStats`/
`api.buyStreakFreeze` no se usan todavía en el componente, y no existe el texto de la Tienda).

- [ ] **Step 2: Mutation nueva** en `apps/web/src/features/achievements/queries.ts` (reescribir
  el archivo completo):

```ts
// apps/web/src/features/achievements/queries.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../app/api';

export function useAchievements() {
  return useQuery({ queryKey: ['achievements'], queryFn: () => api.getAchievements() });
}

export function useBuyStreakFreeze() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.buyStreakFreeze(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    }
  });
}
```

- [ ] **Step 3: Sección Tienda** — reescribir `apps/web/src/features/achievements/AchievementsPage.tsx`
  completo:

```tsx
// apps/web/src/features/achievements/AchievementsPage.tsx
import {
  MAX_STREAK_FREEZES, STREAK_FREEZE_PRICE, type AchievementCategory, type AchievementStatus
} from '@lingoleap/core';
import { ACHIEVEMENT_LABEL } from './achievementLabels';
import { useAchievements, useBuyStreakFreeze } from './queries';
import { useStats } from '../stats/queries';

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

function StoreSection() {
  const { data: stats } = useStats();
  const buyStreakFreeze = useBuyStreakFreeze();

  if (!stats) {
    return null;
  }

  const atMax = stats.streakFreezes >= MAX_STREAK_FREEZES;
  const notEnoughGems = stats.gems < STREAK_FREEZE_PRICE;
  const disabled = atMax || notEnoughGems || buyStreakFreeze.isPending;

  let reason: string | null = null;
  if (atMax) {
    reason = 'Ya tenés el máximo de congeladores.';
  } else if (notEnoughGems) {
    reason = `Necesitás ${STREAK_FREEZE_PRICE}💎.`;
  }

  return (
    <section className="store-section">
      <h3>Tienda</h3>
      <p className="store-status">
        🧊 {stats.streakFreezes} congeladores · 💎 {stats.gems} gemas
      </p>
      <button
        type="button"
        className="button button-primary"
        disabled={disabled}
        onClick={() => buyStreakFreeze.mutate()}
      >
        Comprar congelador ({STREAK_FREEZE_PRICE}💎)
      </button>
      {reason && <p className="store-reason">{reason}</p>}
      {buyStreakFreeze.isError && <p role="alert">No pudimos completar la compra.</p>}
    </section>
  );
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
      <StoreSection />
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

- [ ] **Step 4: Verificar GREEN (web)** — Run: `pnpm --filter @lingoleap/web test -- AchievementsPage`
  — Expected: PASS (5 tests).

- [ ] **Step 5: Contador en la StatsBar** — extender el test primero. Reescribir
  `apps/web/src/features/stats/StatsBar.spec.tsx` completo:

```tsx
// apps/web/src/features/stats/StatsBar.spec.tsx
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const getStats = vi.hoisted(() => vi.fn());
vi.mock('../../app/api', () => ({ api: { getStats } }));

import { StatsBar } from './StatsBar';
import { renderWithProviders } from '../../test/render';

describe('StatsBar', () => {
  it('muestra racha, corazones, gemas, congeladores y nivel con su progreso', async () => {
    getStats.mockResolvedValue({
      xp: 120, level: 2, xpIntoLevel: 20, xpToNextLevel: 180,
      streakCount: 3, streakFreezes: 1, gems: 0,
      hearts: 4, maxHearts: 5, nextHeartAt: null
    });
    renderWithProviders(<StatsBar />, { route: '/' });
    expect(await screen.findByText('🔥 3')).toBeInTheDocument();
    expect(screen.getByText('❤️ 4')).toBeInTheDocument();
    expect(screen.getByText('💎 0')).toBeInTheDocument();
    expect(screen.getByText('🧊 1')).toBeInTheDocument();
    expect(screen.getByText('⚡ Nivel 2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progreso del nivel 2' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /💎 0/ })).toHaveAttribute('href', '/achievements');
  });
});
```

Run: `pnpm --filter @lingoleap/web test -- StatsBar` — Expected: FAIL (`🧊 1` no existe todavía).

- [ ] **Step 6: Implementar** — en `apps/web/src/features/stats/StatsBar.tsx`, agregar el ítem
  nuevo entre el link de gemas y el de nivel (el resto del archivo no cambia):

```tsx
// apps/web/src/features/stats/StatsBar.tsx — dentro del <div className="stats-bar">:
      <Link to="/achievements" className="stats-item stats-gems-link" title="Ver logros">💎 {data.gems}</Link>
      <span className="stats-item" title="Congeladores de racha">🧊 {data.streakFreezes}</span>
      <span className="stats-item" title="Nivel">⚡ Nivel {data.level}</span>
```

- [ ] **Step 7: CSS** — agregar a `apps/web/src/styles.css`, junto a `.achievements-gems`:

```css
.store-section {
  margin-bottom: var(--space-lg);
}

.store-status {
  margin: 0 0 var(--space-sm);
  color: var(--color-text-muted);
}

.store-reason {
  margin: var(--space-sm) 0 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}
```

- [ ] **Step 8: Verificar todo** — Run: `pnpm --filter @lingoleap/web test && pnpm build && pnpm lint`
  — Expected: PASS (todos, incluidos los previos de `StatsBar`/`AchievementsPage`/`App`).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): tienda para comprar congelador de racha y contador en la StatsBar"
```

---

### Task 5: Documentación

**Files:**
- Modify: `README.md` (sección "Gamificación": mencionar el congelador comprable junto a
  logros/gemas), `docs/BITACORA.md` (nueva entrada de cierre de este sub-proyecto, mismo formato
  que las fases/sub-proyectos anteriores: decisiones+alternativas+porqués, problemas reales
  encontrados en las tareas, deuda técnica, guía de entrevista con los temas nuevos)

- [ ] **Step 1: Actualizar ambos documentos.** La entrada de BITACORA se escribe con los
  problemas reales que hayan aparecido en las Tareas 1-4 (revisar los reportes en
  `.superpowers/sdd/` y los commits) — nada genérico. Documentar explícitamente: (1) por qué no
  hizo falta una migración nueva (columnas ya existentes desde la Fase 3A); (2) por qué se
  extrajo `toStatsSummary` como función compartida entre `GetStatsUseCase` y
  `BuyStreakFreezeUseCase` en vez de duplicar el cálculo; (3) por qué la compra es de un solo
  clic sin confirmación (razón ya fijada en el spec, §3).

- [ ] **Step 2: Verificar y commitear**

Run: `pnpm lint && pnpm build && pnpm test` — Expected: PASS.

```bash
git add README.md docs/BITACORA.md
git commit -m "docs: bitácora y README del congelador de racha comprable"
```

---

### Task 6: Smoke real end-to-end (manual, con el usuario)

**Prerrequisito:** ninguno — no hay migración nueva que correr en Supabase.

- [ ] **Step 1: Levantar API y web**: `pnpm --filter @lingoleap/api dev` y
  `pnpm --filter @lingoleap/web dev`.
- [ ] **Step 2: Recorrido completo en el navegador** (el usuario, o guiado con Claude in Chrome):
  - Con menos de 10💎: entrar a `/achievements` → el botón "Comprar congelador (10💎)" aparece
    deshabilitado con el texto "Necesitás 10💎.".
  - Ganar gemas (completar una lección que cruce un logro, o ajustar `gems` directamente en
    Supabase → Table Editor → `user_stats` para la prueba) hasta tener ≥10💎 → el botón se
    habilita.
  - Comprar un congelador → la StatsBar refleja 🧊 1 y las gemas bajan en 10 sin recargar la
    página.
  - Comprar hasta llegar a 🧊 2 → el botón vuelve a deshabilitarse con "Ya tenés el máximo de
    congeladores.", aunque sobren gemas.
  - Saltarse un día de racha (o simular `last_lesson_date` dos días atrás en Supabase) y completar
    una lección → la racha se extiende en vez de reiniciarse, y 🧊 baja a 1 (`freezeUsed`,
    verificar también en la respuesta de `POST /progress/lessons/:id/complete`).
- [ ] **Step 3: Registrar resultado** en `.superpowers/sdd/progress.md` y en la BITACORA si hubo
  hallazgos.

---

## Verificación final

- [ ] `pnpm lint && pnpm build && pnpm test` en verde (core + api + api-client + web).
- [ ] Smoke del Task 6 completado con el recorrido real.
- [ ] Merge a master + push + CI verde (flujo de cierre habitual).
