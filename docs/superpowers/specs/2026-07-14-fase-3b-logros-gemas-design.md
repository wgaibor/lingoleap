# Fase 3B (primer corte) — Logros y gemas — Design Spec

> Sub-proyecto de la Fase 3B (`docs/superpowers/specs/2026-07-10-lingoleap-design.md`, §9 y §13).
> La Fase 3B completa incluye además congelador de racha comprable con gemas y liga semanal —
> ambos quedan **fuera de alcance** de este corte, como sub-proyectos independientes a
> brainstormear por separado. Este documento cubre solo: logros y la economía de gemas que
> producen.

## 1. Problema a resolver

Sumar un sistema de logros que le dé sentido al campo `gems` de `user_stats` (existe desde la
Fase 3A pero siempre vale 0, sin ninguna vía para ganarlas). Los logros premian hitos ya
medibles con los datos actuales (racha, lecciones completadas, nivel) sin tocar el modelo de
contenido ni requerir trabajo manual de curaduría.

## 2. Alcance

**Incluye:**
- Catálogo fijo de 8 logros: racha (3/7/30 días), lecciones completadas (10/50/100), nivel
  alcanzado (5/10).
- Otorgar gemas al desbloquear un logro, de forma escalonada por dificultad (5 / 15 / 30 gemas
  según el hito dentro de cada categoría).
- Persistir qué logros ya desbloqueó cada usuario (para no volver a otorgarlos).
- Endpoint para consultar el catálogo + estado de desbloqueo del usuario.
- Aviso en la pantalla de fin de lección cuando se desbloquea un logro nuevo.
- Página "Logros" en la web con los 8 hitos y su estado.

**Explícitamente fuera de alcance de este corte** (quedan para sub-proyectos futuros de la
Fase 3B, cada uno con su propio brainstorm):
- Gastar gemas en comprar un congelador de racha.
- Liga semanal (cohortes, cron, ascenso/descenso).
- Logro de "lección perfecta" (requeriría persistir un contador nuevo que hoy no se guarda);
  puede sumarse después ampliando el catálogo, sin cambiar la arquitectura.
- Editar el catálogo de logros sin deploy (ver §4, decisión de catálogo estático).

## 3. Decisiones técnicas y su porqué

| Decisión | Alternativa considerada | Por qué se eligió |
|---|---|---|
| Catálogo de logros **estático en `packages/core`** (datos puros: id/categoría/umbral/gemas) | Tabla en base de datos con el catálogo, editable sin deploy | Con 8 logros fijos, una tabla de catálogo es sobre-ingeniería: agrega una migración y lógica de lectura que no aporta nada todavía. El mismo patrón que `xp.ts`/`streak.ts`/`hearts.ts` (reglas puras, sin I/O) se mantiene consistente. Si en el futuro hace falta editar montos sin deploy, migrar de estático a tabla es un cambio localizado (una función que hoy lee un array pasaría a leer una tabla). |
| Persistencia de **logros ya desbloqueados** en una tabla `user_achievements` (no un array/jsonb en `user_stats`) | Columna `unlocked_achievements text[]` en `user_stats` | Mismo patrón relacional que `user_progress` (clave primaria compuesta `user_id + achievement_id`), permite RLS de solo-lectura propia sin parsear un array, y es la forma natural de responder "¿qué logros tiene el usuario X" para el endpoint de catálogo. |
| Cálculo de logros nuevos **dentro de `CompleteLessonUseCase`**, no en un caso de uso aparte | Endpoint/cron separado que recalcula logros periódicamente | Los tres datos que activan logros (racha, lecciones completadas, nivel) ya se calculan ahí mismo al completar una lección; evaluar logros en el mismo request evita un segundo viaje a la base de datos y mantiene la regla ya establecida en la Fase 3A ("todo se recalcula en el servidor en el momento de completar"). |
| Gemas escalonadas por dificultad (5/15/30) | Monto fijo por logro | Sensación de progreción creciente (decisión de producto del usuario), sin complejidad técnica adicional — es solo un campo `gems` distinto por entrada del catálogo. |

