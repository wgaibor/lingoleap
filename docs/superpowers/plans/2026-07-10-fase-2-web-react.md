# LingoLeap Fase 2 — Plan de implementación (progreso + auth backend, web React)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App web en React (Vite) con login (email + Google vía Supabase Auth), camino del curso con desbloqueo progresivo, y reproductor de lecciones con los 4 tipos de ejercicio y audio TTS — respaldada por endpoints de progreso autenticados en la API.

**Architecture:** El backend gana una vertical de progreso (puerto `AuthVerifier` + `ProgressRepository`, casos de uso, guard y endpoints REST) siguiendo la hexagonal existente. La lógica de sesión de lección, validación de respuestas y desbloqueo del camino vive en `packages/core` (TypeScript puro, TDD) para reusarla en mobile (Fase 4). La web consume la API solo a través de `packages/api-client` (SDK tipado) y comparte la temática visual vía `packages/tokens`.

**Tech Stack:** React 18 + Vite 6 + TypeScript strict, react-router-dom 6, TanStack Query 5, Zustand 5, @supabase/supabase-js 2 (auth), Vitest + Testing Library + jsdom + msw. Backend: NestJS 11 existente.

## Global Constraints

- TypeScript `strict: true`; prohibido `any` explícito. Copy de UI y mensajes de error en español.
- Regla de capas API: `domain/` puro; `application/` solo domain+core; `infrastructure/` implementa puertos; `presentation/` solo llama casos de uso. Clases de application/infrastructure sin decoradores NestJS (wiring por `useFactory`).
- La web NUNCA llama `fetch` directo ni APIs externas de contenido: todo pasa por `@lingoleap/api-client`; auth por `@supabase/supabase-js`.
- Colores/espaciados solo desde `@lingoleap/tokens` (verde `#58CC02`, rojo `#FF4B4B`, azul `#1CB0F6`, amarillo `#FFC800`).
- Códigos de idioma exactos: `en`, `pt-BR`, `it`. TDD en `packages/core` y backend; componentes web con tests de Testing Library.
- Commits convencionales al final de cada tarea + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- pnpm 11; monorepo existente en `lingoleap/` (rama de trabajo nueva sobre `master`).
- Claves solo en `.env`/`.env.local` (git-ignorados). La `anon key` de Supabase SÍ puede ir en el cliente web (es pública por diseño; RLS protege los datos).
- Fuera de alcance (plan de hardening pre-deploy): RPC transaccional `replace_course`, split de claves del API (anon vs service role), throttling del pipeline.

---

### Task 1: Migración de progreso + puerto y adaptador AuthVerifier

**Files:**
- Create: `supabase/migrations/0002_progress.sql`, `apps/api/src/application/ports/auth-verifier.port.ts`, `apps/api/src/infrastructure/auth/supabase-auth.verifier.ts`
- Test: `apps/api/src/infrastructure/auth/supabase-auth.verifier.spec.ts`

**Interfaces:**
- Consumes: `SUPABASE_CLIENT` factory existente.
- Produces:
```ts
// auth-verifier.port.ts
export interface AuthenticatedUser { id: string; email: string | null }
export interface AuthVerifier {
  verifyToken(accessToken: string): Promise<AuthenticatedUser | null>;
}
export const AUTH_VERIFIER = Symbol('AuthVerifier');
```
- `class SupabaseAuthVerifier implements AuthVerifier { constructor(client: SupabaseClient) }` — usa `client.auth.getUser(accessToken)`; si `error` o sin user → `null`.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/0002_progress.sql`:
```sql
create table if not exists user_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table user_progress enable row level security;

create policy "leer progreso propio" on user_progress
  for select using (auth.uid() = user_id);
create policy "insertar progreso propio" on user_progress
  for insert with check (auth.uid() = user_id);
```
(El API usa la service role key — bypassa RLS — y garantiza la propiedad por código con el userId del token verificado; las políticas quedan listas para acceso directo desde clientes en el futuro.)

- [ ] **Step 2: Crear el puerto** con el código exacto del bloque Interfaces.

- [ ] **Step 3: Test que falla para el adaptador**

`apps/api/src/infrastructure/auth/supabase-auth.verifier.spec.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAuthVerifier } from './supabase-auth.verifier';

function clientWith(response: { data: { user: { id: string; email?: string } | null }; error: { message: string } | null }): SupabaseClient {
  return { auth: { getUser: vi.fn().mockResolvedValue(response) } } as unknown as SupabaseClient;
}

describe('SupabaseAuthVerifier', () => {
  it('devuelve el usuario cuando el token es válido', async () => {
    const verifier = new SupabaseAuthVerifier(
      clientWith({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null })
    );
    await expect(verifier.verifyToken('tok')).resolves.toEqual({ id: 'u1', email: 'a@b.com' });
  });

  it('devuelve null con token inválido', async () => {
    const verifier = new SupabaseAuthVerifier(
      clientWith({ data: { user: null }, error: { message: 'invalid JWT' } })
    );
    await expect(verifier.verifyToken('bad')).resolves.toBeNull();
  });
});
```

Run: `pnpm --filter @lingoleap/api test` — Expected: FAIL (módulo no existe).

- [ ] **Step 4: Implementar el adaptador**

`apps/api/src/infrastructure/auth/supabase-auth.verifier.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthenticatedUser, AuthVerifier } from '../../application/ports/auth-verifier.port';

export class SupabaseAuthVerifier implements AuthVerifier {
  constructor(private readonly client: SupabaseClient) {}

  async verifyToken(accessToken: string): Promise<AuthenticatedUser | null> {
    const { data, error } = await this.client.auth.getUser(accessToken);
    if (error || !data.user) {
      return null;
    }
    return { id: data.user.id, email: data.user.email ?? null };
  }
}
```

- [ ] **Step 5: Verificar y commitear**

Run: `pnpm --filter @lingoleap/api test` — Expected: PASS.

```bash
git add -A
git commit -m "feat(api): migración de progreso y verificador de tokens de Supabase Auth"
```

---

### Task 2: Puerto ProgressRepository + adaptador + casos de uso de progreso

**Files:**
- Create: `apps/api/src/application/ports/progress.repository.ts`, `apps/api/src/infrastructure/persistence/supabase/supabase-progress.repository.ts`, `apps/api/src/application/use-cases/complete-lesson.use-case.ts`, `apps/api/src/application/use-cases/get-progress.use-case.ts`
- Test: `apps/api/src/application/use-cases/complete-lesson.use-case.spec.ts`

**Interfaces:**
- Consumes: `CourseRepository` (para validar que la lección existe), `LessonNotFoundError`.
- Produces:
```ts
// progress.repository.ts
export interface ProgressRepository {
  markLessonCompleted(userId: string, lessonId: string): Promise<void>;
  listCompletedLessonIds(userId: string): Promise<string[]>;
}
export const PROGRESS_REPOSITORY = Symbol('ProgressRepository');

// complete-lesson.use-case.ts
export class CompleteLessonUseCase {
  constructor(deps: { courses: CourseRepository; progress: ProgressRepository });
  execute(userId: string, lessonId: string): Promise<void>; // LessonNotFoundError si no existe
}

// get-progress.use-case.ts
export class GetProgressUseCase {
  constructor(progress: ProgressRepository);
  execute(userId: string): Promise<string[]>;
}
```

- [ ] **Step 1: Test que falla**

`apps/api/src/application/use-cases/complete-lesson.use-case.spec.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Lesson } from '@lingoleap/core';
import type { CourseRepository } from '../ports/course.repository';
import type { ProgressRepository } from '../ports/progress.repository';
import { LessonNotFoundError } from '../../domain/errors';
import { CompleteLessonUseCase } from './complete-lesson.use-case';
import { GetProgressUseCase } from './get-progress.use-case';

const lesson: Lesson = { id: 'l1', title: 'Lección 1', position: 1, exercises: [
  { id: 'e1', type: 'match-pairs', pairs: [{ left: 'water', right: 'agua' }] }
] };

class FakeCourses implements CourseRepository {
  async saveCourse(): Promise<void> {}
  async findByLanguageAndLevel(): Promise<null> { return null; }
  async listSummaries(): Promise<[]> { return []; }
  async findLessonById(id: string): Promise<Lesson | null> { return id === 'l1' ? lesson : null; }
}

class FakeProgress implements ProgressRepository {
  completed: Array<{ userId: string; lessonId: string }> = [];
  async markLessonCompleted(userId: string, lessonId: string): Promise<void> {
    this.completed.push({ userId, lessonId });
  }
  async listCompletedLessonIds(userId: string): Promise<string[]> {
    return this.completed.filter((c) => c.userId === userId).map((c) => c.lessonId);
  }
}

describe('CompleteLessonUseCase', () => {
  it('registra la lección completada para el usuario', async () => {
    const progress = new FakeProgress();
    const useCase = new CompleteLessonUseCase({ courses: new FakeCourses(), progress });
    await useCase.execute('u1', 'l1');
    expect(progress.completed).toEqual([{ userId: 'u1', lessonId: 'l1' }]);
  });

  it('lanza LessonNotFoundError si la lección no existe', async () => {
    const useCase = new CompleteLessonUseCase({ courses: new FakeCourses(), progress: new FakeProgress() });
    await expect(useCase.execute('u1', 'nope')).rejects.toThrow(LessonNotFoundError);
  });
});

