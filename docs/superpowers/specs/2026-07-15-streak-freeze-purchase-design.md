# Congelador de racha comprable con gemas — Design Spec

> Sub-proyecto de la Fase 3B (`docs/superpowers/specs/2026-07-10-lingoleap-design.md`, §9 y §13),
> el segundo de los dos que quedaron fuera de alcance del primer corte
> (`docs/superpowers/specs/2026-07-14-fase-3b-logros-gemas-design.md`, §2/§8). Cubre solo: gastar
> gemas para comprar un congelador de racha. La liga semanal sigue fuera de alcance, como
> sub-proyecto independiente a brainstormear por separado.

## 1. Problema a resolver

`applyLessonDay` (`packages/core/src/logic/streak.ts`) ya sabe *consumir* un congelador para
salvar la racha si el usuario se salta un día — pero `streakFreezes` nunca sube de 0: no existe
ninguna vía para que un usuario obtenga uno. Las gemas, además del logro que las otorga, no
tienen ningún uso — se acumulan sin propósito. Este sub-proyecto cierra ambos huecos: da un
destino a las gemas y activa un mecanismo que ya existe pero está inerte.

## 2. Alcance

**Incluye:**
- Comprar un congelador de racha gastando gemas, a un precio fijo.
- Tope máximo de congeladores acumulables a la vez.
- Endpoint para comprar, validado siempre en el servidor (igual que XP/racha/corazones).
- Sección "Tienda" en la página `/achievements`, con el botón de compra.
- Contador de congeladores en la `StatsBar`, visible en todo momento (mismo criterio que
  racha/corazones/gemas/nivel).

**Explícitamente fuera de alcance** (queda para un sub-proyecto futuro, con su propio
brainstorm):
- Liga semanal (cohortes, cron, ascenso/descenso).
- Cualquier otro ítem comprable con gemas — la Tienda de este corte tiene un solo producto.
- Historial o registro de compras (solo importa el conteo actual de congeladores y gemas).

## 3. Decisiones técnicas y su porqué

| Decisión | Alternativa considerada | Por qué se eligió |
|---|---|---|
| Precio fijo: **10 gemas** por congelador | Precio variable o creciente por compra | Con un solo producto y sin necesidad de UI para consultar precios variables, un precio fijo es la opción más simple que cumple el objetivo (darle uso a las gemas). Es consistente con el rango de gemas que ya otorgan los logros (5/15/30): alcanzable tras 1-2 logros, no trivial ni inalcanzable. |
| Tope: **máximo 2 congeladores acumulados** | Sin tope | `applyLessonDay` hoy solo cubre saltarse UN día por congelador (no hay lógica de "saltarse 2 días seguidos" con una sola compra). Sin tope, un usuario podría ahorrar gemas y volver la racha prácticamente irrompible, lo que le quita sentido a la mecánica de racha diaria. Un tope bajo (2) da colchón real sin eliminar el riesgo de perder la racha. |
| Validación y estado en `user_stats` existente (columna `streak_freezes` ya presente desde la Fase 3A) | Tabla nueva de "compras" | No hace falta historial (ver §2) — el único estado que importa es el conteo actual, que ya tiene una columna dedicada sin usar. Cero migraciones nuevas para este sub-proyecto. |
| Regla de compra como función pura en `packages/core` (`buyStreakFreeze`) | Validar directamente en el caso de uso del backend, sin pasar por `packages/core` | Mismo patrón que `xp.ts`/`hearts.ts`/`streak.ts`: la regla (precio, tope, qué pasa si no alcanza) es lógica de dominio reusable por la futura app móvil, sin I/O ni framework — el caso de uso del backend solo la aplica y persiste el resultado. |
| Dos `DomainError` específicas (`InsufficientGemsError`, `StreakFreezeLimitReachedError`) en vez de un error genérico | Una sola `PurchaseNotAllowedError` con un campo `reason` | Sigue la regla del proyecto ("agregar una subclase de `DomainError` en vez de un error genérico") y dos códigos distintos le permiten al cliente mostrar un mensaje específico por motivo sin parsear texto libre. |
| Un clic compra al instante, sin diálogo de confirmación | Confirmación en dos pasos antes de gastar gemas | El precio ya es visible en el botón (`Comprar (10💎)`) y el botón mismo está deshabilitado cuando no se puede comprar — no hay una acción destructiva ni irreversible que amerite un paso extra (perder la racha por no tener congelador ya es el estado por defecto; comprar uno es estrictamente una mejora). |

## 4. Arquitectura

### `packages/core` (extiende `logic/streak.ts`, no crea archivo nuevo)

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

Sin estado, sin reloj, sin I/O — reglas de orden: primero se comprueba el tope, después las
gemas (da igual el orden para el resultado final, pero fija cuál mensaje gana si ambas
condiciones fallan a la vez).

### Backend (`apps/api`)

- **Sin migración nueva** — `user_stats.streak_freezes` y `user_stats.gems` ya existen.
- **Dos `DomainError` nuevas** en `domain/errors.ts`:
  ```ts
  export class InsufficientGemsError extends DomainError {
    readonly code = 'INSUFFICIENT_GEMS';
  }
  export class StreakFreezeLimitReachedError extends DomainError {
    readonly code = 'STREAK_FREEZE_LIMIT_REACHED';
  }
  ```
  Sin entrada nueva en `STATUS_BY_CODE` — ambas caen en el `HttpStatus.BAD_REQUEST` por defecto
  del filtro, que ya es el status correcto para una violación de regla de negocio del lado del
  cliente.