## 4. Arquitectura

### `packages/core` (nuevo: `logic/achievements.ts`)

```ts
export type AchievementCategory = 'streak' | 'lessons' | 'level';

export interface AchievementDefinition {
  id: string; // 'streak-3' | 'streak-7' | 'streak-30' | 'lessons-10' | ... | 'level-10'
  category: AchievementCategory;
  threshold: number;
  gems: number;
}

export const ACHIEVEMENTS: AchievementDefinition[]; // los 8 logros, fijos

export interface AchievementProgress {
  streakCount: number;
  lessonsCompleted: number;
  level: number;
}

// Devuelve SOLO los logros cuyo umbral ya se cruzó y que NO están en alreadyUnlockedIds.
export function unlockedAchievements(
  progress: AchievementProgress,
  alreadyUnlockedIds: string[]
): AchievementDefinition[];
```

Sin estado, sin reloj, sin I/O — reusable tal cual por el backend y por la futura app móvil.

### Backend (`apps/api`)

- **Migración `supabase/migrations/0004_achievements.sql`**:
  ```sql
  create table if not exists user_achievements (
    user_id uuid not null references auth.users(id) on delete cascade,
    achievement_id text not null,
    unlocked_at timestamptz not null default now(),
    primary key (user_id, achievement_id)
  );
  alter table user_achievements enable row level security;
  create policy "leer logros propios" on user_achievements for select using (auth.uid() = user_id);
  ```
- **Puerto nuevo** `application/ports/achievements.repository.ts`:
  ```ts
  export interface AchievementsRepository {
    listUnlockedIds(userId: string): Promise<string[]>;
    unlock(userId: string, achievementId: string, unlockedAt: string): Promise<void>; // idempotente (upsert / on conflict do nothing)
  }
  ```
  con adaptador `SupabaseAchievementsRepository`.
- **`CompleteLessonUseCase`** (extensión, mismo patrón que la Fase 3A): después de calcular
  `totalXp`, `streak.count` y `hearts` como hoy:
  1. `lessonsCompleted = (await progress.listCompletedLessonIds(userId)).length` (ya incluye la
     lección recién marcada, porque `markLessonCompleted` corre antes en el mismo caso de uso).
  2. `level = levelProgress(totalXp).level`.
  3. `alreadyUnlocked = await achievements.listUnlockedIds(userId)`.
  4. `newlyUnlocked = unlockedAchievements({ streakCount: streak.count, lessonsCompleted, level }, alreadyUnlocked)`.
  5. Si `newlyUnlocked` no está vacío: el `gems` que se persiste en `stats.save(...)` pasa a ser
     `stored.gems + sum(newlyUnlocked.map(a => a.gems))` (se **suma** al total existente, igual
     que `totalXp = stored.xp + xpEarned`) — nunca se reemplaza el total. Después de que
     `stats.save` persista ese nuevo total, se llama `achievements.unlock(userId, a.id, nowIso)`
     por cada logro nuevo (ver nota de idempotencia en §6 sobre qué pasa si esta llamada falla a
     mitad de camino).
  6. `LessonRewards` (de `packages/core`) gana dos campos: `gemsEarned: number` y
     `achievementsUnlocked: AchievementDefinition[]`.
- **Endpoint nuevo** `GET /me/achievements` (`AchievementsController`, mismo patrón que
  `StatsController`): junta `ACHIEVEMENTS` (catálogo estático) con
  `achievements.listUnlockedIds(userId)` y devuelve
  `{ id, category, threshold, gems, unlocked: boolean }[]`.

### Frontend (`apps/web`)

- `packages/api-client`: `getAchievements(): Promise<AchievementStatus[]>`; `completeLesson()`
  no cambia de firma (el `LessonRewards` que ya devuelve trae los campos nuevos).
- `features/achievements/queries.ts` → `useAchievements()` (`queryKey: ['achievements']`).
- `features/achievements/AchievementsPage.tsx` → los 8 logros agrupados por categoría, con
  candado 🔒 (bloqueado) o ✅ + fecha (desbloqueado). Ruta `/achievements`.