describe('GetProgressUseCase', () => {
  it('devuelve los ids completados del usuario', async () => {
    const progress = new FakeProgress();
    await progress.markLessonCompleted('u1', 'l1');
    await progress.markLessonCompleted('u2', 'l9');
    const useCase = new GetProgressUseCase(progress);
    await expect(useCase.execute('u1')).resolves.toEqual(['l1']);
  });
});
```

Run: `pnpm --filter @lingoleap/api test` — Expected: FAIL.

- [ ] **Step 2: Implementar puerto, casos de uso y adaptador**

`apps/api/src/application/ports/progress.repository.ts`: código exacto del bloque Interfaces.

`apps/api/src/application/use-cases/complete-lesson.use-case.ts`:
```ts
import { LessonNotFoundError } from '../../domain/errors';
import type { CourseRepository } from '../ports/course.repository';
import type { ProgressRepository } from '../ports/progress.repository';

export class CompleteLessonUseCase {
  constructor(private readonly deps: { courses: CourseRepository; progress: ProgressRepository }) {}

  async execute(userId: string, lessonId: string): Promise<void> {
    const lesson = await this.deps.courses.findLessonById(lessonId);
    if (lesson === null) {
      throw new LessonNotFoundError(lessonId);
    }
    await this.deps.progress.markLessonCompleted(userId, lessonId);
  }
}
```

`apps/api/src/application/use-cases/get-progress.use-case.ts`:
```ts
import type { ProgressRepository } from '../ports/progress.repository';

export class GetProgressUseCase {
  constructor(private readonly progress: ProgressRepository) {}

  execute(userId: string): Promise<string[]> {
    return this.progress.listCompletedLessonIds(userId);
  }
}
```

`apps/api/src/infrastructure/persistence/supabase/supabase-progress.repository.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProgressRepository } from '../../../application/ports/progress.repository';

export class SupabaseProgressRepository implements ProgressRepository {
  constructor(private readonly client: SupabaseClient) {}

  async markLessonCompleted(userId: string, lessonId: string): Promise<void> {
    const { error } = await this.client
      .from('user_progress')
      .upsert({ user_id: userId, lesson_id: lessonId }, { onConflict: 'user_id,lesson_id', ignoreDuplicates: true });
    if (error) {
      throw new Error(`Supabase upsert progreso falló: ${error.message}`);
    }
  }

  async listCompletedLessonIds(userId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from('user_progress')
      .select('lesson_id')
      .eq('user_id', userId);
    if (error) {
      throw new Error(`Supabase select progreso falló: ${error.message}`);
    }
    return (data ?? []).map((row) => (row as { lesson_id: string }).lesson_id);
  }
}
```

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm --filter @lingoleap/api test` — Expected: PASS.

```bash
git add -A
git commit -m "feat(api): repositorio y casos de uso de progreso de lecciones"
```

---

### Task 3: Guard de auth + endpoints de progreso + wiring

**Files:**
- Create: `apps/api/src/presentation/auth.guard.ts`, `apps/api/src/presentation/progress.controller.ts`
- Modify: `apps/api/src/infrastructure/ingest.module.ts` (exportar también `SUPABASE_CLIENT`), `apps/api/src/presentation/content-api.module.ts` (providers nuevos + controller)
- Test: `apps/api/src/presentation/progress-api.spec.ts`

**Interfaces:**
- Produces:
  - `POST /progress/lessons/:lessonId/complete` (Bearer token) → 201 `{ "completed": true }`; 401 `{ code: 'UNAUTHORIZED' }` sin token válido; 404 si la lección no existe.
  - `GET /progress/lessons` (Bearer token) → `{ "lessonIds": string[] }`.
  - `AuthGuard` (Nest `CanActivate`): lee `Authorization: Bearer <token>`, usa `AUTH_VERIFIER`, adjunta `request.user: AuthenticatedUser`; lanza `UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Token requerido o inválido' })`.

- [ ] **Step 1: Test que falla (supertest con fakes)**

`apps/api/src/presentation/progress-api.spec.ts`:
```ts
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedUser, AuthVerifier } from '../application/ports/auth-verifier.port';
import { AUTH_VERIFIER } from '../application/ports/auth-verifier.port';
import type { ProgressRepository } from '../application/ports/progress.repository';
import { PROGRESS_REPOSITORY } from '../application/ports/progress.repository';
import { COURSE_REPOSITORY, type CourseRepository } from '../application/ports/course.repository';
import type { Lesson } from '@lingoleap/core';
import { ContentApiModule } from './content-api.module';
import { DomainExceptionFilter } from './domain-exception.filter';

const lesson: Lesson = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', title: 'L1', position: 1, exercises: [
  { id: 'e1', type: 'match-pairs', pairs: [{ left: 'water', right: 'agua' }] }
] };

class FakeVerifier implements AuthVerifier {
  async verifyToken(token: string): Promise<AuthenticatedUser | null> {
    return token === 'valid-token' ? { id: 'user-1', email: 'a@b.com' } : null;
  }
}

class FakeProgress implements ProgressRepository {
  saved: string[] = [];
  async markLessonCompleted(_userId: string, lessonId: string): Promise<void> { this.saved.push(lessonId); }
  async listCompletedLessonIds(): Promise<string[]> { return this.saved; }
}

class FakeCourses implements CourseRepository {
  async saveCourse(): Promise<void> {}
  async findByLanguageAndLevel(): Promise<null> { return null; }
  async listSummaries(): Promise<[]> { return []; }
  async findLessonById(id: string): Promise<Lesson | null> { return id === lesson.id ? lesson : null; }
}

describe('API de progreso', () => {
  let app: INestApplication;
  const progress = new FakeProgress();

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
    process.env.PEXELS_API_KEY = 'stub';
    const moduleRef = await Test.createTestingModule({ imports: [ContentApiModule] })
      .overrideProvider(AUTH_VERIFIER).useValue(new FakeVerifier())
      .overrideProvider(PROGRESS_REPOSITORY).useValue(progress)
      .overrideProvider(COURSE_REPOSITORY).useValue(new FakeCourses())
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('rechaza sin token', async () => {
    const res = await request(app.getHttpServer())
      .post(`/progress/lessons/${lesson.id}/complete`).expect(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('completa una lección con token válido', async () => {
    await request(app.getHttpServer())
      .post(`/progress/lessons/${lesson.id}/complete`)
      .set('Authorization', 'Bearer valid-token')
      .expect(201, { completed: true });
    expect(progress.saved).toEqual([lesson.id]);
  });

  it('404 si la lección no existe', async () => {
    const res = await request(app.getHttpServer())
      .post('/progress/lessons/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/complete')
      .set('Authorization', 'Bearer valid-token')
      .expect(404);
    expect(res.body.code).toBe('LESSON_NOT_FOUND');
  });

  it('lista el progreso del usuario', async () => {
    const res = await request(app.getHttpServer())
      .get('/progress/lessons')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
    expect(res.body).toEqual({ lessonIds: [lesson.id] });
  });
});
```

Run: `pnpm --filter @lingoleap/api test` — Expected: FAIL.

- [ ] **Step 2: Implementar guard, controller y wiring**

`apps/api/src/presentation/auth.guard.ts`:
```ts
import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_VERIFIER, type AuthenticatedUser, type AuthVerifier } from '../application/ports/auth-verifier.port';

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH_VERIFIER) private readonly verifier: AuthVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const user = token ? await this.verifier.verifyToken(token) : null;
    if (user === null) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Token requerido o inválido' });
    }
    request.user = user;
    return true;
  }
}
```

`apps/api/src/presentation/progress.controller.ts`:
```ts
import { Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { CompleteLessonUseCase } from '../application/use-cases/complete-lesson.use-case';
import { GetProgressUseCase } from '../application/use-cases/get-progress.use-case';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';

@Controller('progress')
@UseGuards(AuthGuard)
export class ProgressController {
  constructor(
    private readonly completeLesson: CompleteLessonUseCase,
    private readonly getProgress: GetProgressUseCase
  ) {}

  @Post('lessons/:lessonId/complete')
  async complete(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Req() req: AuthenticatedRequest
  ): Promise<{ completed: true }> {
    await this.completeLesson.execute(req.user.id, lessonId);
    return { completed: true };
  }

  @Get('lessons')
  async list(@Req() req: AuthenticatedRequest): Promise<{ lessonIds: string[] }> {
    return { lessonIds: await this.getProgress.execute(req.user.id) };
  }
}
```

Modificar `apps/api/src/infrastructure/ingest.module.ts` — agregar `SUPABASE_CLIENT` al arreglo `exports` (queda `exports: [IngestContentUseCase, COURSE_REPOSITORY, SUPABASE_CLIENT]`; importar el símbolo desde la factory).