- **Caso de uso nuevo** `application/use-cases/buy-streak-freeze.use-case.ts`:
  ```ts
  export class BuyStreakFreezeUseCase {
    constructor(deps: { stats: StatsRepository; now?: () => string });
    execute(userId: string): Promise<StatsSummary>;
  }
  ```
  Lee `stats.findByUser(userId)` (con el mismo `defaultUserStats` de respaldo que usa
  `CompleteLessonUseCase` si el usuario no tiene fila todavía), llama a `buyStreakFreeze({ gems,
  streakFreezes })`. Si `ok: false`, lanza `InsufficientGemsError` o
  `StreakFreezeLimitReachedError` según `reason` — **sin** guardar nada. Si `ok: true`, guarda el
  `UserStats` completo con los `gems`/`streakFreezes` nuevos (el resto de campos sin cambiar) y
  devuelve el `StatsSummary` fresco, con la misma forma que arma `GetStatsUseCase` (mismo cálculo
  de `levelProgress`/`regenerateHearts`/`nextHeartAt` — se puede extraer un helper compartido si
  el duplicado molesta, ver nota de implementación).
- **Endpoint nuevo** `POST /me/streak-freezes` en `StatsController` (mismo controller que ya
  expone `GET /me/stats`, mismo `AuthGuard`): devuelve `200 StatsSummary` en éxito, `400` con
  `{ code, message }` si la compra no procede.

### Frontend (`apps/web`)

- `packages/api-client`: `buyStreakFreeze(): Promise<StatsSummary>`.
- `features/achievements/queries.ts`: `useBuyStreakFreeze()` — mutation que invalida
  `['stats']` en éxito (la `StatsBar` y la propia Tienda se refrescan solas, mismo patrón que
  `completeLesson`).
- `features/achievements/AchievementsPage.tsx`: sección "Tienda" arriba de "Logros", con:
  - Congeladores actuales y gemas actuales (ya vienen de `useStats()`, que la página ya puede
    consumir).
  - Botón `Comprar congelador (10💎)`, deshabilitado con motivo visible
    (`gems < STREAK_FREEZE_PRICE` → "Necesitás 10💎"; `streakFreezes >= MAX_STREAK_FREEZES` →
    "Ya tenés el máximo de congeladores") cuando corresponda. `STREAK_FREEZE_PRICE`/
    `MAX_STREAK_FREEZES` se importan de `@lingoleap/core`, nunca se hardcodean en la web.
  - Si la mutación falla (carrera entre pestañas — el botón ya debería estar deshabilitado, pero
    el servidor es la fuente de verdad), mensaje inline `role="alert"` con el error del backend,
    mismo patrón que `CompletionScreen`.
- `features/stats/StatsBar.tsx`: nuevo `<span className="stats-item" title="Congeladores de
  racha">🧊 {data.streakFreezes}</span>`, junto a los ítems existentes.

## 5. Confianza cliente/servidor

El cliente no envía ningún dato en la compra (`POST /me/streak-freezes` sin body) — el precio,
el tope y el estado actual de gemas/congeladores se leen y validan enteramente en el servidor a
partir de `user_stats`. El botón deshabilitado en la web es solo UX (evita un viaje de red
inútil); el servidor rechaza igual una compra inválida aunque el cliente esté desactualizado o
manipulado.

## 6. Testing

| Capa | Qué cubre |
|---|---|
| `packages/core` — `streak.spec.ts` (extendido) | `buyStreakFreeze`: compra exitosa resta gemas y suma un congelador; rechaza con `insufficient-gems` si `gems < 10`; rechaza con `max-freezes-reached` si `streakFreezes === 2`; caso límite exacto (`gems === 10` compra igual). |
| `apps/api` — `buy-streak-freeze.use-case.spec.ts` (nuevo) | Con `FakeStats`: compra exitosa persiste `gems - 10`/`streakFreezes + 1` y no toca el resto de campos; lanza `InsufficientGemsError` sin llamar a `stats.save` si no alcanzan las gemas; lanza `StreakFreezeLimitReachedError` sin guardar si ya está en el tope. |
| `apps/api` — `stats-api.spec.ts` (extendido, e2e) | `POST /me/streak-freezes` requiere auth; devuelve `200` con el `StatsSummary` actualizado en éxito; devuelve `400` con el `code` correcto cuando la compra se rechaza. |
| `packages/api-client` — `client.spec.ts` (extendido) | `buyStreakFreeze()` envía el token y devuelve el `StatsSummary` (msw). |
| `apps/web` — `AchievementsPage.spec.tsx` (extendido) | La Tienda muestra el precio y el conteo actual; el botón se deshabilita (y explica por qué) sin gemas suficientes o en el tope; un clic exitoso refleja los nuevos valores. |
| `apps/web` — `StatsBar.spec.tsx` (extendido) | Muestra el ítem 🧊 con el conteo de `streakFreezes` del fixture. |

## 7. Fuera de alcance (recordatorio)

Ver §2. La liga semanal sigue siendo un sub-proyecto independiente de la Fase 3B, con su propio
brainstorm pendiente. Con este corte, la Fase 3B original del roadmap
(`docs/superpowers/specs/2026-07-10-lingoleap-design.md`, §13: "Gamificación completa (XP,
rachas, corazones, ligas, logros)") solo tiene pendiente la liga semanal.
