# LingoLeap 🦉

[![CI](https://github.com/wgaibor/lingoleap/actions/workflows/ci.yml/badge.svg)](https://github.com/wgaibor/lingoleap/actions/workflows/ci.yml)

Aplicación de aprendizaje de idiomas estilo Duolingo (inglés, portugués brasileño e italiano)
con **contenido 100% dinámico** extraído de APIs y datasets abiertos — nada de contenido
quemado en el código — y **costo $0 de infraestructura** (planes gratuitos de Supabase,
Render y Vercel).

> 📓 ¿Cómo se construyó y por qué cada decisión? Ver la [Bitácora de desarrollo](docs/BITACORA.md).

## Arquitectura

Monorepo TypeScript (pnpm workspaces + Turborepo). El backend aplica **arquitectura
hexagonal** (puertos y adaptadores): el dominio no conoce frameworks ni servicios externos;
las dependencias siempre apuntan hacia adentro. El frontend web es **React idiomático**
(TanStack Query para estado de servidor, zustand para estado de sesión) que reutiliza la
lógica de dominio compartida en `packages/core` — la misma que usará la futura app móvil.

```
lingoleap/
├── apps/
│   ├── api/                   Backend NestJS 11 — arquitectura hexagonal
│   │   └── src/
│   │       ├── domain/            Entidades, factorías con invariantes, errores semánticos
│   │       ├── application/       Casos de uso + puertos (interfaces). TypeScript puro, sin NestJS
│   │       │   ├── ports/             CourseRepository, SentenceProvider, ImageProvider…
│   │       │   └── use-cases/         ingest-content, get-course, get-lesson, list-courses…
│   │       ├── infrastructure/    Adaptadores que implementan los puertos
│   │       │   ├── providers/         Tatoeba, MyMemory, Pexels, FrequencyWords
│   │       │   ├── auth/              SupabaseAuthVerifier (verifica tokens de Supabase Auth)
│   │       │   └── persistence/       Supabase (Postgres)
│   │       └── presentation/      Controllers REST + guard de auth + filtro de errores
│   └── web/                   Frontend React 18 + Vite — auth, camino del curso, reproductor
│       └── src/
│           ├── app/                Providers (Query, Router), cliente Supabase, cliente API
│           ├── features/
│           │   ├── auth/               AuthProvider/useAuth, LoginPage, RequireAuth
│           │   ├── course-path/        Queries de curso/progreso, camino de lecciones
│           │   └── lesson-player/      sessionStore (zustand), reproductor, 4 tipos de ejercicio
│           └── shared/              Hook useSpeech (TTS del navegador)
├── packages/
│   ├── core/                  Tipos y lógica de dominio compartidos (desbloqueo progresivo,
│   │                          validación de respuestas, máquina de estados de sesión)
│   ├── tokens/                Design tokens (colores, radios, espaciados) — única fuente de estilos
│   └── api-client/            SDK tipado del backend (maneja token y errores semánticos)
├── supabase/migrations/       Esquema SQL (courses → units → lessons → exercises, progreso, con RLS)
└── docs/                      Spec de diseño, planes de implementación y bitácora
```

### Pipeline de contenido (el corazón del proyecto)

Las apps cliente **nunca** llaman APIs externas. Un pipeline de ingesta (CLI) compone las
lecciones offline y las persiste en Postgres; la API sirve desde la BD:

```
FrequencyWords ──► MyMemory ──► Tatoeba ──► Pexels ──► Composición de ──► Supabase
(qué palabras     (traducción   (oraciones  (imágenes)  ejercicios         (Postgres)
 enseñar, por      al español)   reales con              (4 tipos)
 nivel CEFR)                     traducción)
```

| Fuente | Uso | Costo |
|---|---|---|
| [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (OpenSubtitles) | Vocabulario ordenado por frecuencia, bandas por nivel CEFR (A1–C2) | Gratis, open data |
| [Tatoeba API](https://api.tatoeba.org/) | Oraciones reales con traducción al español (licencia CC) | Gratis |
| [MyMemory API](https://mymemory.translated.net/) | Traducción de palabras sueltas | Gratis |
| [Pexels API](https://www.pexels.com/api/) | Imágenes para ejercicios de vocabulario | Gratis |
| Web Speech API / expo-speech | Audio TTS generado en el dispositivo del usuario | Gratis |

**Tipos de ejercicio**: selección con imagen · traducir con banco de palabras · escucha · parejas.

## API REST

| Endpoint | Descripción |
|---|---|
| `GET /health` | Health check |
| `GET /courses` | Lista de cursos disponibles |
| `GET /courses/:language/:level` | Camino completo del curso (unidades → lecciones) |
| `GET /lessons/:id` | Lección con sus ejercicios |
| `POST /progress/lessons/:lessonId/complete` | Marca una lección completada *(requiere `Authorization: Bearer <token>` de Supabase)* |
| `GET /progress/lessons` | Ids de lecciones completadas del usuario autenticado *(requiere token)* |

Los errores de dominio se exponen con códigos semánticos:
`{ "code": "COURSE_NOT_FOUND", "message": "Curso no encontrado: it C2" }` (HTTP 404).

## Desarrollo

Requisitos: Node ≥ 22, pnpm ≥ 11.

```bash
pnpm install
pnpm build        # compila todos los paquetes y apps (Turborepo)
pnpm test         # 204 tests (Vitest + msw + supertest + Testing Library)
pnpm lint

# Backend (requiere apps/api/.env — ver apps/api/.env.example)
pnpm --filter @lingoleap/api dev

# Ingesta de contenido (ejemplo: inglés nivel A1, 40 palabras)
pnpm --filter @lingoleap/api ingest --lang en --level A1 --limit 40

# Web (requiere apps/web/.env.local — ver abajo)
pnpm --filter @lingoleap/web dev
```

Para la base de datos: crear un proyecto gratuito en Supabase y ejecutar en orden, en su SQL
Editor, `supabase/migrations/0001_content.sql`, `supabase/migrations/0002_progress.sql`,
`supabase/migrations/0003_stats.sql`, `supabase/migrations/0004_achievements.sql` y
`supabase/migrations/0005_league.sql`.

### Variables de entorno de la web

`apps/web/.env.local` (ver `apps/web/.env.example`):

```bash
VITE_API_URL=http://localhost:3000
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

La `ANON_KEY` es pública **por diseño**: es la clave que usa cualquier cliente del navegador
para hablar con Supabase, y la seguridad real la dan las políticas de **Row-Level Security**
(RLS) en Postgres, no el secreto de la clave — por eso el backend usa una clave distinta
(`service_role`) que nunca se expone al cliente.

## Testing

| Capa | Estrategia |
|---|---|
| Dominio y casos de uso (`packages/core`, `apps/api`) | Unit tests puros con fakes de los puertos (sin red, sin BD) |
| Adaptadores externos (`apps/api`, `@lingoleap/api-client`) | Tests de integración con respuestas HTTP simuladas ([msw](https://mswjs.io/)) y fixtures capturados de las APIs reales |
| API REST | Tests end-to-end con supertest sobre la app NestJS real |
| Componentes web (`apps/web`) | [Testing Library](https://testing-library.com/) + `user-event` sobre comportamiento visible (roles ARIA, texto), nunca implementación interna |
| Desarrollo | TDD: cada función nació de un test que primero falló (RED → GREEN) |

## CI/CD

Cada push ejecuta [GitHub Actions](.github/workflows/ci.yml): instalación con lockfile
congelado → lint → build → tests. El badge de arriba refleja el estado de `master`.

## Roadmap

- [x] **Fase 1** — Monorepo, backend hexagonal, pipeline de ingesta, API REST *(completa)*
- [x] **Fase 2** — Web en React + Vite: auth, camino del curso, reproductor de lecciones *(completa)*
- [ ] **Fase 3A** — Gamificación: XP, niveles, racha diaria y corazones *(smoke real completo — falta merge a master)*
- [ ] **Fase 3B** — Gemas, congeladores de racha, ligas semanales, logros *(logros, gemas,
      congelador comprable y liga semanal completos — falta el merge a master)*
- [x] **Fase 4A** — Esqueleto de app móvil con Expo Router: auth, lista de cursos, camino de
      lecciones con desbloqueo progresivo, `StatsBar` *(completa)*
- [x] **Fase 4B** — Reproductor de lecciones móvil: 4 tipos de ejercicio, TTS con
      `expo-speech`, guarda de corazones, guardado de progreso *(completa)*
- [ ] **Fase 5** — Portugués e italiano (solo correr el pipeline) + despliegue *(mitad 1
      completa: 3 cursos A1 en la base — inglés, portugués brasileño e italiano, 101 lecciones —
      falta el despliegue)*

## Gamificación (Fase 3A)

Cada lección completada llama a `POST /progress/lessons/:id/complete` con `errorCount` y la
fecha local del cliente; el servidor recalcula todo desde cero (nunca confía en XP/corazones
que mandara el cliente) y devuelve las recompensas. `GET /me/stats` expone el resumen (XP,
nivel, racha, corazones, gemas) — lo consume la `StatsBar` de la web.

| Regla | Fórmula |
|---|---|
| **XP por lección** | `clamp(15 − errores, 10, 15)` — entre 10 y 15 XP, sin importar cuántos errores |
| **Nivel** | XP acumulado necesario para el nivel *n*: `100 · (2^(n−1) − 1)` (curva exponencial: nivel 2 a los 100 XP, nivel 3 a los 300, nivel 4 a los 700…) |
| **Racha diaria** | Se extiende si la lección de hoy es consecutiva a la de ayer; si se salta un día pero quedan congeladores (`streak_freezes`) disponibles, consume uno y la racha sigue viva; si no, se reinicia en 1 |
| **Corazones** | Máximo 5, −1 por cada error (mínimo 0), +1 cada 4 horas — calculado *al leer* (sin cron ni job en background); sin corazones solo se pueden abrir lecciones ya completadas (repaso) |

## Logros y gemas (Fase 3B, primer corte)

Al completar una lección, el servidor evalúa si el usuario acaba de cruzar el umbral de algún
logro (racha, lecciones completadas o nivel) y le otorga sus gemas — `GET /me/achievements`
expone los 8 logros del catálogo (`packages/core/src/logic/achievements.ts`), desbloqueados o
no, y la web los muestra en `/achievements` agrupados por categoría, con un aviso extra en la
pantalla de fin de lección cuando se desbloquea uno nuevo.

| Logro | Categoría | Umbral | Gemas |
|---|---|---|---|
| Racha de 3 días | Racha | 3 días | 💎 5 |
| Racha de 7 días | Racha | 7 días | 💎 15 |
| Racha de 30 días | Racha | 30 días | 💎 30 |
| 10 lecciones completadas | Lecciones | 10 lecciones | 💎 5 |
| 50 lecciones completadas | Lecciones | 50 lecciones | 💎 15 |
| 100 lecciones completadas | Lecciones | 100 lecciones | 💎 30 |
| Nivel 5 alcanzado | Nivel | nivel 5 | 💎 5 |
| Nivel 10 alcanzado | Nivel | nivel 10 | 💎 15 |

Las gemas se gastan en la **Tienda** de `/achievements`: un congelador de racha cuesta 10💎
(tope de 2 acumulados, `STREAK_FREEZE_PRICE`/`MAX_STREAK_FREEZES` en `packages/core`). La
compra va por `POST /me/streak-freezes` sin body — precio y tope se validan y descuentan
siempre en el servidor — y la `StatsBar` muestra el conteo 🧊 junto a las gemas.

## Liga semanal (Fase 3B)

Cada usuario que gana XP por primera vez en la semana (lunes a domingo UTC) entra automáticamente
a una cohorte de hasta 30 miembros de su división — sin inscripción manual. Divisiones
`Bronce → Plata → Oro → Diamante`; la división actual se deriva de la última membresía cerrada, no
se almacena aparte. `GET /me/league` la expone y la web la muestra en `/league` y con un ítem 🏆 en
la `StatsBar`.

Al cierre de la semana (`closeLeagueWeek` en `packages/core`): ordena por XP semanal (desempate por
quién llegó antes a ese XP), asciende el top 10, desciende los últimos 5 (con solape resuelto en
cohortes chicas), y acredita gemas al podio (🥇 20💎, 🥈 10💎, 🥉 5💎). El cierre es **híbrido**:
un cron semanal (`LeagueSchedulerService`, lunes 00:05 UTC) y un disparador perezoso dentro de
`GET /me/league` que cierra cualquier cohorte vencida antes de responder — necesario porque, con
$0 de infraestructura, el proceso no está vivo 24/7. `closed_at` hace que ambos disparadores sean
idempotentes entre sí.

## App móvil (Fase 4A + 4B)

`apps/mobile` es un cliente Expo + Expo Router que reusa `packages/core` y
`@lingoleap/api-client` tal cual la web: auth con Supabase, lista de cursos, camino de
lecciones con desbloqueo progresivo y `StatsBar`. El reproductor de lecciones ya no es un
placeholder: implementa los 4 tipos de ejercicio (selección con imagen, traducir con banco de
palabras, escucha, parejas), TTS con `expo-speech` (sin audio pregrabado, igual que la web),
guarda de corazones al entrar y guardado de progreso/stats al completar.

```bash
# apps/mobile/.env (ver apps/mobile/.env.example) — usar la IP LAN de la PC que corre la API,
# no localhost, para que el teléfono la alcance en la misma WiFi
EXPO_PUBLIC_API_URL=http://192.168.0.10:3000
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...

pnpm --filter @lingoleap/mobile dev   # abre Metro; escanear el QR con Expo Go
```

## Documentación

- [Bitácora de desarrollo](docs/BITACORA.md) — decisiones, arquitectura explicada y guía de entrevista
- [Spec de diseño](docs/superpowers/specs/2026-07-10-lingoleap-design.md)
- [Plan de implementación Fase 1](docs/superpowers/plans/2026-07-10-fase-1-backend-pipeline.md)
- [Plan de implementación Fase 2](docs/superpowers/plans/2026-07-10-fase-2-web-react.md)