Modificar `apps/api/src/presentation/content-api.module.ts` — agregar al módulo:
```ts
// imports nuevos arriba del archivo:
import type { SupabaseClient } from '@supabase/supabase-js';
import { AUTH_VERIFIER } from '../application/ports/auth-verifier.port';
import { PROGRESS_REPOSITORY, type ProgressRepository } from '../application/ports/progress.repository';
import { CompleteLessonUseCase } from '../application/use-cases/complete-lesson.use-case';
import { GetProgressUseCase } from '../application/use-cases/get-progress.use-case';
import { SupabaseAuthVerifier } from '../infrastructure/auth/supabase-auth.verifier';
import { SupabaseProgressRepository } from '../infrastructure/persistence/supabase/supabase-progress.repository';
import { SUPABASE_CLIENT } from '../infrastructure/persistence/supabase/supabase-client.factory';
import { AuthGuard } from './auth.guard';
import { ProgressController } from './progress.controller';

// en @Module: controllers: [CoursesController, LessonsController, ProgressController]
// providers adicionales:
{ provide: AUTH_VERIFIER, useFactory: (c: SupabaseClient) => new SupabaseAuthVerifier(c), inject: [SUPABASE_CLIENT] },
{ provide: PROGRESS_REPOSITORY, useFactory: (c: SupabaseClient) => new SupabaseProgressRepository(c), inject: [SUPABASE_CLIENT] },
{ provide: CompleteLessonUseCase, useFactory: (courses: CourseRepository, progress: ProgressRepository) => new CompleteLessonUseCase({ courses, progress }), inject: [COURSE_REPOSITORY, PROGRESS_REPOSITORY] },
{ provide: GetProgressUseCase, useFactory: (p: ProgressRepository) => new GetProgressUseCase(p), inject: [PROGRESS_REPOSITORY] },
AuthGuard,
```

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm --filter @lingoleap/api test` — Expected: PASS (todas las suites).

```bash
git add -A
git commit -m "feat(api): endpoints de progreso con guard de autenticación Supabase"
```

---

### Task 4: Filtro de stopwords en la ingesta

**Files:**
- Modify: `apps/api/src/infrastructure/providers/frequency-words/frequency-words.provider.ts`, `apps/api/src/infrastructure/providers/frequency-words/frequency-words.provider.spec.ts`

**Interfaces:**
- Consumes: `fetchText` existente.
- Produces: `FrequencyWordsVocabularyProvider` ahora descarga también la lista de stopwords del proyecto abierto **stopwords-iso** y excluye esas palabras ANTES de aplicar la banda. Constructor pasa a `constructor(baseUrl?, stopwordsBaseUrl = 'https://raw.githubusercontent.com/stopwords-iso')`. URLs: `en → <swBase>/stopwords-en/master/stopwords-en.txt`, `pt-BR → <swBase>/stopwords-pt/master/stopwords-pt.txt`, `it → <swBase>/stopwords-it/master/stopwords-it.txt` (una palabra por línea). Cachear por idioma. Si la descarga de stopwords falla (null) → continuar SIN filtro (log de advertencia con `console.warn`), no abortar.

- [ ] **Step 1: Actualizar el test (falla primero)**

Reemplazar el primer test en `frequency-words.provider.spec.ts` por:
```ts
  it('descarga, filtra stopwords y tokens no alfabéticos, respeta banda y límite', async () => {
    let downloads = 0;
    server.use(
      http.get(`${BASE}/en/en_50k.txt`, () => {
        downloads++;
        return HttpResponse.text(FILE);
      }),
      http.get(`${SW_BASE}/stopwords-en/master/stopwords-en.txt`, () => HttpResponse.text('the\nof\na'))
    );
    const provider = new FrequencyWordsVocabularyProvider(BASE, SW_BASE);
    // stopwords eliminan 'the' y 'of'; el filtro alfabético elimina 'x1' y 'a'
    const words = await provider.topWords('en', { start: 1, end: 4 }, 3);
    expect(words).toEqual(['water', 'milk', 'bread']);

    await provider.topWords('en', { start: 1, end: 4 }, 3);
    expect(downloads).toBe(1);
  });

  it('si las stopwords no se pueden descargar, continúa sin filtro', async () => {
    server.use(
      http.get(`${BASE}/en/en_50k.txt`, () => HttpResponse.text(FILE)),
      http.get(`${SW_BASE}/stopwords-en/master/stopwords-en.txt`, () => new HttpResponse(null, { status: 404 }))
    );
    const provider = new FrequencyWordsVocabularyProvider(BASE, SW_BASE);
    const words = await provider.topWords('en', { start: 1, end: 4 }, 3);
    expect(words).toEqual(['the', 'of', 'water']);
  });
```
Agregar arriba: `const SW_BASE = 'https://sw.test';`. Mantener el test existente del error de descarga del dataset principal.

Run: `pnpm --filter @lingoleap/api test` — Expected: FAIL (constructor y filtro no existen).

- [ ] **Step 2: Implementar**

En `frequency-words.provider.ts`: agregar `STOPWORDS_PATH: Record<LearningLanguage, string>` (`en → stopwords-en/master/stopwords-en.txt`, `pt-BR → stopwords-pt/master/stopwords-pt.txt`, `it → stopwords-it/master/stopwords-it.txt`), segundo parámetro de constructor `stopwordsBaseUrl = 'https://raw.githubusercontent.com/stopwords-iso'`, caché `stopwordsCache = new Map<LearningLanguage, Set<string>>()` y método privado:
```ts
  private async stopwords(language: LearningLanguage): Promise<Set<string>> {
    const cached = this.stopwordsCache.get(language);
    if (cached) return cached;
    const text = await fetchText(`${this.stopwordsBaseUrl}/${STOPWORDS_PATH[language]}`);
    if (text === null) {
      console.warn(`No se pudieron descargar stopwords para ${language}; se continúa sin filtro`);
      const empty = new Set<string>();
      this.stopwordsCache.set(language, empty);
      return empty;
    }
    const set = new Set(text.split('\n').map((l) => l.trim().toLowerCase()).filter((w) => w.length > 0));
    this.stopwordsCache.set(language, set);
    return set;
  }
```
En `topWords` (IMPORTANTE, en este orden — el dataset primero, para que un fallo del dataset lance antes de pedir stopwords y no rompa el test existente de error): `const all = await this.wordList(language); const sw = await this.stopwords(language); const filtered = all.filter((w) => !sw.has(w)); return filtered.slice(band.start - 1, band.end).slice(0, limit);`

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm --filter @lingoleap/api test` — Expected: PASS.

```bash
git add -A
git commit -m "feat(api): filtro de stopwords (stopwords-iso) en el vocabulario de ingesta"
```

---

### Task 5: `@lingoleap/tokens` — design tokens de la temática

**Files:**
- Create: `packages/tokens/package.json`, `packages/tokens/tsconfig.json`, `packages/tokens/src/index.ts`, `packages/tokens/src/tokens.css`

**Interfaces:**
- Produces: paquete `@lingoleap/tokens` con:
```ts
export const colors = {
  primary: '#58CC02', primaryDark: '#58A700', danger: '#FF4B4B',
  info: '#1CB0F6', warning: '#FFC800', text: '#3C3C3C',
  textMuted: '#777777', border: '#E5E5E5', surface: '#FFFFFF', background: '#F7F7F7'
} as const;
export const radii = { sm: '8px', md: '12px', lg: '16px', pill: '9999px' } as const;
export const spacing = { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' } as const;
export const fontFamily = "'Nunito', 'Segoe UI', system-ui, sans-serif";
```
  - `tokens.css` con las mismas como variables CSS `:root { --color-primary: #58CC02; ... }` (una variable por token, kebab-case: `--color-primary-dark`, `--radius-md`, `--space-lg`, `--font-family`).
  - `package.json` con `"exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }, "./tokens.css": "./src/tokens.css" }`, scripts `build: tsc -p tsconfig.json`, sin `test` (solo constantes). tsconfig igual al de core.

- [ ] **Step 1: Crear los 4 archivos** con los valores exactos de arriba (sin test — son constantes sin lógica).

- [ ] **Step 2: Verificar y commitear**

Run: `pnpm install && pnpm build` — Expected: compila `packages/tokens/dist/`.

```bash
git add -A
git commit -m "feat(tokens): design tokens de la temática (colores, radios, espaciados)"
```

---

### Task 6: Core — normalización y validación de respuestas (TDD)

**Files:**
- Create: `packages/core/src/logic/answer-validation.ts`
- Modify: `packages/core/src/index.ts` (agregar `export * from './logic/answer-validation';`)
- Test: `packages/core/src/logic/answer-validation.spec.ts`

**Interfaces:**
- Produces:
```ts
export function normalizeAnswer(text: string): string;
// minúsculas, sin puntuación .,;:!?¿¡"() ni tildes de comparación NO — las tildes SÍ se conservan;
// espacios colapsados a uno, trim.
export function isTokenAnswerCorrect(correctText: string, chosenTokens: string[]): boolean;
// normalizeAnswer(chosenTokens.join(' ')) === normalizeAnswer(correctText)
```
(La usan Translate — contra `correctAnswer` — y Listening — contra `text`.)

