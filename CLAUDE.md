# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

LingoLeap is a Duolingo-style language-learning app (English, Brazilian Portuguese, Italian) built
as a TypeScript monorepo (pnpm workspaces + Turborepo). Its defining constraint: **$0 infrastructure
cost** and **100% dynamically-sourced content** — no hardcoded lessons. A content pipeline composes
lessons offline from open APIs/datasets and persists them to Postgres (Supabase); client apps only
ever talk to `apps/api`, never to external content APIs directly.

Full narrative/rationale for every architectural decision lives in `docs/BITACORA.md` — read the
relevant phase section there before making structural changes; it documents alternatives considered,
real bugs hit, and *why* things are the way they are, in more depth than this file.

## Commands

Requires Node ≥ 22, pnpm ≥ 11 (`packageManager: pnpm@11.1.1`).

```bash
pnpm install
pnpm build                 # turbo run build — all packages/apps, respects dependency graph
pnpm test                  # turbo run test — all packages/apps
pnpm lint                  # eslint . (flat config, root-level, applies repo-wide)

# Run a single package's tests
pnpm --filter @lingoleap/api test
pnpm --filter @lingoleap/web test
pnpm --filter @lingoleap/core test
pnpm --filter @lingoleap/api-client test

# Run a single test file (vitest — run from the package directory, or use --filter with -- passthrough)
pnpm --filter @lingoleap/api test -- src/application/use-cases/complete-lesson.use-case.spec.ts
pnpm --filter @lingoleap/web test -- src/features/stats/StatsBar.spec.tsx

# Backend dev server (requires apps/api/.env — see apps/api/.env.example)
pnpm --filter @lingoleap/api dev

# Content ingestion CLI (populates Postgres from external sources)
pnpm --filter @lingoleap/api ingest --lang en --level A1 --limit 40

# Web dev server (requires apps/web/.env.local — see apps/web/.env.example)
pnpm --filter @lingoleap/web dev
```

Database setup: create a free Supabase project and run, in order, via the SQL Editor:
`supabase/migrations/0001_content.sql`, `0002_progress.sql`, `0003_stats.sql`.

`apps/web/.env.local` needs `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. The
Supabase anon key is safe to expose client-side by design — real security is Postgres Row-Level
Security policies, not key secrecy; the backend uses a separate `service_role` key that is never
exposed to clients (`apps/api/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PEXELS_API_KEY`).

CI (`.github/workflows/ci.yml`) runs on every push/PR to `master`: frozen-lockfile install → lint →
build → test, in that order — match this locally before pushing.

## Architecture

### Backend (`apps/api`) — hexagonal (ports & adapters)

NestJS 11. The domain never depends on frameworks or external services; dependencies point inward.

- `domain/` — entities, factories with invariants (`content.factory.ts`), semantic errors
  (`errors.ts`: `DomainError` subclasses like `CourseNotFoundError`, each with a `code` like
  `COURSE_NOT_FOUND`).
- `application/` — pure TypeScript, no NestJS imports.
  - `ports/` — interfaces the domain depends on (`CourseRepository`, `SentenceProvider`,
    `ImageProvider`, `TranslationProvider`, `VocabularyProvider`, `StatsRepository`,
    `ProgressRepository`, `AuthVerifierPort`).
  - `use-cases/` — one class per operation (`ingest-content`, `get-course`, `get-lesson`,
    `list-courses`, `complete-lesson`, `get-stats`, `get-progress`), constructor-injected with
    port interfaces — tests inject fakes, NestJS injects real adapters (this is the DIP in
    practice).
- `infrastructure/` — adapters implementing the ports.
  - `providers/` — one directory per external source: `frequency-words`, `mymemory`, `tatoeba`,
    `pexels` (see content pipeline below).
  - `auth/supabase-auth.verifier.ts` — verifies Supabase Auth JWTs.
  - `persistence/supabase/` — Postgres adapters + row mappers.
- `presentation/` — REST controllers, `auth.guard.ts` (extracts `userId` from verified JWT, never
  trusts a client-supplied user id), `domain-exception.filter.ts` (maps `DomainError.code` → HTTP
  status + `{ code, message }` JSON body).
- `cli/ingest.cli.ts` — entry point for the content-ingestion pipeline (see below).

### Content pipeline (the core of the project)

Client apps never call external APIs. An offline CLI pipeline composes lessons and persists them;
the API only ever reads from Postgres:

```
FrequencyWords → MyMemory → Tatoeba → Pexels → exercise composition → Supabase (Postgres)
(CEFR-banded      (word        (real         (images)   (4 exercise
 vocabulary)       translation)  sentences)               types)
