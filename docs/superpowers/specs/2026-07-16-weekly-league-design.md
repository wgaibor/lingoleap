# Liga semanal — Spec de diseño

> Sub-proyecto de la Fase 3B (el último pendiente). Cierra la gamificación social descrita en el
> spec original (`2026-07-10-lingoleap-design.md`, §Gamificación): cohortes de hasta 30 usuarios,
> divisiones Bronce → Plata → Oro → Diamante, cierre semanal con ascensos y descensos.
> Decisiones tomadas en brainstorm con el usuario el 2026-07-16.

## 1. Objetivo

Que los usuarios compitan por XP semanal en cohortes de su división, con ascensos/descensos al
cerrar la semana y gemas para el podio, visible en una página `/league` y en la `StatsBar`.

## 2. Alcance

- Reglas puras de liga en `packages/core` (semana, divisiones, cierre, recompensas).
- Migración `0005_league.sql` (cohortes + membresías) en Supabase.
- Backend: ingreso/acumulación de XP semanal al completar lección, `GET /me/league`, cierre
  híbrido (cron + perezoso al leer).
- Web: ruta `/league` con la tabla de la cohorte e ítem 🏆 en la `StatsBar`.
- api-client: `getLeague()`.

### Fuera de alcance

- Bots o participantes ficticios para rellenar cohortes.
- Notificaciones del cierre, historial de semanas pasadas en la UI.
- Elegir nombre de usuario (se deriva del email); página de perfil.

## 3. Reglas de dominio (packages/core, funciones puras)

- **Semana**: lunes a domingo en UTC. `weekStartOf(dateIso)` devuelve el lunes (`YYYY-MM-DD`) de
  la semana de cualquier fecha, mismo estilo de fechas que la racha.
- **Divisiones**: `bronze → silver → gold → diamond` (labels en español en la web: Bronce, Plata,
  Oro, Diamante). Todo usuario arranca en Bronce. La división actual se deriva de la última
  membresía cerrada (no se almacena por separado).
- **Ingreso a cohorte**: automático, al ganar XP por primera vez en la semana (completar
  lección). Se asigna a una cohorte activa de su división con < 30 miembros; si no existe, se
  crea una. Sin inscripción manual.
- **Cohorte**: tamaño máximo `LEAGUE_COHORT_SIZE = 30`.
- **Cierre** (`closeLeagueWeek(members)`):
  - Ordena por `weeklyXp` descendente; desempate: `lastXpAt` ascendente (quien llegó antes a ese
    XP queda arriba).
  - Top `LEAGUE_PROMOTE_COUNT = 10` asciende (en Diamante nadie asciende).
  - Últimos `LEAGUE_DEMOTE_COUNT = 5` descienden (en Bronce nadie desciende).
  - En cohortes chicas donde las zonas se solapan (< 15 miembros): se aplica primero el ascenso
    y solo desciende quien no ascendió.
  - Podio: 1º +20💎, 2º +10💎, 3º +5💎 (`LEAGUE_PODIUM_GEMS = [20, 10, 5]`), acreditadas sobre
    `user_stats.gems`.
  - Devuelve por miembro: `result` (`promoted | demoted | stayed`) y `gemsAwarded`.

Constantes definidas una sola vez en `packages/core`, nunca hardcodeadas en backend ni web.

## 4. Datos (migración `0005_league.sql`)

- `league_cohorts`: `id uuid pk`, `division text`, `week_start date`, `closed_at timestamptz null`
  (null = semana activa).
- `league_memberships`: `cohort_id fk`, `user_id uuid`, `display_name text` (derivado del email
  al ingresar, parte antes de la `@`), `weekly_xp int`, `last_xp_at timestamptz`,
  `result text null` (se rellena al cierre), único `(cohort_id, user_id)`.
- RLS de solo lectura para el usuario autenticado (como `user_stats`); el API escribe con
  `service_role`.

## 5. Backend