- [ ] **Step 1: Test que falla**

`packages/core/src/logic/answer-validation.spec.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { isTokenAnswerCorrect, normalizeAnswer } from './answer-validation';

describe('normalizeAnswer', () => {
  it('ignora mayúsculas, puntuación y espacios extra, conserva tildes', () => {
    expect(normalizeAnswer('  Yo  bebo agua, ¡cada día! ')).toBe('yo bebo agua cada día');
  });
});

describe('isTokenAnswerCorrect', () => {
  it('acepta los tokens correctos en orden', () => {
    expect(isTokenAnswerCorrect('Yo bebo agua.', ['Yo', 'bebo', 'agua'])).toBe(true);
  });
  it('rechaza orden incorrecto y tokens faltantes', () => {
    expect(isTokenAnswerCorrect('Yo bebo agua.', ['bebo', 'Yo', 'agua'])).toBe(false);
    expect(isTokenAnswerCorrect('Yo bebo agua.', ['Yo', 'bebo'])).toBe(false);
  });
});
```

Run: `pnpm --filter @lingoleap/core test` — Expected: FAIL.

- [ ] **Step 2: Implementar**

`packages/core/src/logic/answer-validation.ts`:
```ts
export function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,;:!?¿¡"()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTokenAnswerCorrect(correctText: string, chosenTokens: string[]): boolean {
  return normalizeAnswer(chosenTokens.join(' ')) === normalizeAnswer(correctText);
}
```

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm --filter @lingoleap/core test && pnpm build` — Expected: PASS.

```bash
git add -A
git commit -m "feat(core): normalización y validación de respuestas por tokens"
```

---

### Task 7: Core — estado del camino y sesión de lección (TDD)

**Files:**
- Create: `packages/core/src/logic/path-status.ts`, `packages/core/src/logic/lesson-session.ts`
- Modify: `packages/core/src/index.ts` (exportar ambos)
- Test: `packages/core/src/logic/path-status.spec.ts`, `packages/core/src/logic/lesson-session.spec.ts`

**Interfaces:**
- Produces:
```ts
// path-status.ts
export type LessonStatus = 'completed' | 'unlocked' | 'locked';
export function computePathStatus(course: Course, completedLessonIds: readonly string[]): Record<string, LessonStatus>;
// Recorre unidades→lecciones en orden por position. Completadas → 'completed'.
// La PRIMERA no completada → 'unlocked'. El resto → 'locked'.

// lesson-session.ts
export interface LessonSessionState {
  lesson: Lesson;
  index: number;                       // ejercicio actual
  correctCount: number;
  wrongCount: number;
  phase: 'answering' | 'feedback' | 'finished';
  lastAnswerCorrect: boolean | null;
}
export function startSession(lesson: Lesson): LessonSessionState;
export function submitAnswer(state: LessonSessionState, correct: boolean): LessonSessionState; // answering→feedback, acumula contadores
export function advance(state: LessonSessionState): LessonSessionState; // feedback→answering del siguiente, o 'finished' si era el último
export function progressRatio(state: LessonSessionState): number; // ejercicios respondidos / total (0..1)
```
Funciones puras: nunca mutan `state`, devuelven copias.

- [ ] **Step 1: Tests que fallan**

`packages/core/src/logic/path-status.spec.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Course } from '../exercises';
import { computePathStatus } from './path-status';

const course: Course = {
  id: 'c1', language: 'en', level: 'A1', title: 'Inglés A1',
  units: [
    { id: 'u1', title: 'Unidad 1', position: 1, lessons: [
      { id: 'l1', title: 'L1', position: 1, exercises: [] },
      { id: 'l2', title: 'L2', position: 2, exercises: [] }
    ] },
    { id: 'u2', title: 'Unidad 2', position: 2, lessons: [
      { id: 'l3', title: 'L3', position: 1, exercises: [] }
    ] }
  ]
};

describe('computePathStatus', () => {
  it('sin progreso: solo la primera está desbloqueada', () => {
    expect(computePathStatus(course, [])).toEqual({ l1: 'unlocked', l2: 'locked', l3: 'locked' });
  });
  it('con l1 completada: l2 desbloqueada, l3 bloqueada', () => {
    expect(computePathStatus(course, ['l1'])).toEqual({ l1: 'completed', l2: 'unlocked', l3: 'locked' });
  });
  it('todo completado', () => {
    expect(computePathStatus(course, ['l1', 'l2', 'l3'])).toEqual({ l1: 'completed', l2: 'completed', l3: 'completed' });
  });
});
```

`packages/core/src/logic/lesson-session.spec.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Lesson } from '../exercises';
import { advance, progressRatio, startSession, submitAnswer } from './lesson-session';

const lesson: Lesson = {
  id: 'l1', title: 'L1', position: 1,
  exercises: [
    { id: 'e1', type: 'match-pairs', pairs: [{ left: 'a', right: 'b' }] },
    { id: 'e2', type: 'match-pairs', pairs: [{ left: 'c', right: 'd' }] }
  ]
};

describe('sesión de lección', () => {
  it('flujo completo: responder, feedback, avanzar, terminar', () => {
    let s = startSession(lesson);
    expect(s.phase).toBe('answering');
    expect(progressRatio(s)).toBe(0);

    s = submitAnswer(s, true);
    expect(s.phase).toBe('feedback');
    expect(s.correctCount).toBe(1);
    expect(s.lastAnswerCorrect).toBe(true);
    expect(progressRatio(s)).toBe(0.5);

    s = advance(s);
    expect(s.phase).toBe('answering');
    expect(s.index).toBe(1);

    s = submitAnswer(s, false);
    expect(s.wrongCount).toBe(1);
    s = advance(s);
    expect(s.phase).toBe('finished');
    expect(progressRatio(s)).toBe(1);
  });

  it('no muta el estado anterior', () => {
    const s0 = startSession(lesson);
    const s1 = submitAnswer(s0, true);
    expect(s0.phase).toBe('answering');
    expect(s1).not.toBe(s0);
  });
});
```

Run: `pnpm --filter @lingoleap/core test` — Expected: FAIL.

- [ ] **Step 2: Implementar**

`packages/core/src/logic/path-status.ts`:
```ts
import type { Course } from '../exercises';

export type LessonStatus = 'completed' | 'unlocked' | 'locked';

export function computePathStatus(
  course: Course,
  completedLessonIds: readonly string[]
): Record<string, LessonStatus> {
  const completed = new Set(completedLessonIds);
  const result: Record<string, LessonStatus> = {};
  let unlockGiven = false;

  const units = [...course.units].sort((a, b) => a.position - b.position);
  for (const unit of units) {
    const lessons = [...unit.lessons].sort((a, b) => a.position - b.position);
    for (const lesson of lessons) {
      if (completed.has(lesson.id)) {
        result[lesson.id] = 'completed';
      } else if (!unlockGiven) {
        result[lesson.id] = 'unlocked';
        unlockGiven = true;
      } else {
        result[lesson.id] = 'locked';
      }
    }
  }
  return result;
}
```

`packages/core/src/logic/lesson-session.ts`:
```ts
import type { Lesson } from '../exercises';

export interface LessonSessionState {
  lesson: Lesson;
  index: number;
  correctCount: number;
  wrongCount: number;
  phase: 'answering' | 'feedback' | 'finished';
  lastAnswerCorrect: boolean | null;
}

export function startSession(lesson: Lesson): LessonSessionState {
  return { lesson, index: 0, correctCount: 0, wrongCount: 0, phase: 'answering', lastAnswerCorrect: null };
}

export function submitAnswer(state: LessonSessionState, correct: boolean): LessonSessionState {
  if (state.phase !== 'answering') return state;
  return {
    ...state,
    phase: 'feedback',
    lastAnswerCorrect: correct,
    correctCount: state.correctCount + (correct ? 1 : 0),
    wrongCount: state.wrongCount + (correct ? 0 : 1)
  };
}

export function advance(state: LessonSessionState): LessonSessionState {
  if (state.phase !== 'feedback') return state;
  const isLast = state.index >= state.lesson.exercises.length - 1;
  return isLast
    ? { ...state, phase: 'finished' }
    : { ...state, phase: 'answering', index: state.index + 1, lastAnswerCorrect: null };
}

export function progressRatio(state: LessonSessionState): number {
  const total = state.lesson.exercises.length;
  if (total === 0) return 1;
  const answered = state.correctCount + state.wrongCount;
  return answered / total;
}
```

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm --filter @lingoleap/core test && pnpm build` — Expected: PASS.

```bash
git add -A
git commit -m "feat(core): estado del camino de lecciones y máquina de sesión"
```

---

### Task 8: `@lingoleap/api-client` — SDK tipado

**Files:**
- Create: `packages/api-client/package.json`, `packages/api-client/tsconfig.json`, `packages/api-client/vitest.config.ts`, `packages/api-client/src/index.ts`, `packages/api-client/src/client.ts`
- Test: `packages/api-client/src/client.spec.ts`

