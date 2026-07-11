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
las dependencias siempre apuntan hacia adentro.

```
lingoleap/
├── apps/
│   └── api/                  Backend NestJS 11 — arquitectura hexagonal
│       └── src/
│           ├── domain/           Entidades, factorías con invariantes, errores semánticos
│           ├── application/      Casos de uso + puertos (interfaces). TypeScript puro, sin NestJS
│           │   ├── ports/            CourseRepository, SentenceProvider, ImageProvider…
│           │   └── use-cases/        ingest-content, get-course, get-lesson, list-courses
│           ├── infrastructure/   Adaptadores que implementan los puertos
│           │   ├── providers/        Tatoeba, MyMemory, Pexels, FrequencyWords
│           │   └── persistence/      Supabase (Postgres)
│           └── presentation/     Controllers REST + filtro de errores de dominio
├── packages/
│   └── core/                 Tipos y lógica de dominio compartidos (los usarán web y mobile)
├── supabase/migrations/      Esquema SQL (courses → units → lessons → exercises, con RLS)
└── docs/                     Spec de diseño, plan de implementación y bitácora
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

Los errores de dominio se exponen con códigos semánticos:
`{ "code": "COURSE_NOT_FOUND", "message": "Curso no encontrado: it C2" }` (HTTP 404).

## Desarrollo

Requisitos: Node ≥ 22, pnpm ≥ 11.

```bash
pnpm install
pnpm build        # compila core + api (Turborepo)
pnpm test         # 39 tests (Vitest + msw + supertest)
pnpm lint

# Backend (requiere apps/api/.env — ver apps/api/.env.example)
pnpm --filter @lingoleap/api dev

# Ingesta de contenido (ejemplo: inglés nivel A1, 40 palabras)
pnpm --filter @lingoleap/api ingest --lang en --level A1 --limit 40
```

Para la base de datos: crear un proyecto gratuito en Supabase y ejecutar
`supabase/migrations/0001_content.sql` en su SQL Editor.

## Testing

| Capa | Estrategia |
|---|---|
| Dominio y casos de uso | Unit tests puros con fakes de los puertos (sin red, sin BD) |
| Adaptadores externos | Tests de integración con respuestas HTTP simuladas ([msw](https://mswjs.io/)) y fixtures capturados de las APIs reales |
| API REST | Tests end-to-end con supertest sobre la app NestJS real |
| Desarrollo | TDD: cada función nació de un test que primero falló (RED → GREEN) |

## CI/CD

Cada push ejecuta [GitHub Actions](.github/workflows/ci.yml): instalación con lockfile
congelado → lint → build → tests. El badge de arriba refleja el estado de `master`.

## Roadmap

- [x] **Fase 1** — Monorepo, backend hexagonal, pipeline de ingesta, API REST *(completa)*
- [ ] **Fase 2** — Web en React + Vite: auth, camino del curso, reproductor de lecciones
- [ ] **Fase 3** — Gamificación: XP, rachas, corazones, ligas semanales, logros
- [ ] **Fase 4** — App móvil con React Native + Expo (reusa `packages/core`)
- [ ] **Fase 5** — Portugués e italiano (solo correr el pipeline) + despliegue

## Documentación

- [Bitácora de desarrollo](docs/BITACORA.md) — decisiones, arquitectura explicada y guía de entrevista
- [Spec de diseño](docs/superpowers/specs/2026-07-10-lingoleap-design.md)
- [Plan de implementación Fase 1](docs/superpowers/plans/2026-07-10-fase-1-backend-pipeline.md)