- Puerto nuevo `LeagueRepository` (application/ports) + adaptador Supabase
  (infrastructure/persistence/supabase), siguiendo el patrón hexagonal existente.
- `CompleteLessonUseCase`: tras `stats.save`, suma el `xpEarned` a la membresía semanal del
  usuario (creándola —y su cohorte si hace falta— si es la primera lección de la semana). Igual
  que con los logros, un fallo aquí no revierte la lección (mismo trade-off de idempotencia ya
  documentado en la BITACORA).
- `GetLeagueUseCase` / `GET /me/league` (con `AuthGuard`): devuelve
  `{ division, cohort: { weekStart, standings: [{ position, displayName, weeklyXp, isMe, zone }] } | null }`
  — `null` cuando el usuario aún no ganó XP esta semana. `zone` marca ascenso/descenso/neutral.
- **Cierre híbrido**:
  - Una cohorte está **vencida** cuando la fecha UTC actual es ≥ `week_start + 7 días`.
  - `CloseLeagueWeekUseCase`: cierra todas las cohortes con `week_start` vencida y
    `closed_at IS NULL` — aplica `closeLeagueWeek`, persiste `result`, acredita gemas del podio
    y marca `closed_at`. `closed_at` hace el cierre idempotente si compiten los dos disparadores.
  - Disparador 1: `LeagueSchedulerService` con `@nestjs/schedule`, cron lunes 00:05 UTC.
  - Disparador 2 (fallback perezoso): `GetLeagueUseCase` verifica al leer si la cohorte del
    usuario venció y ejecuta el cierre en ese momento, antes de responder.
- Reloj siempre inyectado (`now?: () => string`), como el resto de la gamificación.

## 6. Web

- Ruta nueva `/league` bajo `RequireAuth`: título con la división actual, tabla de la cohorte
  (posición, nombre, XP semanal), fila propia resaltada, zonas de ascenso/descenso marcadas con
  colores de `@lingoleap/tokens`. Estado vacío: "Completá una lección para entrar a la liga."
- `StatsBar`: ítem 🏆 con la división actual (label en español), enlaza a `/league`.
- `useLeague()` (TanStack Query) sobre `api.getLeague()`; sin estado local de liga en
  componentes. Copy de UI en español.

## 7. Testing (TDD en todas las capas)

- `packages/core`: cierre con cohorte llena, cohorte chica con zonas solapadas, bordes Bronce /
  Diamante, desempate por `lastXpAt`, `weekStartOf` con cambio de mes/año.
- Backend: casos de uso con fakes del puerto; e2e supertest de `GET /me/league` incluyendo el
  cierre perezoso (cohorte vencida sembrada → la respuesta ya viene cerrada y con gemas
  acreditadas). El cron se testea invocando el servicio directamente.
- api-client: msw. Web: Testing Library sobre comportamiento visible (tabla, resaltado, estado
  vacío).

## 8. Decisiones y porqués

1. **Cohortes de 30 fiel al spec** (no cohorte global): mantiene el diseño original de la app
   aunque hoy haya pocos usuarios reales; la cohorte casi vacía es aceptable para la demo.
2. **Cierre híbrido cron + perezoso**: el cron (`@nestjs/schedule`) honra el spec original, pero
   con $0 de infraestructura el proceso no está vivo 24/7 — el fallback perezoso al leer
   garantiza que ninguna cohorte quede vencida indefinidamente. Una sola función de cierre,
   dos disparadores, idempotente vía `closed_at`.
3. **Gemas al top 3 (20/10/5)**: le da propósito económico a la liga reutilizando la moneda
   existente (que ya se gasta en congeladores), sin inflar la economía con premios masivos.
4. **División derivada, no almacenada**: evita una columna más en `user_stats` y la posibilidad
   de desincronizarla; Bronce es el default de quien nunca jugó.
5. **`display_name` congelado al ingresar**: la tabla se lee sin joins contra Auth y sin exponer
   emails completos de otros usuarios.