**Interfaces:**
- Consumes: tipos de `@lingoleap/core`.
- Produces:
```ts
export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number);
}
export interface ApiClientConfig {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null>;
}
export class LingoApiClient {
  constructor(config: ApiClientConfig);
  listCourses(): Promise<CourseSummary[]>;
  getCourse(language: LearningLanguage, level: CEFRLevel): Promise<Course>;
  getLesson(lessonId: string): Promise<Lesson>;
  completeLesson(lessonId: string): Promise<void>;       // requiere token
  getCompletedLessonIds(): Promise<string[]>;             // requiere token
}
```
Comportamiento: método privado `request(path, init?)` — agrega `Authorization: Bearer <token>` si `getAccessToken` devuelve valor; en respuesta no-ok intenta parsear `{ code, message }` y lanza `ApiError(code, message, status)` (fallback `code: 'UNKNOWN'`). `index.ts` re-exporta todo.

`package.json`: name `@lingoleap/api-client`, main/types a dist, scripts `build: tsc -p tsconfig.json`, `test: vitest run`; deps: `@lingoleap/core: workspace:*`; devDeps: typescript, vitest, msw. tsconfig igual a core. `vitest.config.ts` mínimo (`test: { include: ['src/**/*.spec.ts'] }`).

- [ ] **Step 1: Test que falla**

`packages/api-client/src/client.spec.ts`:
```ts
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ApiError, LingoApiClient } from './client';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE = 'https://api.test';

describe('LingoApiClient', () => {
  it('lista cursos', async () => {
    server.use(http.get(`${BASE}/courses`, () =>
      HttpResponse.json([{ id: 'c1', language: 'en', level: 'A1', title: 'Inglés A1' }])
    ));
    const client = new LingoApiClient({ baseUrl: BASE });
    await expect(client.listCourses()).resolves.toHaveLength(1);
  });

  it('adjunta el Bearer token cuando hay sesión', async () => {
    server.use(http.get(`${BASE}/progress/lessons`, ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer tok-123');
      return HttpResponse.json({ lessonIds: ['l1'] });
    }));
    const client = new LingoApiClient({ baseUrl: BASE, getAccessToken: async () => 'tok-123' });
    await expect(client.getCompletedLessonIds()).resolves.toEqual(['l1']);
  });

  it('lanza ApiError con el código semántico del backend', async () => {
    server.use(http.get(`${BASE}/courses/it/C2`, () =>
      HttpResponse.json({ code: 'COURSE_NOT_FOUND', message: 'Curso no encontrado' }, { status: 404 })
    ));
    const client = new LingoApiClient({ baseUrl: BASE });
    const error = await client.getCourse('it', 'C2').catch((e: ApiError) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('COURSE_NOT_FOUND');
    expect((error as ApiError).status).toBe(404);
  });

  it('POST de completar lección envía token', async () => {
    server.use(http.post(`${BASE}/progress/lessons/l1/complete`, ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer tok-123');
      return HttpResponse.json({ completed: true }, { status: 201 });
    }));
    const client = new LingoApiClient({ baseUrl: BASE, getAccessToken: async () => 'tok-123' });
    await expect(client.completeLesson('l1')).resolves.toBeUndefined();
  });
});
```

Run: `pnpm install && pnpm --filter @lingoleap/api-client test` — Expected: FAIL.

- [ ] **Step 2: Implementar**

`packages/api-client/src/client.ts`:
```ts
import type { CEFRLevel, Course, CourseSummary, LearningLanguage, Lesson } from '@lingoleap/core';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export interface ApiClientConfig {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null>;
}

export class LingoApiClient {
  constructor(private readonly config: ApiClientConfig) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    const token = (await this.config.getAccessToken?.()) ?? null;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const response = await fetch(`${this.config.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
      throw new ApiError(body?.code ?? 'UNKNOWN', body?.message ?? `Error HTTP ${response.status}`, response.status);
    }
    return response.json() as Promise<T>;
  }

  listCourses(): Promise<CourseSummary[]> {
    return this.request('/courses');
  }

  getCourse(language: LearningLanguage, level: CEFRLevel): Promise<Course> {
    return this.request(`/courses/${language}/${level}`);
  }

  getLesson(lessonId: string): Promise<Lesson> {
    return this.request(`/lessons/${lessonId}`);
  }

  async completeLesson(lessonId: string): Promise<void> {
    await this.request(`/progress/lessons/${lessonId}/complete`, { method: 'POST' });
  }

  async getCompletedLessonIds(): Promise<string[]> {
    const body = await this.request<{ lessonIds: string[] }>('/progress/lessons');
    return body.lessonIds;
  }
}
```

`src/index.ts`: `export * from './client';`

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm --filter @lingoleap/api-client test && pnpm build` — Expected: PASS.

```bash
git add -A
git commit -m "feat(api-client): SDK tipado con manejo de token y errores semánticos"
```

---

### Task 9: Scaffold de `apps/web` (Vite + React + providers)

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`, `apps/web/index.html`, `apps/web/.env.example`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/app/providers.tsx`, `apps/web/src/app/supabase.ts`, `apps/web/src/app/api.ts`, `apps/web/src/app/env.ts`, `apps/web/src/styles.css`, `apps/web/src/test/setup.ts`, `apps/web/src/test/render.tsx`
- Test: `apps/web/src/App.spec.tsx`

**Interfaces:**
- Produces:
  - `env.ts`: `export const env = { apiUrl: import.meta.env.VITE_API_URL as string, supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string, supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string };`
  - `supabase.ts`: `export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);`
  - `api.ts`: `export const api = new LingoApiClient({ baseUrl: env.apiUrl, getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null });`
  - `providers.tsx`: `<QueryClientProvider>` + `<BrowserRouter>` componibles (`AppProviders({ children })`).
  - `App.tsx`: por ahora solo `<h1>LingoLeap</h1>` + `<Routes>` con placeholder (las rutas reales llegan en Tasks 10-15).
  - `render.tsx` (test util): `renderWithProviders(ui, { route = '/' })` — envuelve en `QueryClientProvider` (client con `retry: false`) + `MemoryRouter`.
  - `.env.example`: `VITE_API_URL=http://localhost:3000`, `VITE_SUPABASE_URL=...`, `VITE_SUPABASE_ANON_KEY=...`

`package.json` (name `@lingoleap/web`; deps clave): react ^18.3, react-dom ^18.3, react-router-dom ^6.28, @tanstack/react-query ^5, zustand ^5, @supabase/supabase-js ^2, @lingoleap/{core,api-client,tokens} workspace:*. devDeps: vite ^6, @vitejs/plugin-react ^4, typescript, vitest ^3, jsdom ^25, @testing-library/react ^16, @testing-library/user-event ^14, @testing-library/jest-dom ^6, msw ^2. Scripts: `dev: vite`, `build: tsc --noEmit -p tsconfig.json && vite build`, `test: vitest run`, `preview: vite preview`.
`vitest.config.ts`: `plugins: [react()]` (mismo plugin de Vite — necesario para transformar TSX), environment `jsdom`, `setupFiles: ['src/test/setup.ts']` (importa `@testing-library/jest-dom/vitest`), globals false.
`tsconfig.json`: extiende base pero con `"jsx": "react-jsx"`, `"module": "ESNext"`, `"moduleResolution": "bundler"`, `"noEmit": true`, `"types": ["vite/client"]`.
`styles.css`: importa nada externo; `@import '@lingoleap/tokens/tokens.css';` + reset mínimo + clases utilitarias base (body con `--font-family`, fondo `--color-background`).

- [ ] **Step 1: Test que falla**

`apps/web/src/App.spec.tsx`:
```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';
import { renderWithProviders } from './test/render';

describe('App', () => {
  it('renderiza el título', () => {
    renderWithProviders(<App />);
    expect(screen.getByText('LingoLeap')).toBeInTheDocument();
  });
});
```

Run: `pnpm install && pnpm --filter @lingoleap/web test` — Expected: FAIL (archivos no existen).

- [ ] **Step 2: Crear todos los archivos del scaffold** conforme al bloque Interfaces (App mínima con el `<h1>`; `main.tsx` monta `<AppProviders><App /></AppProviders>` e importa `./styles.css`).

