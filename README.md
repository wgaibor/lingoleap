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
pnpm test         # 78 tests (Vitest + msw + supertest + Testing Library)
pnpm lint

# Backend (requiere apps/api/.env — ver apps/api/.env.example)
pnpm --filter @lingoleap/api dev

# Ingesta de contenido (ejemplo: inglés nivel A1, 40 palabras)
pnpm --filter @lingoleap/api ingest --lang en --level A1 --limit 40

# Web (requiere apps/web/.env.local — ver abajo)
pnpm --filter @lingoleap/web dev
```

Para la base de datos: crear un proyecto gratuito en Supabase y ejecutar en orden, en su SQL
Editor, `supabase/migrations/0001_content.sql` y `supabase/migrations/0002_progress.sql`.

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
- [ ] **Fase 3B** — Gemas, congeladores de racha, ligas semanales, logros
- [ ] **Fase 4** — App móvil con React Native + Expo (reusa `packages/core`)
- [ ] **Fase 5** — Portugués e italiano (solo correr el pipeline) + despliegue

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

## Documentación

- [Bitácora de desarrollo](docs/BITACORA.md) — decisiones, arquitectura explicada y guía de entrevista
- [Spec de diseño](docs/superpowers/specs/2026-07-10-lingoleap-design.md)
- [Plan de implementación Fase 1](docs/superpowers/plans/2026-07-10-fase-1-backend-pipeline.md)
- [Plan de implementación Fase 2](docs/superpowers/plans/2026-07-10-fase-2-web-react.md)