```

Each provider is a swappable adapter behind a port interface — see `infrastructure/providers/*`.
Exercise composition logic lives in `application/content/exercise-composer.ts`. Four exercise
types: image-select, translate-with-word-bank, listening, match-pairs.

### Frontend (`apps/web`) — React 18 + Vite

Feature-organized, with a hard separation of state kinds — see `docs/BITACORA.md` Fase 2 for the
full rationale:

- **Server state** (`features/*/queries.ts`) — TanStack Query hooks wrapping the
  `@lingoleap/api-client` SDK. Only responsibility: fetch + cache.
- **Session state** (`features/lesson-player/sessionStore.ts`) — zustand store; a thin wrapper
  over pure functions from `packages/core` (`startSession`/`submitAnswer`/`advance`) — the store
  itself computes nothing.
- **Auth state** (`features/auth/AuthProvider.tsx`, `useAuth`, `RequireAuth`) — React Context over
  the Supabase session; `RequireAuth` is the sole component deciding redirect-to-`/login`.
- **Domain logic never lives in components.** Progressive-unlock (`computePathStatus`), the lesson
  state machine, and answer validation are pure functions in `packages/core`, tested without
  rendering anything, reused as-is by the future React Native app.
- Exercise components (`features/lesson-player/exercises/`) receive a shared
  `ExerciseComponentProps<E>` contract and only call `onResolve(correct)` — they know nothing about
  session/store/API. `LessonPlayerPage.tsx` is the sole place wiring exercise ↔ store ↔ API.
- `shared/useSpeech.ts` — browser Web Speech API (TTS), the audio source for both pronunciation and
  the listening exercise; falls back from pre-recorded audio via `.play().catch(() => speak(...))`.

### Shared packages

- `packages/core` — shared domain types/logic, consumed by both `apps/api` and `apps/web` (and the
  future mobile app). Everything here is pure functions with no framework imports; time/clock is
  always an injected parameter (`nowIso`), never `Date.now()` read internally — this is what makes
  gamification logic (`logic/xp.ts`, `logic/streak.ts`, `logic/hearts.ts`) testable without mocking
  time and reusable verbatim on the server.
- `packages/api-client` — typed SDK for the backend; centralizes the `Authorization: Bearer` header
  and translates HTTP errors into `ApiError` carrying the same semantic `code` the backend emits.
- `packages/tokens` — design tokens (colors, radii, spacing) in `tokens.css`. **Hard project rule:
  colors only ever come from tokens, never hardcoded hex in components** — violated once in review
  history and treated as a real defect, not a nitpick (see BITACORA Fase 2, problem #4).

### Gamification (Fase 3A) — client/server trust boundary

`POST /progress/lessons/:id/complete` takes `{ errorCount?, date? }` from the client — neither is
trusted as-is:
- `errorCount` is clamped to `[0, 50]` before touching any formula.
- `date` is only accepted if it matches `/^\d{4}-\d{2}-\d{2}$/`; otherwise the server's own UTC date
  is used. It's the *only* client input with real effect (decides whether a streak extends today
  vs. tomorrow, in the user's timezone) — it cannot affect XP or hearts.
- XP, level, hearts lost, and whether a streak freeze was consumed are **always recomputed
  server-side** from stored `user_stats` + the clamped `errorCount`. The client never asserts "I
  earned 15 XP."
- Heart regeneration is calculated at read time (`regenerateHearts`, compares `hearts_updated_at` to
  now) — there is no cron/background job. `canStartLesson(hearts, lessonAlreadyCompleted)` in
  `packages/core` is the single source of truth for the "no hearts → review-only" rule, used by both
  `CompleteLessonUseCase`/`GetStatsUseCase` on the server and `LessonPlayerPage` on the web.
- Write order in `CompleteLessonUseCase` matters: `markLessonCompleted` happens **before**
  `stats.save` specifically so a failed/retried request never double-awards XP (see BITACORA Fase 3A
  for the full idempotency argument).

## Testing

TDD throughout (RED → GREEN → commit); tests are written before implementation.

| Layer | Strategy |
|---|---|
| `packages/core`, use cases in `apps/api` | Pure unit tests with fakes for ports — no network, no DB |
| Adapters (`apps/api/infrastructure`, `@lingoleap/api-client`) | Integration tests against simulated HTTP responses ([msw](https://mswjs.io/)) using captured real-API fixtures |
| API REST | End-to-end tests with supertest against the real NestJS app (`*-api.spec.ts` in `presentation/`) |
| `apps/web` components | Testing Library + `user-event`, asserting on visible behavior (ARIA roles/text) — never internal implementation |

Notes specific to this repo's test setup:
- `apps/api/vitest.config.ts` and `apps/web/vitest.config.ts` both set `globals: false` — explicit
  imports of `describe`/`it`/`expect` from `vitest` are required, and Testing Library's DOM
  auto-cleanup does **not** register itself; `apps/web/src/test/setup.ts` calls
  `afterEach(cleanup)` explicitly.
- Vitest hoists `vi.mock()` above `const` declarations in the same file — a fixture referenced by a
  mock factory must be declared via `vi.hoisted(() => ({ ... }))`, not a plain `const` above the
  mock call, or you get `ReferenceError: Cannot access '<fixture>' before initialization`.
- `apps/web/vite.config.ts` has `commonjsOptions.include` extended to cover `packages/core` and
  `packages/api-client` — pnpm workspace packages resolve via symlink outside `node_modules`, so
  Vite's default CJS interop misses them without this.

## Domain errors

Backend domain errors extend `DomainError` (`apps/api/src/domain/errors.ts`) with a `code` string
(e.g. `COURSE_NOT_FOUND`). `domain-exception.filter.ts` maps these to HTTP responses shaped
`{ "code": "...", "message": "..." }`. `@lingoleap/api-client` translates these back into typed
`ApiError`s on the frontend, preserving the same `code`. When adding a new failure mode, add a
`DomainError` subclass rather than throwing a generic `Error` or NestJS `HttpException` directly.