Nota: `env.ts` NO debe lanzar en tests (jsdom no tiene `import.meta.env` poblado) — usar fallback: `import.meta.env.VITE_API_URL ?? 'http://localhost:3000'` etc.

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm --filter @lingoleap/web test` — Expected: PASS.
Run: `pnpm build` — Expected: compila todo el monorepo incluida la web.

```bash
git add -A
git commit -m "feat(web): scaffold de la app React con Vite, router, query y supabase"
```

---

### Task 10: Feature auth — sesión, login/registro y ruta protegida

**Files:**
- Create: `apps/web/src/features/auth/AuthProvider.tsx`, `apps/web/src/features/auth/useAuth.ts`, `apps/web/src/features/auth/LoginPage.tsx`, `apps/web/src/features/auth/RequireAuth.tsx`
- Modify: `apps/web/src/App.tsx` (rutas: `/login` → LoginPage; `/` → protegida, placeholder "Cursos"), `apps/web/src/app/providers.tsx` (envolver con AuthProvider), `apps/web/src/test/render.tsx` (mock de sesión opcional)
- Test: `apps/web/src/features/auth/LoginPage.spec.tsx`

**Interfaces:**
- Consumes: `supabase` de `app/supabase.ts`.
- Produces:
```tsx
// AuthProvider: contexto { session: Session | null; loading: boolean; signOut: () => Promise<void> }
// mantenido con supabase.auth.getSession() inicial + supabase.auth.onAuthStateChange.
export function useAuth(): { session: Session | null; loading: boolean; signOut: () => Promise<void> };
// LoginPage: formulario con tabs "Entrar" / "Crear cuenta" (email + contraseña),
// botón "Continuar con Google" → supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
// errores en español bajo el formulario; al registrarse muestra "Revisa tu correo para confirmar la cuenta" si Supabase lo pide.
// RequireAuth: loading → "Cargando…"; sin sesión → <Navigate to="/login" />; con sesión → children.
```
Los tests mockean el módulo `app/supabase.ts` con `vi.mock` (no llaman a Supabase real).

- [ ] **Step 1: Test que falla**

`apps/web/src/features/auth/LoginPage.spec.tsx`:
```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithPassword = vi.fn();
const signInWithOAuth = vi.fn();
vi.mock('../../app/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
      signUp: vi.fn(),
      signInWithOAuth: (...a: unknown[]) => signInWithOAuth(...a),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    }
  }
}));

import { LoginPage } from './LoginPage';
import { renderWithProviders } from '../../test/render';

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('envía email y contraseña al iniciar sesión', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreta123');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secreta123' });
  });

  it('muestra el error en español si las credenciales fallan', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Correo o contraseña incorrectos')).toBeInTheDocument();
  });

  it('dispara el flujo de Google', async () => {
    signInWithOAuth.mockResolvedValue({ error: null });
    renderWithProviders(<LoginPage />);
    await userEvent.click(screen.getByRole('button', { name: /Google/ }));
    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' })
    );
  });
});
```

Run: `pnpm --filter @lingoleap/web test` — Expected: FAIL.

- [ ] **Step 2: Implementar AuthProvider, useAuth, LoginPage, RequireAuth y rutas**

`AuthProvider.tsx` (esqueleto exacto):
```tsx
import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../app/supabase';

export interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, loading, signOut: async () => { await supabase.auth.signOut(); } }),
    [session, loading]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

`useAuth.ts`: `useContext(AuthContext)` con throw en español si falta el provider.

`LoginPage.tsx`: formulario controlado con `<label htmlFor>` correctos ("Correo electrónico", "Contraseña"), estado `mode: 'login' | 'register'`, mapeo de errores: `Invalid login credentials` → "Correo o contraseña incorrectos", `User already registered` → "Ese correo ya tiene cuenta", otro → "Algo salió mal, intenta de nuevo". Tras `signUp` sin error y sin sesión → mensaje "Revisa tu correo para confirmar la cuenta". Botón Google con texto "Continuar con Google". Estilos con variables de tokens (botón primario verde, borde `--color-border`, radios `--radius-md`).

`RequireAuth.tsx`:
```tsx
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <p>Cargando…</p>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

`App.tsx`: rutas `/login` y `/` (protegida con RequireAuth, contenido placeholder `<h1>LingoLeap</h1>` + "Cursos"). `providers.tsx` envuelve con `<AuthProvider>`. En `test/render.tsx` los tests que necesiten sesión la simularán mockeando `app/supabase.ts` (patrón del Step 1).

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm --filter @lingoleap/web test` — Expected: PASS.

```bash
git add -A
git commit -m "feat(web): autenticación con Supabase (email/contraseña y Google) y rutas protegidas"
```

---

### Task 11: Hook `useSpeech` (TTS del navegador)

**Files:**
- Create: `apps/web/src/shared/useSpeech.ts`
- Test: `apps/web/src/shared/useSpeech.spec.ts`

**Interfaces:**
- Produces:
```ts
export function useSpeech(language: LearningLanguage): {
  speak: (text: string) => void;   // cancela lo anterior y pronuncia con la voz del idioma
  supported: boolean;              // false si el navegador no tiene speechSynthesis
};
// Mapa BCP-47: en → 'en-US', 'pt-BR' → 'pt-BR', it → 'it-IT'
```

- [ ] **Step 1: Test que falla**

`apps/web/src/shared/useSpeech.spec.ts`:
```ts
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSpeech } from './useSpeech';

describe('useSpeech', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pronuncia con el idioma correcto', () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak, cancel });
    const { result } = renderHook(() => useSpeech('pt-BR'));
    expect(result.current.supported).toBe(true);
    result.current.speak('Bom dia');
    expect(cancel).toHaveBeenCalled();
    const utterance = speak.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.text).toBe('Bom dia');
    expect(utterance.lang).toBe('pt-BR');
  });

  it('reporta no soportado sin speechSynthesis', () => {
    vi.stubGlobal('speechSynthesis', undefined);
    const { result } = renderHook(() => useSpeech('en'));
    expect(result.current.supported).toBe(false);
    expect(() => result.current.speak('hello')).not.toThrow();
  });
});
```

Run: `pnpm --filter @lingoleap/web test` — Expected: FAIL.

- [ ] **Step 2: Implementar**

`apps/web/src/shared/useSpeech.ts`:
```ts
import { useCallback } from 'react';
import type { LearningLanguage } from '@lingoleap/core';

const BCP47: Record<LearningLanguage, string> = { en: 'en-US', 'pt-BR': 'pt-BR', it: 'it-IT' };

export function useSpeech(language: LearningLanguage): { speak: (text: string) => void; supported: boolean } {
  const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : undefined;
  const supported = synth !== undefined;

  const speak = useCallback(
    (text: string) => {
      if (!synth) return;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = BCP47[language];
      utterance.rate = 0.95;
      synth.speak(utterance);
    },
    [synth, language]
  );

  return { speak, supported };
}
```
Nota jsdom: si `SpeechSynthesisUtterance` no existe en jsdom, definir un stub global en `src/test/setup.ts`:
```ts
if (typeof globalThis.SpeechSynthesisUtterance === 'undefined') {
  class FakeUtterance { text: string; lang = ''; rate = 1; constructor(text: string) { this.text = text; } }
  (globalThis as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance;
}
```

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm --filter @lingoleap/web test` — Expected: PASS.

```bash
git add -A
git commit -m "feat(web): hook useSpeech con TTS del navegador por idioma"
```

---

### Task 12: Feature course-path — selección de curso y camino de lecciones

**Files:**
- Create: `apps/web/src/features/course-path/CoursesPage.tsx`, `apps/web/src/features/course-path/CoursePathPage.tsx`, `apps/web/src/features/course-path/LessonNode.tsx`, `apps/web/src/features/course-path/queries.ts`
- Modify: `apps/web/src/App.tsx` (rutas `/` → CoursesPage, `/course/:language/:level` → CoursePathPage, ambas protegidas), `apps/web/src/test/render.tsx` (aceptar `{ route, path }` y montar `<Routes><Route path={path} element={ui} /></Routes>` dentro del `MemoryRouter`)
- Test: `apps/web/src/features/course-path/CoursePathPage.spec.tsx`

**Interfaces:**
- Consumes: `api` (LingoApiClient), `computePathStatus` de core, `useAuth`.
- Produces:
  - `queries.ts`: hooks `useCourses()` (`['courses']` → `api.listCourses()`), `useCourse(language, level)` (`['course', language, level]`), `useProgress()` (`['progress']` → `api.getCompletedLessonIds()`).
  - `CoursesPage`: lista de cursos como tarjetas (título + bandera emoji por idioma: en 🇺🇸, pt-BR 🇧🇷, it 🇮🇹) → link a `/course/:language/:level`. Botón "Salir" (signOut).
  - `CoursePathPage`: carga curso + progreso, calcula `computePathStatus`, renderiza unidades con sus lecciones como burbujas: completada (verde, ✓), desbloqueada (verde brillante, clickable → `/lesson/:id`), bloqueada (gris, `aria-disabled`, sin link). Estados loading/error en español ("Cargando…", "No pudimos cargar el curso").
  - `LessonNode`: presentacional puro `{ title, status, lessonId, language }` — el link incluye el idioma como query param: `<Link to={'/lesson/' + lessonId + '?lang=' + language}>` (el reproductor lo necesita para el TTS, ver Task 15).

- [ ] **Step 1: Test que falla**

`apps/web/src/features/course-path/CoursePathPage.spec.tsx`:
```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Course } from '@lingoleap/core';

const course: Course = {
  id: 'c1', language: 'en', level: 'A1', title: 'Inglés A1',
  units: [{ id: 'u1', title: 'Unidad 1', position: 1, lessons: [
    { id: 'l1', title: 'Lección 1', position: 1, exercises: [] },
    { id: 'l2', title: 'Lección 2', position: 2, exercises: [] }
  ] }]
};