- El contador `💎` de `StatsBar` se vuelve un link a `/achievements`.
- `CompletionScreen.tsx`: si `rewards.achievementsUnlocked.length > 0`, un bloque adicional por
  logro nuevo: `🏆 Nuevo logro: {texto en español} (+{gems}💎)`. El mapeo `id → texto` vive en el
  propio componente web (el catálogo de `packages/core` no lleva copy, para no mezclar UI con
  lógica pura — mismo criterio que separa fórmulas de mensajes en toda la Fase 3A).

## 5. Confianza cliente/servidor

Ningún dato nuevo de este corte viene del cliente. Los logros se calculan 100% a partir de
`streakCount`/`lessonsCompleted`/`level`, todos ya derivados server-side de datos persistidos.
El cliente solo lee el resultado (`GET /me/achievements`, `LessonRewards.achievementsUnlocked`)
— no hay ninguna superficie nueva de confianza que abrir.

## 6. Idempotencia

Un reintento del `POST /progress/lessons/:id/complete` (mismo escenario ya analizado en la Fase
3A) no debe otorgar gemas dos veces. Como `markLessonCompleted` ya es la primera escritura (y es
un upsert/no-op si la lección ya estaba marcada), un reintento entero recalcula desde el estado
`stored` actual — si el primer intento ya persistió `stats.gems` y los `user_achievements`
correspondientes, el reintento vuelve a leer `alreadyUnlocked` **ya actualizado** (porque
`achievements.listUnlockedIds` lee de la tabla, no de un valor cacheado en memoria), así que
`unlockedAchievements(...)` no vuelve a devolver esos logros como nuevos. El único caso a
cubrir con un test explícito: el primer intento persiste `stats.gems` pero falla *antes* de
llamar `achievements.unlock` (crash a mitad de camino) — el reintento debe volver a intentar el
`unlock` sin sumar gemas de nuevo. Esto se resuelve leyendo `alreadyUnlocked` **antes** de
sumar gemas y comparando contra el helper puro, nunca sumando "a ciegas" el total de
`newlyUnlocked` sin haber comprobado primero que no estaba ya en `alreadyUnlocked`.

## 7. Testing

| Capa | Qué cubre |
|---|---|
| `packages/core` — `achievements.spec.ts` | Sin mocks: no desbloquea logros ya en `alreadyUnlocked`; desbloquea varios a la vez si el usuario saltó de golpe (ej. nivel 4→10 en una sola lección); no desbloquea "50 lecciones" con 49; devuelve `[]` si no se cruzó ningún umbral. |
| `apps/api` — `complete-lesson.use-case.spec.ts` (extendido) | Con `FakeAchievements` (mismo patrón que `FakeStats`): otorga gemas y persiste el logro al cruzar un umbral; no repite el otorgamiento en una segunda llamada con el mismo estado; `LessonRewards.achievementsUnlocked` trae los logros correctos. |
| `apps/api` — `achievements-api.spec.ts` (nuevo, e2e) | `GET /me/achievements` requiere auth; devuelve los 8 logros con `unlocked` correcto para un usuario con algunos ya desbloqueados. |
| `apps/api` — `supabase-achievements.repository.spec.ts` (nuevo) | Mapeo de filas, `unlock` es idempotente (segunda llamada con el mismo id no rompe). |
| `apps/web` — `AchievementsPage.spec.tsx` (nuevo) | Muestra los 8 logros agrupados, con candado/check según el mock de `useAchievements`. |
| `apps/web` — `LessonPlayerPage.spec.tsx` / `CompletionScreen` (extendido) | El aviso de logro nuevo aparece cuando `completeLesson` devuelve `achievementsUnlocked` no vacío, y no aparece si viene vacío. |

## 8. Fuera de alcance (recordatorio)

Ver §2. El congelador de racha comprable con gemas y la liga semanal son sub-proyectos
independientes de la Fase 3B — cada uno necesita su propio brainstorm antes de planificarse.