vi.mock('../../app/api', () => ({
  api: {
    getCourse: vi.fn().mockResolvedValue(course),
    getCompletedLessonIds: vi.fn().mockResolvedValue(['l1'])
  }
}));

import { CoursePathPage } from './CoursePathPage';
import { renderWithProviders } from '../../test/render';

describe('CoursePathPage', () => {
  it('muestra completadas, desbloqueadas y bloqueadas según el progreso', async () => {
    renderWithProviders(<CoursePathPage />, { route: '/course/en/A1', path: '/course/:language/:level' });
    expect(await screen.findByText('Unidad 1')).toBeInTheDocument();

    const l1 = screen.getByTestId('lesson-l1');
    const l2 = screen.getByTestId('lesson-l2');
    expect(l1).toHaveAttribute('data-status', 'completed');
    expect(l2).toHaveAttribute('data-status', 'unlocked');
    expect(screen.getByRole('link', { name: /Lección 2/ })).toHaveAttribute('href', '/lesson/l2?lang=en');
  });
});
```
(Para soportar `path`, ampliar `renderWithProviders` para aceptar `{ route, path }` y montar `<Routes><Route path={path} element={ui} /></Routes>` dentro del `MemoryRouter initialEntries=[route]`.)

Run: `pnpm --filter @lingoleap/web test` — Expected: FAIL.

- [ ] **Step 2: Implementar** los 4 archivos + rutas. `LessonNode` emite `data-testid={'lesson-' + lessonId}` y `data-status={status}`; desbloqueada/completada envuelta en `<Link to={'/lesson/' + lessonId}>`; bloqueada es `<div aria-disabled="true">`. Estilos: burbujas circulares (`--radius-pill`), verde `--color-primary` / gris `--color-border`.

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm --filter @lingoleap/web test` — Expected: PASS.

```bash
git add -A
git commit -m "feat(web): selección de curso y camino de lecciones con desbloqueo progresivo"
```

---

### Task 13: Componentes de ejercicio — ImageSelect y MatchPairs

**Files:**
- Create: `apps/web/src/features/lesson-player/exercises/ImageSelectExercise.tsx`, `apps/web/src/features/lesson-player/exercises/MatchPairsExercise.tsx`
- Test: `apps/web/src/features/lesson-player/exercises/ImageSelectExercise.spec.tsx`, `apps/web/src/features/lesson-player/exercises/MatchPairsExercise.spec.tsx`

**Interfaces:**
- Produces (contrato común de TODOS los componentes de ejercicio — Task 14 lo reutiliza):
```tsx
export interface ExerciseComponentProps<E> {
  exercise: E;
  onResolve: (correct: boolean) => void; // se llama UNA vez cuando el usuario resuelve
}
```
  - `ImageSelectExercise`: pregunta "¿Cuál es «{prompt}»?", grid de 4 opciones (imagen si `imageUrl`, siempre el `label` debajo). Al hacer clic en una opción queda seleccionada; botón "Comprobar" llama `onResolve(option.correct)`.
  - `MatchPairsExercise`: dos columnas mezcladas (izquierda: `left`s, derecha: `right`s). Seleccionar una de cada lado: si es pareja correcta ambas quedan deshabilitadas (verde); si no, se des-seleccionan (rojo breve via clase). Cuando todas las parejas están unidas → `onResolve(true)` automáticamente. (Simplificación de MVP: los errores intermedios no fallan el ejercicio; anotado como deuda para Fase 3.)

- [ ] **Step 1: Tests que fallan**

`ImageSelectExercise.spec.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ImageSelectExercise as ImageSelectModel } from '@lingoleap/core';
import { ImageSelectExercise } from './ImageSelectExercise';

const exercise: ImageSelectModel = {
  id: 'e1', type: 'image-select', prompt: 'agua',
  options: [
    { label: 'water', imageUrl: 'https://img/w.jpg', correct: true },
    { label: 'milk', imageUrl: 'https://img/m.jpg', correct: false },
    { label: 'tea', imageUrl: null, correct: false },
    { label: 'bread', imageUrl: 'https://img/b.jpg', correct: false }
  ]
};

describe('ImageSelectExercise', () => {
  it('resuelve correcto al elegir la opción correcta', async () => {
    const onResolve = vi.fn();
    render(<ImageSelectExercise exercise={exercise} onResolve={onResolve} />);
    expect(screen.getByText(/agua/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /water/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    expect(onResolve).toHaveBeenCalledWith(true);
  });

  it('resuelve incorrecto con una opción equivocada', async () => {
    const onResolve = vi.fn();
    render(<ImageSelectExercise exercise={exercise} onResolve={onResolve} />);
    await userEvent.click(screen.getByRole('button', { name: /milk/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    expect(onResolve).toHaveBeenCalledWith(false);
  });

  it('Comprobar está deshabilitado sin selección', () => {
    render(<ImageSelectExercise exercise={exercise} onResolve={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Comprobar' })).toBeDisabled();
  });
});
```

`MatchPairsExercise.spec.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MatchPairsExercise as MatchPairsModel } from '@lingoleap/core';
import { MatchPairsExercise } from './MatchPairsExercise';

const exercise: MatchPairsModel = {
  id: 'e1', type: 'match-pairs',
  pairs: [ { left: 'water', right: 'agua' }, { left: 'milk', right: 'leche' } ]
};

describe('MatchPairsExercise', () => {
  it('resuelve al unir todas las parejas', async () => {
    const onResolve = vi.fn();
    render(<MatchPairsExercise exercise={exercise} onResolve={onResolve} />);
    await userEvent.click(screen.getByRole('button', { name: 'water' }));
    await userEvent.click(screen.getByRole('button', { name: 'agua' }));
    expect(onResolve).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'milk' }));
    await userEvent.click(screen.getByRole('button', { name: 'leche' }));
    expect(onResolve).toHaveBeenCalledWith(true);
  });

  it('una pareja incorrecta se des-selecciona y no resuelve', async () => {
    const onResolve = vi.fn();
    render(<MatchPairsExercise exercise={exercise} onResolve={onResolve} />);
    await userEvent.click(screen.getByRole('button', { name: 'water' }));
    await userEvent.click(screen.getByRole('button', { name: 'leche' }));
    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'water' })).not.toBeDisabled();
  });
});
```

Run: `pnpm --filter @lingoleap/web test` — Expected: FAIL.

- [ ] **Step 2: Implementar ambos componentes.** MatchPairs: estado `matched: Set<string>` (por `left`), `selectedLeft/selectedRight`; al tener ambos → si `pairs` contiene esa combinación exacta, agregar a matched (botones `disabled`), si no, limpiar selección; cuando `matched.size === pairs.length` → `onResolve(true)` (en un `useEffect` con guard para dispararlo una sola vez). Las columnas se renderizan en el orden dado (los `pairs` ya llegan mezclados del pipeline; para desordenar derecha vs izquierda usar `[...pairs].sort((a, b) => a.right.localeCompare(b.right))` — determinista para los tests).

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm --filter @lingoleap/web test` — Expected: PASS.

```bash
git add -A
git commit -m "feat(web): ejercicios de selección con imagen y parejas"
```

---

### Task 14: Componentes de ejercicio — Translate y Listening (banco de palabras + TTS)

**Files:**
- Create: `apps/web/src/features/lesson-player/exercises/WordBankAnswer.tsx`, `apps/web/src/features/lesson-player/exercises/TranslateExercise.tsx`, `apps/web/src/features/lesson-player/exercises/ListeningExercise.tsx`
- Test: `apps/web/src/features/lesson-player/exercises/TranslateExercise.spec.tsx`

**Interfaces:**
- Consumes: `isTokenAnswerCorrect` de core, `useSpeech`, contrato `ExerciseComponentProps` (Task 13), tipos core.
- Produces:
  - `WordBankAnswer`: componente compartido `{ wordBank: string[]; onCheck: (chosenTokens: string[]) => void }` — fichas del banco (cada clic mueve la ficha a la zona de respuesta; clic en la respuesta la devuelve), botón "Comprobar" deshabilitado con respuesta vacía.
  - `TranslateExercise`: muestra `sourceText` + botón 🔊 (`useSpeech(courseLanguage)`; el idioma llega por prop `language: LearningLanguage`), debajo `WordBankAnswer`; al comprobar → `onResolve(isTokenAnswerCorrect(exercise.correctAnswer, tokens))`.
  - `ListeningExercise`: solo el botón 🔊 grande ("Escucha y escribe lo que oíste") + `WordBankAnswer`; comprobar → contra `exercise.text`. Si `exercise.audioUrl` existe, reproducir con `new Audio(audioUrl)`; si no, TTS.
  - Ambos aceptan prop extra `language: LearningLanguage` además del contrato base.

- [ ] **Step 1: Test que falla**

`TranslateExercise.spec.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TranslateExercise as TranslateModel } from '@lingoleap/core';
import { TranslateExercise } from './TranslateExercise';

const exercise: TranslateModel = {
  id: 'e1', type: 'translate', sourceText: 'You dance.',
  correctAnswer: 'Tú bailas.', wordBank: ['bailas', 'Tú', 'come'], audioUrl: null
};

describe('TranslateExercise', () => {
  it('arma la respuesta con fichas y resuelve correcto', async () => {
    const onResolve = vi.fn();
    render(<TranslateExercise exercise={exercise} language="en" onResolve={onResolve} />);
    expect(screen.getByText('You dance.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tú' }));
    await userEvent.click(screen.getByRole('button', { name: 'bailas' }));
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    expect(onResolve).toHaveBeenCalledWith(true);
  });

  it('respuesta incompleta resuelve incorrecto', async () => {
    const onResolve = vi.fn();
    render(<TranslateExercise exercise={exercise} language="en" onResolve={onResolve} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tú' }));
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    expect(onResolve).toHaveBeenCalledWith(false);
  });

  it('una ficha usada vuelve al banco al tocarla en la respuesta', async () => {
    render(<TranslateExercise exercise={exercise} language="en" onResolve={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tú' }));
    const answerZone = screen.getByTestId('answer-zone');
    expect(answerZone).toHaveTextContent('Tú');
    await userEvent.click(screen.getByTestId('answer-zone').querySelector('button')!);
    expect(answerZone).not.toHaveTextContent('Tú');
  });
});
```

Run: `pnpm --filter @lingoleap/web test` — Expected: FAIL.

- [ ] **Step 2: Implementar los 3 componentes.** `WordBankAnswer` con estado `chosen: number[]` (índices del wordBank para soportar tokens duplicados); zona de respuesta `data-testid="answer-zone"`. TTS en Translate: botón `aria-label="Escuchar"` que llama `speak(exercise.sourceText)`.

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm --filter @lingoleap/web test` — Expected: PASS.

```bash
git add -A
git commit -m "feat(web): ejercicios de traducción y escucha con banco de palabras y TTS"
```

---

### Task 15: Reproductor de lección — pantalla completa del flujo

**Files:**
- Create: `apps/web/src/features/lesson-player/LessonPlayerPage.tsx`, `apps/web/src/features/lesson-player/sessionStore.ts`, `apps/web/src/features/lesson-player/FeedbackBar.tsx`, `apps/web/src/features/lesson-player/CompletionScreen.tsx`
- Modify: `apps/web/src/App.tsx` (ruta `/lesson/:lessonId` protegida)
- Test: `apps/web/src/features/lesson-player/LessonPlayerPage.spec.tsx`

**Interfaces:**
- Consumes: `startSession/submitAnswer/advance/progressRatio` de core, los 4 componentes de ejercicio, `api`, TanStack Query (`useQuery` lesson, `useMutation` completeLesson + invalidate `['progress']`).
- Produces:
  - `sessionStore.ts` (zustand):
```ts
interface SessionStore {
  state: LessonSessionState | null;
  start: (lesson: Lesson) => void;    // startSession
  resolve: (correct: boolean) => void; // submitAnswer
  next: () => void;                    // advance
  reset: () => void;
}
export const useSessionStore = create<SessionStore>(...);
```
  - `LessonPlayerPage`: carga la lección (`useQuery(['lesson', id])`), `start` al llegar; barra de progreso superior (width = `progressRatio * 100%`); renderiza el componente según `exercise.type` (el `language` del curso llega por query param `?lang=en` en el link desde el path — `LessonNode` lo agrega); al `onResolve` → `resolve(correct)` y muestra `FeedbackBar` ("¡Correcto!" verde / "Incorrecto" rojo con la respuesta correcta) con botón "Continuar" → `next()`; al llegar a `finished` → `CompletionScreen` con aciertos/errores, dispara la mutación `completeLesson` una sola vez, botón "Volver al curso".
  - `FeedbackBar`: presentacional `{ correct: boolean; correctAnswer?: string; onContinue: () => void }`.

- [ ] **Step 1: Test que falla**

`LessonPlayerPage.spec.tsx`:
```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lesson } from '@lingoleap/core';

const lesson: Lesson = {
  id: 'l1', title: 'Lección 1', position: 1,
  exercises: [
    { id: 'e1', type: 'match-pairs', pairs: [{ left: 'water', right: 'agua' }] },
    { id: 'e2', type: 'image-select', prompt: 'leche',
      options: [ { label: 'milk', imageUrl: null, correct: true }, { label: 'tea', imageUrl: null, correct: false } ] }
  ]
};

const completeLesson = vi.fn().mockResolvedValue(undefined);
vi.mock('../../app/api', () => ({
  api: {
    getLesson: vi.fn().mockResolvedValue(lesson),
    completeLesson: (...a: unknown[]) => completeLesson(...a)
  }
}));

import { LessonPlayerPage } from './LessonPlayerPage';
import { renderWithProviders } from '../../test/render';
import { useSessionStore } from './sessionStore';

describe('LessonPlayerPage', () => {
  beforeEach(() => {
    completeLesson.mockClear();
    useSessionStore.getState().reset();
  });

  it('recorre la lección completa y registra el progreso', async () => {
    renderWithProviders(<LessonPlayerPage />, { route: '/lesson/l1?lang=en', path: '/lesson/:lessonId' });

    // Ejercicio 1: parejas
    await userEvent.click(await screen.findByRole('button', { name: 'water' }));
    await userEvent.click(screen.getByRole('button', { name: 'agua' }));
    expect(await screen.findByText('¡Correcto!')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    // Ejercicio 2: selección
    await userEvent.click(screen.getByRole('button', { name: /milk/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    // Pantalla final
    expect(await screen.findByText('¡Lección completada!')).toBeInTheDocument();
    expect(completeLesson).toHaveBeenCalledWith('l1');
    expect(completeLesson).toHaveBeenCalledTimes(1);
  });
});
```

Run: `pnpm --filter @lingoleap/web test` — Expected: FAIL.

- [ ] **Step 2: Implementar** store, página, FeedbackBar y CompletionScreen conforme al bloque Interfaces. La mutación de completar usa un `useRef` o estado del store para no duplicar el POST. Colores desde tokens.

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm --filter @lingoleap/web test && pnpm build && pnpm lint` — Expected: todo PASS.

```bash
git add -A
git commit -m "feat(web): reproductor de lección completo con barra de progreso y registro"
```

---

### Task 16: Documentación de la fase

**Files:**
- Modify: `README.md` (roadmap: marcar Fase 2, agregar sección de la web con comandos `pnpm --filter @lingoleap/web dev`), `docs/BITACORA.md` (nueva entrada "Fase 2" siguiendo el formato de la Fase 1: decisiones+porqués, problemas encontrados durante la ejecución, deuda técnica, actualización de la guía de entrevista con temas React: hooks, TanStack Query vs estado local, Testing Library, contexto de auth)

- [ ] **Step 1: Actualizar ambos documentos.** La entrada de BITACORA debe escribirse con los problemas REALES que hayan aparecido en las tareas 1-15 (revisar los reportes/commits), no genéricos.

- [ ] **Step 2: Verificar y commitear**

Run: `pnpm lint && pnpm build && pnpm test` — Expected: PASS.

```bash
git add -A
git commit -m "docs: bitácora y README de la Fase 2 (web React)"
```

---

### Task 17: Smoke real end-to-end (manual, con el usuario)

**Prerrequisitos que hace el usuario (guiarlo):**
1. En Supabase SQL Editor: ejecutar `supabase/migrations/0002_progress.sql`.
2. En Supabase → Authentication → Providers: verificar que Email esté habilitado; para desarrollo, desactivar "Confirm email" (o probar con confirmación).
3. Google (opcional en este smoke, requiere Google Cloud Console): crear OAuth Client ID (tipo Web), pegar client id/secret en Supabase → Authentication → Providers → Google, y agregar la redirect URL que Supabase indica. Si el usuario prefiere, se pospone y se prueba solo email.
4. Crear `apps/web/.env.local` desde `.env.example` con la URL del proyecto Supabase, la **anon key** (Settings → API Keys → publishable/anon, NO la secreta) y `VITE_API_URL=http://localhost:3000`.

- [ ] **Step 1: Re-ingestar contenido con stopwords**: `pnpm --filter @lingoleap/api ingest --lang en --level A1 --limit 40` — Expected: reporte con palabras de contenido (no "the/of").
- [ ] **Step 2: Levantar API y web**: `pnpm --filter @lingoleap/api dev` y `pnpm --filter @lingoleap/web dev`.
- [ ] **Step 3: Recorrido completo en el navegador** (el usuario): registrarse con email → ver cursos → abrir Inglés A1 → solo la primera lección desbloqueada → completar la lección (4 tipos de ejercicio, audio TTS suena) → volver al camino → la lección aparece completada y la siguiente desbloqueada → cerrar sesión y volver a entrar → el progreso persiste.
- [ ] **Step 4: Registrar resultado** en `.superpowers/sdd/progress.md` y en la BITACORA si hubo hallazgos.

---

## Verificación final de la Fase 2

- [ ] `pnpm lint && pnpm build && pnpm test` en verde (core + api + api-client + web).
- [ ] Smoke del Task 17 completado con el recorrido de usuario real.
- [ ] Push a GitHub y CI en verde.
