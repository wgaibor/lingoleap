# LingoLeap Fase 1 — Plan de implementación (monorepo, backend hexagonal, pipeline de ingesta)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monorepo funcionando con backend NestJS hexagonal que ingesta contenido real (inglés A1) desde APIs gratuitas hacia Supabase y lo sirve por REST.

**Architecture:** Arquitectura hexagonal en `apps/api`: dominio puro en el centro, casos de uso con puertos (interfaces), adaptadores para Tatoeba/MyMemory/Pexels/FrequencyWords/Supabase en infraestructura. Tipos compartidos en `packages/core` (los consumirán web y mobile en fases 2 y 4). Las clases de application e infrastructure son TypeScript puro; NestJS solo las cablea con `useFactory` en los módulos.

**Tech Stack:** pnpm workspaces + Turborepo, TypeScript 5.8 strict, NestJS 11, Vitest 3 (+ unplugin-swc para decoradores), msw 2, supertest, zod, @supabase/supabase-js 2, dotenv.

## Global Constraints

- Node >= 22, pnpm 9. TypeScript `strict: true`; prohibido `any` explícito.
- Costo $0: solo Tatoeba API, MyMemory API, Pexels API (free), dataset FrequencyWords, Supabase free, Render free.
- Claves/URLs de servicios solo en `.env` del backend (nunca commiteadas; `.env` está en `.gitignore`).
- Los clientes nunca llaman APIs externas de contenido; solo el pipeline de ingesta lo hace.
- Regla de capas en `apps/api`: `domain/` no importa de Nest/supabase/adapters; `application/` solo importa de `domain/` y `@lingoleap/core`; `infrastructure/` implementa los puertos; `presentation/` solo llama casos de uso.
- Commits convencionales (`feat:`, `test:`, `chore:`, `docs:`) al final de cada tarea, terminando con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Idiomas v1: `en`, `pt-BR`, `it` (códigos exactos); niveles CEFR `A1`…`C2`; UI/mensajes de error en español.
- Directorio raíz del repo: `lingoleap/` (ya inicializado con git, rama `master`).

---

### Task 1: Andamiaje del monorepo

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.nvmrc`

**Interfaces:**
- Produces: workspace pnpm con carpetas `apps/*` y `packages/*`; scripts raíz `pnpm build|test|lint` vía Turborepo; `tsconfig.base.json` que los paquetes extienden.

- [ ] **Step 1: Crear archivos raíz**

`package.json`:
```json
{
  "name": "lingoleap",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "eslint ."
  },
  "devDependencies": {
    "turbo": "^2.5.0",
    "typescript": "^5.8.0",
    "eslint": "^9.20.0",
    "typescript-eslint": "^8.24.0",
    "@eslint/js": "^9.20.0"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test": { "dependsOn": ["^build"] }
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

`.gitignore`:
```
node_modules/
dist/
.turbo/
.env
*.log
coverage/
```

`.nvmrc`:
```
22
```

- [ ] **Step 2: Crear eslint.config.mjs en la raíz**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error'
    }
  }
);
```

- [ ] **Step 3: Instalar y verificar**

Run: `pnpm install` — Expected: lockfile creado sin errores.
Run: `pnpm build` — Expected: turbo corre y reporta 0 paquetes (aún no hay apps): `No tasks were executed` o similar, exit 0.
Run: `pnpm lint` — Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: andamiaje del monorepo con pnpm workspaces y turborepo"
```

---

### Task 2: `@lingoleap/core` — tipos compartidos y bandas CEFR

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`, `packages/core/src/types.ts`, `packages/core/src/exercises.ts`, `packages/core/src/cefr.ts`
- Test: `packages/core/src/cefr.spec.ts`

**Interfaces:**
- Produces (consumido por TODAS las tareas siguientes):
  - `type LearningLanguage = 'en' | 'pt-BR' | 'it'`
  - `type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'`
  - `const LANGUAGE_LABEL_ES: Record<LearningLanguage, string>`
  - `interface FrequencyBand { start: number; end: number }` y `function frequencyBandFor(level: CEFRLevel): FrequencyBand`
  - Tipos de contenido: `Exercise` (unión discriminada por `type`), `Lesson`, `Unit`, `Course`, `CourseSummary` (ver código abajo).

- [ ] **Step 1: Crear el paquete**

`packages/core/package.json`:
```json
{
  "name": "@lingoleap/core",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vitest": "^3.0.0"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"],
  "exclude": ["src/**/*.spec.ts"]
}
```

- [ ] **Step 2: Escribir los tipos**

`packages/core/src/types.ts`:
```ts
export type LearningLanguage = 'en' | 'pt-BR' | 'it';
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export const LEARNING_LANGUAGES: readonly LearningLanguage[] = ['en', 'pt-BR', 'it'];
export const CEFR_LEVELS: readonly CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export const LANGUAGE_LABEL_ES: Record<LearningLanguage, string> = {
  en: 'Inglés',
  'pt-BR': 'Portugués (Brasil)',
  it: 'Italiano'
};
```

`packages/core/src/exercises.ts`:
```ts
import type { CEFRLevel, LearningLanguage } from './types';

export interface ImageOption {
  label: string;
  imageUrl: string | null;
  correct: boolean;
}

export interface ImageSelectExercise {
  id: string;
  type: 'image-select';
  /** Palabra en español que el usuario debe identificar */
  prompt: string;
  options: ImageOption[];
}

export interface TranslateExercise {
  id: string;
  type: 'translate';
  /** Oración en el idioma que se aprende */
  sourceText: string;
  /** Traducción correcta al español */
  correctAnswer: string;
  /** Fichas desordenadas: tokens de la respuesta + distractores en español */
  wordBank: string[];
  /** Audio nativo de Tatoeba; null => el cliente usa TTS sobre sourceText */
  audioUrl: string | null;
}

export interface ListeningExercise {
  id: string;
  type: 'listening';
  /** Texto que suena (en el idioma que se aprende) */
  text: string;
  audioUrl: string | null;
  /** Tokens del texto + distractores en el idioma que se aprende */
  wordBank: string[];
}

export interface MatchPairsExercise {
  id: string;
  type: 'match-pairs';
  /** left: palabra en el idioma que se aprende; right: traducción al español */
  pairs: { left: string; right: string }[];
}

export type Exercise =
  | ImageSelectExercise
  | TranslateExercise
  | ListeningExercise
  | MatchPairsExercise;

export interface Lesson {
  id: string;
  title: string;
  position: number;
  exercises: Exercise[];
}

export interface Unit {
  id: string;
  title: string;
  position: number;
  lessons: Lesson[];
}

export interface CourseSummary {
  id: string;
  language: LearningLanguage;
  level: CEFRLevel;
  title: string;
}

export interface Course extends CourseSummary {
  units: Unit[];
}
```

`packages/core/src/index.ts`:
```ts
export * from './types';
export * from './exercises';
export * from './cefr';
```

- [ ] **Step 3: Test que falla para `frequencyBandFor`**

`packages/core/src/cefr.spec.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { frequencyBandFor } from './cefr';

describe('frequencyBandFor', () => {
  it('devuelve la banda de frecuencia de A1', () => {
    expect(frequencyBandFor('A1')).toEqual({ start: 1, end: 800 });
  });

  it('las bandas son contiguas y crecientes de A1 a C2', () => {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
    let previousEnd = 0;
    for (const level of levels) {
      const band = frequencyBandFor(level);
      expect(band.start).toBe(previousEnd + 1);
      expect(band.end).toBeGreaterThan(band.start);
      previousEnd = band.end;
    }
  });
});
```

Crear `packages/core/src/cefr.ts` vacío para que compile el import:
```ts
export {};
```

Run: `pnpm --filter @lingoleap/core test`
Expected: FAIL — `frequencyBandFor is not a function` / no exportado.

- [ ] **Step 4: Implementar**

`packages/core/src/cefr.ts`:
```ts
import type { CEFRLevel } from './types';

export interface FrequencyBand {
  start: number;
  end: number;
}

const BANDS: Record<CEFRLevel, FrequencyBand> = {
  A1: { start: 1, end: 800 },
  A2: { start: 801, end: 1800 },
  B1: { start: 1801, end: 3200 },
  B2: { start: 3201, end: 5000 },
  C1: { start: 5001, end: 8000 },
  C2: { start: 8001, end: 12000 }
};

export function frequencyBandFor(level: CEFRLevel): FrequencyBand {
  return BANDS[level];
}
```

- [ ] **Step 5: Verificar y commitear**

Run: `pnpm install && pnpm --filter @lingoleap/core test` — Expected: PASS (2 tests).
Run: `pnpm build` — Expected: `packages/core/dist/` generado.

```bash
git add -A
git commit -m "feat(core): tipos compartidos de contenido y bandas de frecuencia CEFR"
```

---

### Task 3: Esqueleto de `apps/api` — NestJS + Vitest + env

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`, `apps/api/vitest.config.ts`, `apps/api/.swcrc`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/presentation/health.controller.ts`, `apps/api/src/config/env.ts`, `apps/api/.env.example`
- Test: `apps/api/src/presentation/health.controller.spec.ts`, `apps/api/src/config/env.spec.ts`

**Interfaces:**
- Produces:
  - `loadEnv(source?: NodeJS.ProcessEnv): Env` donde `Env = { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; PEXELS_API_KEY: string; PORT: number }`
  - `const ENV: unique symbol` (token DI para inyectar `Env`)
  - `AppModule` (se irá ampliando en tareas 12-13)
  - Convención de tests: `*.spec.ts` junto al código, Vitest con SWC (necesario para decoradores de Nest).

- [ ] **Step 1: Crear el paquete api**

`apps/api/package.json`:
```json
{
  "name": "@lingoleap/api",
  "version": "0.1.0",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/main.js",
    "dev": "ts-node src/main.ts",
    "test": "vitest run",
    "ingest": "ts-node src/cli/ingest.cli.ts"
  },
  "dependencies": {
    "@lingoleap/core": "workspace:*",
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@supabase/supabase-js": "^2.48.0",
    "dotenv": "^16.4.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@nestjs/testing": "^11.0.0",
    "@swc/core": "^1.10.0",
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.0",
    "@types/supertest": "^6.0.0",
    "msw": "^2.7.0",
    "supertest": "^7.0.0",
    "ts-node": "^10.9.0",
    "typescript": "^5.8.0",
    "unplugin-swc": "^1.5.0",
    "vitest": "^3.0.0"
  }
}
```

`apps/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "baseUrl": "." },
  "include": ["src"]
}
```

`apps/api/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["src/**/*.spec.ts", "src/test-support/**"]
}
```

`apps/api/.swcrc`:
```json
{
  "jsc": {
    "parser": { "syntax": "typescript", "decorators": true },
    "transform": { "legacyDecorator": true, "decoratorMetadata": true },
    "target": "es2022"
  },
  "module": { "type": "commonjs" }
}
```

`apps/api/vitest.config.ts`:
```ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/*.spec.ts'],
    environment: 'node'
  },
  plugins: [swc.vite()]
});
```

- [ ] **Step 2: Test que falla para env**

`apps/api/src/config/env.spec.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const VALID = {
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  PEXELS_API_KEY: 'pexels-key'
};

describe('loadEnv', () => {
  it('parsea un entorno válido con PORT por defecto 3000', () => {
    const env = loadEnv(VALID);
    expect(env.SUPABASE_URL).toBe(VALID.SUPABASE_URL);
    expect(env.PORT).toBe(3000);
  });

  it('lanza si falta una clave obligatoria', () => {
    expect(() => loadEnv({ ...VALID, PEXELS_API_KEY: undefined })).toThrow();
  });
});
```

Run: `pnpm install && pnpm --filter @lingoleap/api test`
Expected: FAIL — módulo `./env` no existe.

- [ ] **Step 3: Implementar env**

`apps/api/src/config/env.ts`:
```ts
import { z } from 'zod';

const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  PEXELS_API_KEY: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000)
});

export type Env = z.infer<typeof EnvSchema>;

export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(source);
}
```

Run: `pnpm --filter @lingoleap/api test` — Expected: PASS.

- [ ] **Step 4: Test que falla para /health**

`apps/api/src/presentation/health.controller.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController]
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

Run: `pnpm --filter @lingoleap/api test` — Expected: FAIL — `health.controller` no existe.

- [ ] **Step 5: Implementar controller, módulo y main**

`apps/api/src/presentation/health.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
```

`apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { HealthController } from './presentation/health.controller';

@Module({
  controllers: [HealthController]
})
export class AppModule {}
```

`apps/api/src/main.ts`:
```ts
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  await app.listen(env.PORT);
}

void bootstrap();
```

`apps/api/.env.example`:
```
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
PEXELS_API_KEY=tu-clave-de-pexels
PORT=3000
```

- [ ] **Step 6: Verificar y commitear**

Run: `pnpm --filter @lingoleap/api test` — Expected: PASS (4 tests).
Run: `pnpm build` — Expected: compila core y api.

```bash
git add -A
git commit -m "feat(api): esqueleto NestJS con vitest, validación de entorno y /health"
```

---

### Task 4: Dominio — factorías con invariantes y errores

**Files:**
- Create: `apps/api/src/domain/errors.ts`, `apps/api/src/domain/content.factory.ts`
- Test: `apps/api/src/domain/content.factory.spec.ts`

**Interfaces:**
- Consumes: tipos de `@lingoleap/core` (`Course`, `Unit`, `Lesson`, `Exercise`, `LearningLanguage`, `CEFRLevel`, `LANGUAGE_LABEL_ES`).
- Produces:
  - `abstract class DomainError extends Error { abstract readonly code: string }`
  - `class CourseNotFoundError extends DomainError` (code `COURSE_NOT_FOUND`), `class LessonNotFoundError` (code `LESSON_NOT_FOUND`), `class InvalidContentError` (code `INVALID_CONTENT`)
  - `createLesson(input: { title: string; position: number; exercises: Exercise[] }): Lesson` — lanza `InvalidContentError` si no hay ejercicios
  - `createUnit(input: { title: string; position: number; lessons: Lesson[] }): Unit` — lanza si no hay lecciones
  - `createCourse(input: { language: LearningLanguage; level: CEFRLevel; units: Unit[] }): Course` — lanza si no hay unidades; `title` se autogenera: `` `${LANGUAGE_LABEL_ES[language]} ${level}` `` (ej. `Inglés A1`); ids con `crypto.randomUUID()`

- [ ] **Step 1: Test que falla**

`apps/api/src/domain/content.factory.spec.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Exercise } from '@lingoleap/core';
import { createCourse, createLesson, createUnit } from './content.factory';
import { InvalidContentError } from './errors';

const exercise: Exercise = {
  id: 'e1',
  type: 'match-pairs',
  pairs: [{ left: 'water', right: 'agua' }]
};

describe('factorías de contenido', () => {
  it('crea una lección válida con id generado', () => {
    const lesson = createLesson({ title: 'Lección 1', position: 1, exercises: [exercise] });
    expect(lesson.id).toMatch(/[0-9a-f-]{36}/);
    expect(lesson.exercises).toHaveLength(1);
  });

  it('rechaza lección sin ejercicios', () => {
    expect(() => createLesson({ title: 'Vacía', position: 1, exercises: [] })).toThrow(
      InvalidContentError
    );
  });

  it('crea un curso con título autogenerado en español', () => {
    const lesson = createLesson({ title: 'Lección 1', position: 1, exercises: [exercise] });
    const unit = createUnit({ title: 'Unidad 1', position: 1, lessons: [lesson] });
    const course = createCourse({ language: 'en', level: 'A1', units: [unit] });
    expect(course.title).toBe('Inglés A1');
  });

  it('rechaza unidad sin lecciones y curso sin unidades', () => {
    expect(() => createUnit({ title: 'U', position: 1, lessons: [] })).toThrow(InvalidContentError);
    expect(() => createCourse({ language: 'en', level: 'A1', units: [] })).toThrow(
      InvalidContentError
    );
  });
});
```

Run: `pnpm --filter @lingoleap/api test` — Expected: FAIL — módulos no existen.

- [ ] **Step 2: Implementar errores y factorías**

`apps/api/src/domain/errors.ts`:
```ts
export abstract class DomainError extends Error {
  abstract readonly code: string;
}

export class CourseNotFoundError extends DomainError {
  readonly code = 'COURSE_NOT_FOUND';
  constructor(reference: string) {
    super(`Curso no encontrado: ${reference}`);
  }
}

export class LessonNotFoundError extends DomainError {
  readonly code = 'LESSON_NOT_FOUND';
  constructor(lessonId: string) {
    super(`Lección no encontrada: ${lessonId}`);
  }
}

export class InvalidContentError extends DomainError {
  readonly code = 'INVALID_CONTENT';
}
```

`apps/api/src/domain/content.factory.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type { CEFRLevel, Course, Exercise, LearningLanguage, Lesson, Unit } from '@lingoleap/core';
import { LANGUAGE_LABEL_ES } from '@lingoleap/core';
import { InvalidContentError } from './errors';

export function createLesson(input: {
  title: string;
  position: number;
  exercises: Exercise[];
}): Lesson {
  if (input.exercises.length === 0) {
    throw new InvalidContentError(`La lección "${input.title}" no tiene ejercicios`);
  }
  return { id: randomUUID(), ...input };
}

export function createUnit(input: { title: string; position: number; lessons: Lesson[] }): Unit {
  if (input.lessons.length === 0) {
    throw new InvalidContentError(`La unidad "${input.title}" no tiene lecciones`);
  }
  return { id: randomUUID(), ...input };
}

export function createCourse(input: {
  language: LearningLanguage;
  level: CEFRLevel;
  units: Unit[];
}): Course {
  if (input.units.length === 0) {
    throw new InvalidContentError('El curso no tiene unidades');
  }
  return {
    id: randomUUID(),
    language: input.language,
    level: input.level,
    title: `${LANGUAGE_LABEL_ES[input.language]} ${input.level}`,
    units: input.units
  };
}
```

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm --filter @lingoleap/api test` — Expected: PASS.

```bash
git add -A
git commit -m "feat(api): dominio con factorías de contenido y errores semánticos"
```

---

### Task 5: Composición de ejercicios (funciones puras)

**Files:**
- Create: `apps/api/src/application/content/exercise-composer.ts`
- Test: `apps/api/src/application/content/exercise-composer.spec.ts`

**Interfaces:**
- Consumes: tipos de `@lingoleap/core`; `createLesson`, `createUnit` de `../../domain/content.factory`.
- Produces (usado por Task 6):
  - `type Random = () => number`
  - `interface WordMaterial { word: string; translationEs: string; sentence: { text: string; translationEs: string; audioUrl: string | null }; imageUrl: string | null }`
  - `shuffle<T>(items: readonly T[], random: Random): T[]` (Fisher-Yates, no muta)
  - `tokenize(sentence: string): string[]` (separa por espacios, quita puntuación `.,;:!?¿¡"()`, descarta tokens vacíos)
  - `composeWordExercises(material: WordMaterial, distractors: WordMaterial[], random: Random): Exercise[]`
  - `composeMatchPairs(materials: WordMaterial[], random: Random): MatchPairsExercise[]`
  - `chunkIntoLessons(exercises: Exercise[], perLesson?: number): Lesson[]` (default 10, títulos `Lección N`)
  - `groupIntoUnits(lessons: Lesson[], perUnit?: number): Unit[]` (default 5, títulos `Unidad N`)

Reglas de composición (implementar exactamente esto):
- `composeWordExercises` produce SIEMPRE `translate` y `listening`; produce `image-select` SOLO si `material.imageUrl !== null` y hay ≥3 distractores con `imageUrl !== null`.
  - `translate`: `sourceText` = oración original; `correctAnswer` = traducción ES; `wordBank` = shuffle(tokens de la traducción ES + hasta 4 tokens ES de distractores que no estén ya en la respuesta).
  - `listening`: `text` = oración original; `wordBank` = shuffle(tokens del texto + hasta 4 tokens del idioma origen de distractores no repetidos).
  - `image-select`: `prompt` = `material.translationEs`; `options` = shuffle(1 correcta + 3 distractores con imagen), todas con `label` = palabra en el idioma que se aprende.
- `composeMatchPairs`: agrupa materiales de 5 en 5 (`pairs: { left: word, right: translationEs }`); el último grupo se descarta si tiene <3 pares.
- ids con `crypto.randomUUID()`.

- [ ] **Step 1: Tests que fallan**

`apps/api/src/application/content/exercise-composer.spec.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { ImageSelectExercise, TranslateExercise } from '@lingoleap/core';
import {
  chunkIntoLessons,
  composeMatchPairs,
  composeWordExercises,
  groupIntoUnits,
  shuffle,
  tokenize,
  type Random,
  type WordMaterial
} from './exercise-composer';

function seeded(seed = 42): Random {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function material(word: string, translationEs: string, imageUrl: string | null): WordMaterial {
  return {
    word,
    translationEs,
    sentence: {
      text: `I drink ${word} every day.`,
      translationEs: `Yo bebo ${translationEs} cada día.`,
      audioUrl: null
    },
    imageUrl
  };
}

const withImages = [
  material('water', 'agua', 'https://img/water.jpg'),
  material('milk', 'leche', 'https://img/milk.jpg'),
  material('coffee', 'café', 'https://img/coffee.jpg'),
  material('tea', 'té', 'https://img/tea.jpg')
];

describe('tokenize', () => {
  it('separa palabras y quita puntuación', () => {
    expect(tokenize('Yo bebo agua, ¿cada día!')).toEqual(['Yo', 'bebo', 'agua', 'cada', 'día']);
  });
});

describe('shuffle', () => {
  it('devuelve una permutación sin mutar el original', () => {
    const original = [1, 2, 3, 4, 5];
    const result = shuffle(original, seeded());
    expect(result).not.toBe(original);
    expect([...result].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('composeWordExercises', () => {
  it('genera translate, listening e image-select cuando hay imágenes', () => {
    const [target, ...distractors] = withImages;
    const exercises = composeWordExercises(target, distractors, seeded());
    const types = exercises.map((e) => e.type).sort();
    expect(types).toEqual(['image-select', 'listening', 'translate']);

    const translate = exercises.find((e) => e.type === 'translate') as TranslateExercise;
    expect(translate.correctAnswer).toBe('Yo bebo agua cada día.');
    for (const token of tokenize(translate.correctAnswer)) {
      expect(translate.wordBank).toContain(token);
    }

    const imageSelect = exercises.find((e) => e.type === 'image-select') as ImageSelectExercise;
    expect(imageSelect.prompt).toBe('agua');
    expect(imageSelect.options).toHaveLength(4);
    expect(imageSelect.options.filter((o) => o.correct)).toHaveLength(1);
  });

  it('omite image-select si el material no tiene imagen', () => {
    const target = material('idea', 'idea', null);
    const exercises = composeWordExercises(target, withImages, seeded());
    expect(exercises.map((e) => e.type).sort()).toEqual(['listening', 'translate']);
  });
});

describe('composeMatchPairs', () => {
  it('agrupa de 5 en 5 y descarta restos menores a 3', () => {
    const materials = Array.from({ length: 12 }, (_, i) => material(`w${i}`, `t${i}`, null));
    const result = composeMatchPairs(materials, seeded());
    expect(result).toHaveLength(2);
    expect(result[0].pairs).toHaveLength(5);
  });
});

describe('chunkIntoLessons y groupIntoUnits', () => {
  it('parte 23 ejercicios en 3 lecciones y las agrupa en 1 unidad', () => {
    const materials = withImages;
    const exercises = materials.flatMap((m) =>
      composeWordExercises(m, materials.filter((x) => x !== m), seeded())
    );
    const many = [...exercises, ...exercises].slice(0, 23);
    const lessons = chunkIntoLessons(many);
    expect(lessons).toHaveLength(3);
    expect(lessons[0].title).toBe('Lección 1');
    expect(lessons[0].exercises).toHaveLength(10);

    const units = groupIntoUnits(lessons);
    expect(units).toHaveLength(1);
    expect(units[0].title).toBe('Unidad 1');
  });
});
```

Run: `pnpm --filter @lingoleap/api test` — Expected: FAIL — módulo no existe.

- [ ] **Step 2: Implementar**

`apps/api/src/application/content/exercise-composer.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type { Exercise, Lesson, MatchPairsExercise, Unit } from '@lingoleap/core';
import { createLesson, createUnit } from '../../domain/content.factory';

export type Random = () => number;

export interface WordMaterial {
  word: string;
  translationEs: string;
  sentence: { text: string; translationEs: string; audioUrl: string | null };
  imageUrl: string | null;
}

export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function tokenize(sentence: string): string[] {
  return sentence
    .split(/\s+/)
    .map((token) => token.replace(/[.,;:!?¿¡"()]/g, ''))
    .filter((token) => token.length > 0);
}

function distractorTokens(
  correct: string[],
  candidates: string[],
  limit: number,
  random: Random
): string[] {
  const correctSet = new Set(correct.map((t) => t.toLowerCase()));
  const unique = [...new Set(candidates.filter((t) => !correctSet.has(t.toLowerCase())))];
  return shuffle(unique, random).slice(0, limit);
}

export function composeWordExercises(
  material: WordMaterial,
  distractors: WordMaterial[],
  random: Random
): Exercise[] {
  const exercises: Exercise[] = [];
  const { sentence } = material;

  const answerTokens = tokenize(sentence.translationEs);
  exercises.push({
    id: randomUUID(),
    type: 'translate',
    sourceText: sentence.text,
    correctAnswer: sentence.translationEs,
    wordBank: shuffle(
      [
        ...answerTokens,
        ...distractorTokens(
          answerTokens,
          distractors.flatMap((d) => tokenize(d.sentence.translationEs)),
          4,
          random
        )
      ],
      random
    ),
    audioUrl: sentence.audioUrl
  });

  const textTokens = tokenize(sentence.text);
  exercises.push({
    id: randomUUID(),
    type: 'listening',
    text: sentence.text,
    audioUrl: sentence.audioUrl,
    wordBank: shuffle(
      [
        ...textTokens,
        ...distractorTokens(
          textTokens,
          distractors.flatMap((d) => tokenize(d.sentence.text)),
          4,
          random
        )
      ],
      random
    )
  });

  const imageDistractors = distractors.filter((d) => d.imageUrl !== null);
  if (material.imageUrl !== null && imageDistractors.length >= 3) {
    const options = shuffle(
      [
        { label: material.word, imageUrl: material.imageUrl, correct: true },
        ...shuffle(imageDistractors, random)
          .slice(0, 3)
          .map((d) => ({ label: d.word, imageUrl: d.imageUrl, correct: false }))
      ],
      random
    );
    exercises.push({
      id: randomUUID(),
      type: 'image-select',
      prompt: material.translationEs,
      options
    });
  }

  return exercises;
}

export function composeMatchPairs(
  materials: WordMaterial[],
  random: Random
): MatchPairsExercise[] {
  const result: MatchPairsExercise[] = [];
  for (let i = 0; i < materials.length; i += 5) {
    const group = materials.slice(i, i + 5);
    if (group.length < 3) {
      continue;
    }
    result.push({
      id: randomUUID(),
      type: 'match-pairs',
      pairs: shuffle(group, random).map((m) => ({ left: m.word, right: m.translationEs }))
    });
  }
  return result;
}

export function chunkIntoLessons(exercises: Exercise[], perLesson = 10): Lesson[] {
  const lessons: Lesson[] = [];
  for (let i = 0; i < exercises.length; i += perLesson) {
    const slice = exercises.slice(i, i + perLesson);
    lessons.push(
      createLesson({
        title: `Lección ${lessons.length + 1}`,
        position: lessons.length + 1,
        exercises: slice
      })
    );
  }
  return lessons;
}

export function groupIntoUnits(lessons: Lesson[], perUnit = 5): Unit[] {
  const units: Unit[] = [];
  for (let i = 0; i < lessons.length; i += perUnit) {
    units.push(
      createUnit({
        title: `Unidad ${units.length + 1}`,
        position: units.length + 1,
        lessons: lessons.slice(i, i + perUnit)
      })
    );
  }
  return units;
}
```

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm --filter @lingoleap/api test` — Expected: PASS.

```bash
git add -A
git commit -m "feat(api): composición pura de ejercicios, lecciones y unidades"
```

---

### Task 6: Puertos + caso de uso IngestContent

**Files:**
- Create: `apps/api/src/application/ports/vocabulary-provider.port.ts`, `apps/api/src/application/ports/translation-provider.port.ts`, `apps/api/src/application/ports/sentence-provider.port.ts`, `apps/api/src/application/ports/image-provider.port.ts`, `apps/api/src/application/ports/course.repository.ts`, `apps/api/src/application/use-cases/ingest-content.use-case.ts`
- Test: `apps/api/src/application/use-cases/ingest-content.use-case.spec.ts`

**Interfaces:**
- Consumes: Task 5 (`composeWordExercises`, `composeMatchPairs`, `chunkIntoLessons`, `groupIntoUnits`, `WordMaterial`, `Random`); Task 4 (`createCourse`); `frequencyBandFor` de core.
- Produces (los adaptadores de Tasks 7-11 implementan estos puertos; Task 12 los cablea):

```ts
// vocabulary-provider.port.ts
import type { FrequencyBand, LearningLanguage } from '@lingoleap/core';
export interface VocabularyProvider {
  topWords(language: LearningLanguage, band: FrequencyBand, limit: number): Promise<string[]>;
}
export const VOCABULARY_PROVIDER = Symbol('VocabularyProvider');

// translation-provider.port.ts
import type { LearningLanguage } from '@lingoleap/core';
export interface TranslationProvider {
  translateToSpanish(word: string, language: LearningLanguage): Promise<string | null>;
}
export const TRANSLATION_PROVIDER = Symbol('TranslationProvider');

// sentence-provider.port.ts
import type { LearningLanguage } from '@lingoleap/core';
export interface ExampleSentence {
  text: string;
  translationEs: string;
  audioUrl: string | null;
}
export interface SentenceProvider {
  findExampleSentence(word: string, language: LearningLanguage): Promise<ExampleSentence | null>;
}
export const SENTENCE_PROVIDER = Symbol('SentenceProvider');

// image-provider.port.ts
export interface ImageProvider {
  findImageUrl(term: string): Promise<string | null>;
}
export const IMAGE_PROVIDER = Symbol('ImageProvider');

// course.repository.ts
import type { CEFRLevel, Course, CourseSummary, LearningLanguage, Lesson } from '@lingoleap/core';
export interface CourseRepository {
  /** Reemplaza el curso existente para (language, level) si lo hay */
  saveCourse(course: Course): Promise<void>;
  findByLanguageAndLevel(language: LearningLanguage, level: CEFRLevel): Promise<Course | null>;
  listSummaries(): Promise<CourseSummary[]>;
  findLessonById(lessonId: string): Promise<Lesson | null>;
}
export const COURSE_REPOSITORY = Symbol('CourseRepository');
```

  - Caso de uso:
```ts
export interface IngestCommand {
  language: LearningLanguage;
  level: CEFRLevel;
  wordLimit?: number; // default 40
}
export interface IngestReport {
  language: LearningLanguage;
  level: CEFRLevel;
  wordsRequested: number;
  materialsBuilt: number;
  skippedWords: string[];
  exerciseCount: number;
  lessonCount: number;
  unitCount: number;
}
export interface IngestDependencies {
  vocabulary: VocabularyProvider;
  translations: TranslationProvider;
  sentences: SentenceProvider;
  images: ImageProvider;
  courses: CourseRepository;
  random?: Random;
}
export class IngestContentUseCase {
  constructor(deps: IngestDependencies) {}
  execute(command: IngestCommand): Promise<IngestReport>;
}
```

Lógica exacta de `execute`:
1. `band = frequencyBandFor(level)`; `words = await vocabulary.topWords(language, band, wordLimit ?? 40)`.
2. Por cada palabra (secuencial): `translationEs = await translations.translateToSpanish(...)` — si `null`, agrega a `skippedWords` y continúa; `sentence = await sentences.findExampleSentence(...)` — si `null`, skip igual; `imageUrl = await images.findImageUrl(word)` (puede ser null). Arma `WordMaterial`.
3. `exercises = materials.flatMap(m => composeWordExercises(m, materials sin m, random)) + composeMatchPairs(materials, random)`.
4. `lessons = chunkIntoLessons(exercises)`; `units = groupIntoUnits(lessons)`; `course = createCourse({ language, level, units })`.
5. `await courses.saveCourse(course)`; devuelve el reporte.
6. Si tras el paso 2 hay 0 materiales, lanza `InvalidContentError` (no guarda nada).

- [ ] **Step 1: Crear los 5 archivos de puertos** con el código exacto del bloque Interfaces de arriba (un archivo por puerto).

- [ ] **Step 2: Test que falla para el caso de uso**

`apps/api/src/application/use-cases/ingest-content.use-case.spec.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Course, CourseSummary, LearningLanguage, Lesson } from '@lingoleap/core';
import type { CourseRepository } from '../ports/course.repository';
import type { ExampleSentence } from '../ports/sentence-provider.port';
import { IngestContentUseCase } from './ingest-content.use-case';
import { InvalidContentError } from '../../domain/errors';

class FakeCourseRepository implements CourseRepository {
  saved: Course[] = [];
  async saveCourse(course: Course): Promise<void> {
    this.saved.push(course);
  }
  async findByLanguageAndLevel(): Promise<Course | null> {
    return null;
  }
  async listSummaries(): Promise<CourseSummary[]> {
    return [];
  }
  async findLessonById(): Promise<Lesson | null> {
    return null;
  }
}

const WORDS = ['water', 'milk', 'coffee', 'tea', 'bread', 'apple'];

function makeUseCase(overrides?: {
  translate?: (word: string) => Promise<string | null>;
  sentence?: (word: string) => Promise<ExampleSentence | null>;
}) {
  const repo = new FakeCourseRepository();
  const useCase = new IngestContentUseCase({
    vocabulary: {
      topWords: async (_l: LearningLanguage, _b, limit: number) => WORDS.slice(0, limit)
    },
    translations: {
      translateToSpanish: overrides?.translate ?? (async (word) => `es-${word}`)
    },
    sentences: {
      findExampleSentence:
        overrides?.sentence ??
        (async (word) => ({
          text: `I like ${word}.`,
          translationEs: `Me gusta es-${word}.`,
          audioUrl: null
        }))
    },
    images: { findImageUrl: async (term) => `https://img/${term}.jpg` },
    courses: repo,
    random: () => 0.42
  });
  return { useCase, repo };
}

describe('IngestContentUseCase', () => {
  it('ingesta un curso completo y devuelve el reporte', async () => {
    const { useCase, repo } = makeUseCase();
    const report = await useCase.execute({ language: 'en', level: 'A1', wordLimit: 6 });

    expect(report.wordsRequested).toBe(6);
    expect(report.materialsBuilt).toBe(6);
    expect(report.skippedWords).toEqual([]);
    expect(report.exerciseCount).toBeGreaterThan(6);
    expect(report.unitCount).toBeGreaterThanOrEqual(1);
    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0].title).toBe('Inglés A1');
  });

  it('salta palabras sin traducción o sin oración y sigue', async () => {
    const { useCase, repo } = makeUseCase({
      translate: async (word) => (word === 'milk' ? null : `es-${word}`),
      sentence: async (word) =>
        word === 'tea'
          ? null
          : { text: `I like ${word}.`, translationEs: `Me gusta es-${word}.`, audioUrl: null }
    });
    const report = await useCase.execute({ language: 'en', level: 'A1', wordLimit: 6 });
    expect(report.skippedWords.sort()).toEqual(['milk', 'tea']);
    expect(report.materialsBuilt).toBe(4);
    expect(repo.saved).toHaveLength(1);
  });

  it('lanza InvalidContentError si no se pudo construir ningún material', async () => {
    const { useCase } = makeUseCase({ translate: async () => null });
    await expect(useCase.execute({ language: 'en', level: 'A1', wordLimit: 6 })).rejects.toThrow(
      InvalidContentError
    );
  });
});
```

Run: `pnpm --filter @lingoleap/api test` — Expected: FAIL — `ingest-content.use-case` no existe.

- [ ] **Step 3: Implementar el caso de uso**

`apps/api/src/application/use-cases/ingest-content.use-case.ts`:
```ts
import type { CEFRLevel, LearningLanguage } from '@lingoleap/core';
import { frequencyBandFor } from '@lingoleap/core';
import { createCourse } from '../../domain/content.factory';
import { InvalidContentError } from '../../domain/errors';
import {
  chunkIntoLessons,
  composeMatchPairs,
  composeWordExercises,
  groupIntoUnits,
  type Random,
  type WordMaterial
} from '../content/exercise-composer';
import type { CourseRepository } from '../ports/course.repository';
import type { ImageProvider } from '../ports/image-provider.port';
import type { SentenceProvider } from '../ports/sentence-provider.port';
import type { TranslationProvider } from '../ports/translation-provider.port';
import type { VocabularyProvider } from '../ports/vocabulary-provider.port';

export interface IngestCommand {
  language: LearningLanguage;
  level: CEFRLevel;
  wordLimit?: number;
}

export interface IngestReport {
  language: LearningLanguage;
  level: CEFRLevel;
  wordsRequested: number;
  materialsBuilt: number;
  skippedWords: string[];
  exerciseCount: number;
  lessonCount: number;
  unitCount: number;
}

export interface IngestDependencies {
  vocabulary: VocabularyProvider;
  translations: TranslationProvider;
  sentences: SentenceProvider;
  images: ImageProvider;
  courses: CourseRepository;
  random?: Random;
}

const DEFAULT_WORD_LIMIT = 40;

export class IngestContentUseCase {
  constructor(private readonly deps: IngestDependencies) {}

  async execute(command: IngestCommand): Promise<IngestReport> {
    const { language, level } = command;
    const wordLimit = command.wordLimit ?? DEFAULT_WORD_LIMIT;
    const random = this.deps.random ?? Math.random;

    const band = frequencyBandFor(level);
    const words = await this.deps.vocabulary.topWords(language, band, wordLimit);

    const materials: WordMaterial[] = [];
    const skippedWords: string[] = [];

    for (const word of words) {
      const translationEs = await this.deps.translations.translateToSpanish(word, language);
      if (translationEs === null) {
        skippedWords.push(word);
        continue;
      }
      const sentence = await this.deps.sentences.findExampleSentence(word, language);
      if (sentence === null) {
        skippedWords.push(word);
        continue;
      }
      const imageUrl = await this.deps.images.findImageUrl(word);
      materials.push({ word, translationEs, sentence, imageUrl });
    }

    if (materials.length === 0) {
      throw new InvalidContentError(
        `No se pudo construir contenido para ${language} ${level}: todas las palabras fueron saltadas`
      );
    }

    const exercises = [
      ...materials.flatMap((material) =>
        composeWordExercises(
          material,
          materials.filter((other) => other !== material),
          random
        )
      ),
      ...composeMatchPairs(materials, random)
    ];

    const lessons = chunkIntoLessons(exercises);
    const units = groupIntoUnits(lessons);
    const course = createCourse({ language, level, units });
    await this.deps.courses.saveCourse(course);

    return {
      language,
      level,
      wordsRequested: words.length,
      materialsBuilt: materials.length,
      skippedWords,
      exerciseCount: exercises.length,
      lessonCount: lessons.length,
      unitCount: units.length
    };
  }
}
```

- [ ] **Step 4: Verificar y commitear**

Run: `pnpm --filter @lingoleap/api test` — Expected: PASS.

```bash
git add -A
git commit -m "feat(api): puertos de la aplicación y caso de uso de ingesta de contenido"
```

---

### Task 7: Helper HTTP con reintentos + adaptador Tatoeba

**Files:**
- Create: `apps/api/src/infrastructure/http/fetch-json.ts`, `apps/api/src/infrastructure/providers/tatoeba/tatoeba-sentence.provider.ts`
- Test: `apps/api/src/infrastructure/http/fetch-json.spec.ts`, `apps/api/src/infrastructure/providers/tatoeba/tatoeba-sentence.provider.spec.ts`

**Interfaces:**
- Consumes: `SentenceProvider`, `ExampleSentence` (Task 6).
- Produces:
  - `fetchJson(url: string, init?: RequestInit, retries?: number): Promise<unknown>` — reintenta en 429/5xx/error de red con backoff `500ms * 2^intento` (default 3 reintentos); en 4xx (≠429) devuelve `null`; parsea JSON.
  - `class TatoebaSentenceProvider implements SentenceProvider { constructor(baseUrl?: string) }` — `baseUrl` default `https://api.tatoeba.org`.

- [ ] **Step 1: Verificar la forma real de la API de Tatoeba**

Run (PowerShell o bash):
```bash
curl -s "https://api.tatoeba.org/unstable/sentences?lang=eng&q=water&trans%3Alang=spa&limit=3"
```
Guardar la respuesta real en `apps/api/src/infrastructure/providers/tatoeba/tatoeba-fixture.json` (recortada a 1-2 resultados). **Si la forma difiere de la asumida abajo (campos `data[].text`, `data[].translations` anidado, `data[].audios[].download_url`), ajustar el mapper y el fixture antes de seguir.** Documentar en un comentario del provider la fecha de verificación.

- [ ] **Step 2: Test que falla para fetchJson**

`apps/api/src/infrastructure/http/fetch-json.spec.ts`:
```ts
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fetchJson } from './fetch-json';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('fetchJson', () => {
  it('devuelve el JSON en éxito', async () => {
    server.use(http.get('https://x.test/ok', () => HttpResponse.json({ hello: 'world' })));
    await expect(fetchJson('https://x.test/ok')).resolves.toEqual({ hello: 'world' });
  });

  it('reintenta ante 500 y termina en éxito', async () => {
    let calls = 0;
    server.use(
      http.get('https://x.test/flaky', () => {
        calls++;
        return calls < 3 ? new HttpResponse(null, { status: 500 }) : HttpResponse.json({ ok: true });
      })
    );
    await expect(fetchJson('https://x.test/flaky', undefined, 3)).resolves.toEqual({ ok: true });
    expect(calls).toBe(3);
  });

  it('devuelve null en 404 sin reintentar', async () => {
    let calls = 0;
    server.use(
      http.get('https://x.test/missing', () => {
        calls++;
        return new HttpResponse(null, { status: 404 });
      })
    );
    await expect(fetchJson('https://x.test/missing')).resolves.toBeNull();
    expect(calls).toBe(1);
  });
});
```

Run: `pnpm --filter @lingoleap/api test` — Expected: FAIL.

Nota: para que los tests con backoff no tarden, `fetchJson` acepta el delay base por parámetro interno — ver implementación (en tests el server responde al 3er intento; 500ms+1000ms de espera es aceptable, no hace falta fake timers).

- [ ] **Step 3: Implementar fetchJson**

`apps/api/src/infrastructure/http/fetch-json.ts`:
```ts
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export async function fetchJson(
  url: string,
  init?: RequestInit,
  retries = 3,
  baseDelayMs = 500
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }
      await sleep(baseDelayMs * 2 ** attempt);
      continue;
    }

    if (response.ok) {
      return response.json();
    }
    if (!RETRYABLE_STATUS.has(response.status)) {
      return null;
    }
    if (attempt >= retries) {
      throw new Error(`HTTP ${response.status} en ${url} tras ${retries + 1} intentos`);
    }
    await sleep(baseDelayMs * 2 ** attempt);
  }
}
```

Run: `pnpm --filter @lingoleap/api test` — Expected: PASS (los de fetchJson).

- [ ] **Step 4: Test que falla para el provider de Tatoeba**

`apps/api/src/infrastructure/providers/tatoeba/tatoeba-sentence.provider.spec.ts`:
```ts
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TatoebaSentenceProvider } from './tatoeba-sentence.provider';
import fixture from './tatoeba-fixture.json';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE = 'https://tatoeba.test';

describe('TatoebaSentenceProvider', () => {
  it('mapea la primera oración con traducción al español', async () => {
    server.use(
      http.get(`${BASE}/unstable/sentences`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('lang')).toBe('eng');
        expect(url.searchParams.get('q')).toBe('water');
        return HttpResponse.json(fixture);
      })
    );
    const provider = new TatoebaSentenceProvider(BASE);
    const sentence = await provider.findExampleSentence('water', 'en');
    expect(sentence).not.toBeNull();
    expect(sentence?.text.toLowerCase()).toContain('water');
    expect(sentence?.translationEs.length).toBeGreaterThan(0);
  });

  it('devuelve null si no hay resultados', async () => {
    server.use(
      http.get(`${BASE}/unstable/sentences`, () => HttpResponse.json({ data: [] }))
    );
    const provider = new TatoebaSentenceProvider(BASE);
    await expect(provider.findExampleSentence('zzzz', 'en')).resolves.toBeNull();
  });
});
```

Run: `pnpm --filter @lingoleap/api test` — Expected: FAIL.

- [ ] **Step 5: Implementar el provider**

`apps/api/src/infrastructure/providers/tatoeba/tatoeba-sentence.provider.ts` (ajustar el mapeo al fixture real capturado en Step 1):
```ts
import type { LearningLanguage } from '@lingoleap/core';
import type { ExampleSentence, SentenceProvider } from '../../../application/ports/sentence-provider.port';
import { fetchJson } from '../../http/fetch-json';

// Forma de respuesta verificada contra api.tatoeba.org el 2026-07-XX (ver tatoeba-fixture.json)
interface TatoebaAudio {
  download_url?: string | null;
}
interface TatoebaTranslation {
  lang: string;
  text: string;
}
interface TatoebaSentence {
  text: string;
  audios?: TatoebaAudio[];
  translations?: TatoebaTranslation[][];
}
interface TatoebaResponse {
  data?: TatoebaSentence[];
}

const TATOEBA_LANG: Record<LearningLanguage, string> = {
  en: 'eng',
  'pt-BR': 'por',
  it: 'ita'
};

export class TatoebaSentenceProvider implements SentenceProvider {
  constructor(private readonly baseUrl = 'https://api.tatoeba.org') {}

  async findExampleSentence(
    word: string,
    language: LearningLanguage
  ): Promise<ExampleSentence | null> {
    const params = new URLSearchParams({
      lang: TATOEBA_LANG[language],
      q: word,
      'trans:lang': 'spa',
      limit: '10',
      sort: 'words'
    });
    const body = (await fetchJson(
      `${this.baseUrl}/unstable/sentences?${params.toString()}`
    )) as TatoebaResponse | null;

    for (const sentence of body?.data ?? []) {
      const spanish = (sentence.translations ?? [])
        .flat()
        .find((translation) => translation.lang === 'spa');
      if (!spanish) {
        continue;
      }
      return {
        text: sentence.text,
        translationEs: spanish.text,
        audioUrl: sentence.audios?.[0]?.download_url ?? null
      };
    }
    return null;
  }
}
```

Nota: para importar JSON agrega `"resolveJsonModule": true` a `apps/api/tsconfig.json` (`compilerOptions`).

- [ ] **Step 6: Verificar y commitear**

Run: `pnpm --filter @lingoleap/api test` — Expected: PASS.

```bash
git add -A
git commit -m "feat(api): adaptador de oraciones Tatoeba con reintentos http"
```

---

### Task 8: Adaptador MyMemory (traducción de palabras)

**Files:**
- Create: `apps/api/src/infrastructure/providers/mymemory/mymemory-translation.provider.ts`
- Test: `apps/api/src/infrastructure/providers/mymemory/mymemory-translation.provider.spec.ts`

**Interfaces:**
- Consumes: `TranslationProvider` (Task 6), `fetchJson` (Task 7).
- Produces: `class MyMemoryTranslationProvider implements TranslationProvider { constructor(baseUrl?: string) }` — default `https://api.mymemory.translated.net`.

Mapeo de idiomas fuente: `en → en`, `pt-BR → pt-BR`, `it → it` (MyMemory acepta esos códigos en `langpair=<src>|es`).
Regla: si `responseData.translatedText` está vacío, es igual (case-insensitive) a la palabra original, o `responseStatus !== 200` → devolver `null`. Devolver la traducción en minúsculas y sin espacios extremos.

- [ ] **Step 1: Test que falla**

`apps/api/src/infrastructure/providers/mymemory/mymemory-translation.provider.spec.ts`:
```ts
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MyMemoryTranslationProvider } from './mymemory-translation.provider';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE = 'https://mymemory.test';

function respond(translatedText: string, status = 200) {
  return HttpResponse.json({ responseStatus: status, responseData: { translatedText } });
}

describe('MyMemoryTranslationProvider', () => {
  it('traduce una palabra al español', async () => {
    server.use(
      http.get(`${BASE}/get`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('q')).toBe('water');
        expect(url.searchParams.get('langpair')).toBe('en|es');
        return respond('Agua ');
      })
    );
    const provider = new MyMemoryTranslationProvider(BASE);
    await expect(provider.translateToSpanish('water', 'en')).resolves.toBe('agua');
  });

  it('devuelve null si la "traducción" es la misma palabra', async () => {
    server.use(http.get(`${BASE}/get`, () => respond('WATER')));
    const provider = new MyMemoryTranslationProvider(BASE);
    await expect(provider.translateToSpanish('water', 'en')).resolves.toBeNull();
  });

  it('devuelve null si responseStatus no es 200', async () => {
    server.use(http.get(`${BASE}/get`, () => respond('agua', 403)));
    const provider = new MyMemoryTranslationProvider(BASE);
    await expect(provider.translateToSpanish('water', 'en')).resolves.toBeNull();
  });
});
```

Run: `pnpm --filter @lingoleap/api test` — Expected: FAIL.

- [ ] **Step 2: Implementar**

`apps/api/src/infrastructure/providers/mymemory/mymemory-translation.provider.ts`:
```ts
import type { LearningLanguage } from '@lingoleap/core';
import type { TranslationProvider } from '../../../application/ports/translation-provider.port';
import { fetchJson } from '../../http/fetch-json';

interface MyMemoryResponse {
  responseStatus?: number;
  responseData?: { translatedText?: string };
}

const SOURCE_LANG: Record<LearningLanguage, string> = {
  en: 'en',
  'pt-BR': 'pt-BR',
  it: 'it'
};

export class MyMemoryTranslationProvider implements TranslationProvider {
  constructor(private readonly baseUrl = 'https://api.mymemory.translated.net') {}

  async translateToSpanish(word: string, language: LearningLanguage): Promise<string | null> {
    const params = new URLSearchParams({
      q: word,
      langpair: `${SOURCE_LANG[language]}|es`
    });
    const body = (await fetchJson(`${this.baseUrl}/get?${params.toString()}`)) as
      | MyMemoryResponse
      | null;

    if (body?.responseStatus !== 200) {
      return null;
    }
    const translated = body.responseData?.translatedText?.trim().toLowerCase() ?? '';
    if (translated.length === 0 || translated === word.toLowerCase()) {
      return null;
    }
    return translated;
  }
}
```

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm --filter @lingoleap/api test` — Expected: PASS.

```bash
git add -A
git commit -m "feat(api): adaptador de traducción de palabras con MyMemory"
```

---

### Task 9: Adaptador Pexels (imágenes)

**Files:**
- Create: `apps/api/src/infrastructure/providers/pexels/pexels-image.provider.ts`
- Test: `apps/api/src/infrastructure/providers/pexels/pexels-image.provider.spec.ts`

**Interfaces:**
- Consumes: `ImageProvider` (Task 6), `fetchJson` (Task 7).
- Produces: `class PexelsImageProvider implements ImageProvider { constructor(apiKey: string, baseUrl?: string) }` — default `https://api.pexels.com`. Header `Authorization: <apiKey>`. Endpoint `GET /v1/search?query=<term>&per_page=3&orientation=square`. Devuelve `photos[0].src.medium` o `null`.

- [ ] **Step 1: Test que falla**

`apps/api/src/infrastructure/providers/pexels/pexels-image.provider.spec.ts`:
```ts
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PexelsImageProvider } from './pexels-image.provider';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE = 'https://pexels.test';

describe('PexelsImageProvider', () => {
  it('devuelve la primera imagen mediana con el header de auth', async () => {
    server.use(
      http.get(`${BASE}/v1/search`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe('my-key');
        const url = new URL(request.url);
        expect(url.searchParams.get('query')).toBe('water');
        return HttpResponse.json({
          photos: [{ src: { medium: 'https://images.pexels.test/water-medium.jpg' } }]
        });
      })
    );
    const provider = new PexelsImageProvider('my-key', BASE);
    await expect(provider.findImageUrl('water')).resolves.toBe(
      'https://images.pexels.test/water-medium.jpg'
    );
  });

  it('devuelve null sin resultados', async () => {
    server.use(http.get(`${BASE}/v1/search`, () => HttpResponse.json({ photos: [] })));
    const provider = new PexelsImageProvider('my-key', BASE);
    await expect(provider.findImageUrl('zzzz')).resolves.toBeNull();
  });
});
```

Run: `pnpm --filter @lingoleap/api test` — Expected: FAIL.

- [ ] **Step 2: Implementar**

`apps/api/src/infrastructure/providers/pexels/pexels-image.provider.ts`:
```ts
import type { ImageProvider } from '../../../application/ports/image-provider.port';
import { fetchJson } from '../../http/fetch-json';

interface PexelsResponse {
  photos?: { src?: { medium?: string } }[];
}

export class PexelsImageProvider implements ImageProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.pexels.com'
  ) {}

  async findImageUrl(term: string): Promise<string | null> {
    const params = new URLSearchParams({ query: term, per_page: '3', orientation: 'square' });
    const body = (await fetchJson(`${this.baseUrl}/v1/search?${params.toString()}`, {
      headers: { Authorization: this.apiKey }
    })) as PexelsResponse | null;

    return body?.photos?.[0]?.src?.medium ?? null;
  }
}
```

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm --filter @lingoleap/api test` — Expected: PASS.

```bash
git add -A
git commit -m "feat(api): adaptador de imágenes Pexels"
```

---

### Task 10: Adaptador FrequencyWords (vocabulario)

**Files:**
- Create: `apps/api/src/infrastructure/providers/frequency-words/frequency-words.provider.ts`
- Test: `apps/api/src/infrastructure/providers/frequency-words/frequency-words.provider.spec.ts`

**Interfaces:**
- Consumes: `VocabularyProvider` (Task 6), `fetchJson` NO (el dataset es texto plano — usar `fetch` directo con la misma política de reintentos vía `fetchText`, ver abajo).
- Produces:
  - `fetchText(url: string, retries?: number): Promise<string | null>` (añadir a `apps/api/src/infrastructure/http/fetch-json.ts`; misma semántica que `fetchJson` pero `response.text()`)
  - `class FrequencyWordsVocabularyProvider implements VocabularyProvider { constructor(baseUrl?: string) }` — default `https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018`.

URLs por idioma: `en → <base>/en/en_50k.txt`, `pt-BR → <base>/pt_br/pt_br_50k.txt`, `it → <base>/it/it_50k.txt`.
Formato: una línea por palabra `palabra frecuencia` ordenadas por frecuencia descendente.
Filtro: solo tokens que cumplan `/^[a-záéíóúàèìòùâêôãõçñüæœ']{2,}$/i`; luego tomar el rango `[band.start-1, band.end)` del arreglo filtrado y de ahí las primeras `limit`.
Si la descarga falla (null) → lanzar `Error` con mensaje claro (la ingesta no puede continuar sin vocabulario).
Cachear el texto descargado por idioma en un `Map` de la instancia (una descarga por ejecución del CLI).

- [ ] **Step 1: Test que falla**

`apps/api/src/infrastructure/providers/frequency-words/frequency-words.provider.spec.ts`:
```ts
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FrequencyWordsVocabularyProvider } from './frequency-words.provider';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE = 'https://freq.test';
const FILE = ['the 100', 'of 90', 'x1 80', 'water 70', 'milk 60', 'a 50', 'bread 40']
  .join('\n');

describe('FrequencyWordsVocabularyProvider', () => {
  it('descarga, filtra tokens no alfabéticos y respeta banda y límite', async () => {
    let downloads = 0;
    server.use(
      http.get(`${BASE}/en/en_50k.txt`, () => {
        downloads++;
        return HttpResponse.text(FILE);
      })
    );
    const provider = new FrequencyWordsVocabularyProvider(BASE);
    // El filtro elimina 'x1' y 'a' (token de 1 letra queda excluido por el {2,})
    const words = await provider.topWords('en', { start: 1, end: 4 }, 3);
    expect(words).toEqual(['the', 'of', 'water']);

    // segunda llamada usa caché
    await provider.topWords('en', { start: 1, end: 4 }, 3);
    expect(downloads).toBe(1);
  });

  it('lanza si el dataset no se puede descargar', async () => {
    server.use(http.get(`${BASE}/it/it_50k.txt`, () => new HttpResponse(null, { status: 404 })));
    const provider = new FrequencyWordsVocabularyProvider(BASE);
    await expect(provider.topWords('it', { start: 1, end: 10 }, 5)).rejects.toThrow(
      /vocabulario/i
    );
  });
});
```

Run: `pnpm --filter @lingoleap/api test` — Expected: FAIL.

- [ ] **Step 2: Implementar `fetchText` y el provider**

Refactorizar `apps/api/src/infrastructure/http/fetch-json.ts` para que el bucle de reintentos viva en un helper privado compartido y `fetchJson`/`fetchText` solo elijan cómo parsear (reemplazar el cuerpo actual de `fetchJson` por la delegación; los tests existentes de `fetchJson` deben seguir en verde):
```ts
async function fetchWithRetry(
  url: string,
  init: RequestInit | undefined,
  retries: number,
  baseDelayMs: number
): Promise<Response | null> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }
      await sleep(baseDelayMs * 2 ** attempt);
      continue;
    }
    if (response.ok) {
      return response;
    }
    if (!RETRYABLE_STATUS.has(response.status)) {
      return null;
    }
    if (attempt >= retries) {
      throw new Error(`HTTP ${response.status} en ${url} tras ${retries + 1} intentos`);
    }
    await sleep(baseDelayMs * 2 ** attempt);
  }
}

export async function fetchJson(
  url: string,
  init?: RequestInit,
  retries = 3,
  baseDelayMs = 500
): Promise<unknown> {
  const response = await fetchWithRetry(url, init, retries, baseDelayMs);
  return response ? response.json() : null;
}

export async function fetchText(
  url: string,
  retries = 3,
  baseDelayMs = 500
): Promise<string | null> {
  const response = await fetchWithRetry(url, undefined, retries, baseDelayMs);
  return response ? response.text() : null;
}
```

`apps/api/src/infrastructure/providers/frequency-words/frequency-words.provider.ts`:
```ts
import type { FrequencyBand, LearningLanguage } from '@lingoleap/core';
import type { VocabularyProvider } from '../../../application/ports/vocabulary-provider.port';
import { fetchText } from '../../http/fetch-json';

const FILE_PATH: Record<LearningLanguage, string> = {
  en: 'en/en_50k.txt',
  'pt-BR': 'pt_br/pt_br_50k.txt',
  it: 'it/it_50k.txt'
};

const WORD_PATTERN = /^[a-záéíóúàèìòùâêôãõçñüæœ']{2,}$/i;

export class FrequencyWordsVocabularyProvider implements VocabularyProvider {
  private readonly cache = new Map<LearningLanguage, string[]>();

  constructor(
    private readonly baseUrl = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018'
  ) {}

  async topWords(
    language: LearningLanguage,
    band: FrequencyBand,
    limit: number
  ): Promise<string[]> {
    const all = await this.wordList(language);
    return all.slice(band.start - 1, band.end).slice(0, limit);
  }

  private async wordList(language: LearningLanguage): Promise<string[]> {
    const cached = this.cache.get(language);
    if (cached) {
      return cached;
    }
    const text = await fetchText(`${this.baseUrl}/${FILE_PATH[language]}`);
    if (text === null) {
      throw new Error(`No se pudo descargar la lista de vocabulario para ${language}`);
    }
    const words = text
      .split('\n')
      .map((line) => line.split(' ')[0]?.trim().toLowerCase() ?? '')
      .filter((word) => WORD_PATTERN.test(word));
    this.cache.set(language, words);
    return words;
  }
}
```

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm --filter @lingoleap/api test` — Expected: PASS.

```bash
git add -A
git commit -m "feat(api): adaptador de vocabulario FrequencyWords con caché por idioma"
```

---

### Task 11: Migración SQL de Supabase + SupabaseCourseRepository

**Files:**
- Create: `supabase/migrations/0001_content.sql`, `apps/api/src/infrastructure/persistence/supabase/course-row-mapper.ts`, `apps/api/src/infrastructure/persistence/supabase/supabase-course.repository.ts`, `apps/api/src/infrastructure/persistence/supabase/supabase-client.factory.ts`
- Test: `apps/api/src/infrastructure/persistence/supabase/course-row-mapper.spec.ts`

**Interfaces:**
- Consumes: `CourseRepository` (Task 6), tipos de core, `Env` (Task 3).
- Produces:
  - Tablas: `courses(id, language, level, title, created_at)` única por `(language, level)`; `units(id, course_id, title, position)`; `lessons(id, unit_id, title, position)`; `exercises(id, lesson_id, position, type, payload jsonb)`. RLS habilitada con lectura pública; escrituras solo service role.
  - `createSupabaseClient(env: Env): SupabaseClient`
  - Mapeos puros (testeados): `courseToRows(course: Course): ContentRows` y `rowsToCourse(row: CourseWithNestedRows): Course` donde:
```ts
export interface CourseRow { id: string; language: string; level: string; title: string }
export interface UnitRow { id: string; course_id: string; title: string; position: number }
export interface LessonRow { id: string; unit_id: string; title: string; position: number }
export interface ExerciseRow { id: string; lesson_id: string; position: number; type: string; payload: unknown }
export interface ContentRows { course: CourseRow; units: UnitRow[]; lessons: LessonRow[]; exercises: ExerciseRow[] }
// Forma que devuelve PostgREST con select anidado:
export interface NestedLessonRow extends LessonRow { exercises: ExerciseRow[] }
export interface NestedUnitRow extends UnitRow { lessons: NestedLessonRow[] }
export interface CourseWithNestedRows extends CourseRow { units: NestedUnitRow[] }
export function rowToLesson(row: NestedLessonRow): Lesson;
```
  - `class SupabaseCourseRepository implements CourseRepository { constructor(client: SupabaseClient) }`

Diseño del `payload` jsonb: el objeto `Exercise` completo sin `id` ni `type` (esos van en columnas). `rowsToCourse`/`rowToLesson` reconstruyen `Exercise` como `{ id: row.id, type: row.type, ...payload }` y ordenan units/lessons/exercises por `position` ascendente.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/0001_content.sql`:
```sql
create extension if not exists pgcrypto;

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  language text not null,
  level text not null,
  title text not null,
  created_at timestamptz not null default now(),
  unique (language, level)
);

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  position int not null
);

create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  title text not null,
  position int not null
);

create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  position int not null,
  type text not null,
  payload jsonb not null
);

create index if not exists idx_units_course on units(course_id);
create index if not exists idx_lessons_unit on lessons(unit_id);
create index if not exists idx_exercises_lesson on exercises(lesson_id);

alter table courses enable row level security;
alter table units enable row level security;
alter table lessons enable row level security;
alter table exercises enable row level security;

create policy "lectura pública courses" on courses for select using (true);
create policy "lectura pública units" on units for select using (true);
create policy "lectura pública lessons" on lessons for select using (true);
create policy "lectura pública exercises" on exercises for select using (true);
```

- [ ] **Step 2: Test que falla para los mapeos**

`apps/api/src/infrastructure/persistence/supabase/course-row-mapper.spec.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Course } from '@lingoleap/core';
import { courseToRows, rowsToCourse } from './course-row-mapper';

const course: Course = {
  id: 'c1',
  language: 'en',
  level: 'A1',
  title: 'Inglés A1',
  units: [
    {
      id: 'u1',
      title: 'Unidad 1',
      position: 1,
      lessons: [
        {
          id: 'l1',
          title: 'Lección 1',
          position: 1,
          exercises: [
            { id: 'e1', type: 'match-pairs', pairs: [{ left: 'water', right: 'agua' }] },
            {
              id: 'e2',
              type: 'translate',
              sourceText: 'I drink water.',
              correctAnswer: 'Yo bebo agua.',
              wordBank: ['Yo', 'bebo', 'agua'],
              audioUrl: null
            }
          ]
        }
      ]
    }
  ]
};

describe('mapeo curso <-> filas', () => {
  it('courseToRows aplana el agregado', () => {
    const rows = courseToRows(course);
    expect(rows.course).toEqual({ id: 'c1', language: 'en', level: 'A1', title: 'Inglés A1' });
    expect(rows.units).toHaveLength(1);
    expect(rows.lessons[0].unit_id).toBe('u1');
    expect(rows.exercises).toHaveLength(2);
    expect(rows.exercises[0].type).toBe('match-pairs');
    expect(rows.exercises[0].payload).toEqual({ pairs: [{ left: 'water', right: 'agua' }] });
  });

  it('roundtrip: rowsToCourse(courseToRows(x)) === x', () => {
    const rows = courseToRows(course);
    const nested = {
      ...rows.course,
      units: rows.units.map((u) => ({
        ...u,
        lessons: rows.lessons
          .filter((l) => l.unit_id === u.id)
          .map((l) => ({
            ...l,
            exercises: rows.exercises.filter((e) => e.lesson_id === l.id)
          }))
      }))
    };
    expect(rowsToCourse(nested)).toEqual(course);
  });
});
```

Run: `pnpm --filter @lingoleap/api test` — Expected: FAIL.

- [ ] **Step 3: Implementar los mapeos**

`apps/api/src/infrastructure/persistence/supabase/course-row-mapper.ts`:
```ts
import type { Course, Exercise, Lesson } from '@lingoleap/core';

export interface CourseRow {
  id: string;
  language: string;
  level: string;
  title: string;
}
export interface UnitRow {
  id: string;
  course_id: string;
  title: string;
  position: number;
}
export interface LessonRow {
  id: string;
  unit_id: string;
  title: string;
  position: number;
}
export interface ExerciseRow {
  id: string;
  lesson_id: string;
  position: number;
  type: string;
  payload: unknown;
}
export interface ContentRows {
  course: CourseRow;
  units: UnitRow[];
  lessons: LessonRow[];
  exercises: ExerciseRow[];
}
export interface NestedLessonRow extends LessonRow {
  exercises: ExerciseRow[];
}
export interface NestedUnitRow extends UnitRow {
  lessons: NestedLessonRow[];
}
export interface CourseWithNestedRows extends CourseRow {
  units: NestedUnitRow[];
}

export function courseToRows(course: Course): ContentRows {
  const units: UnitRow[] = [];
  const lessons: LessonRow[] = [];
  const exercises: ExerciseRow[] = [];

  for (const unit of course.units) {
    units.push({ id: unit.id, course_id: course.id, title: unit.title, position: unit.position });
    for (const lesson of unit.lessons) {
      lessons.push({
        id: lesson.id,
        unit_id: unit.id,
        title: lesson.title,
        position: lesson.position
      });
      lesson.exercises.forEach((exercise, index) => {
        const { id, type, ...payload } = exercise;
        exercises.push({ id, lesson_id: lesson.id, position: index + 1, type, payload });
      });
    }
  }

  return {
    course: {
      id: course.id,
      language: course.language,
      level: course.level,
      title: course.title
    },
    units,
    lessons,
    exercises
  };
}

function byPosition<T extends { position: number }>(a: T, b: T): number {
  return a.position - b.position;
}

export function rowToLesson(row: NestedLessonRow): Lesson {
  return {
    id: row.id,
    title: row.title,
    position: row.position,
    exercises: [...row.exercises].sort(byPosition).map(
      (e) => ({ id: e.id, type: e.type, ...(e.payload as object) }) as Exercise
    )
  };
}

export function rowsToCourse(row: CourseWithNestedRows): Course {
  return {
    id: row.id,
    language: row.language as Course['language'],
    level: row.level as Course['level'],
    title: row.title,
    units: [...row.units].sort(byPosition).map((unit) => ({
      id: unit.id,
      title: unit.title,
      position: unit.position,
      lessons: [...unit.lessons].sort(byPosition).map(rowToLesson)
    }))
  };
}
```

Run: `pnpm --filter @lingoleap/api test` — Expected: PASS.

- [ ] **Step 4: Implementar cliente y repositorio (adaptador delgado, sin tests unitarios — se verifica en el smoke de Task 12)**

`apps/api/src/infrastructure/persistence/supabase/supabase-client.factory.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../../../config/env';

export const SUPABASE_CLIENT = Symbol('SupabaseClient');

export function createSupabaseClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
}
```

`apps/api/src/infrastructure/persistence/supabase/supabase-course.repository.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CEFRLevel, Course, CourseSummary, LearningLanguage, Lesson } from '@lingoleap/core';
import type { CourseRepository } from '../../../application/ports/course.repository';
import {
  courseToRows,
  rowsToCourse,
  rowToLesson,
  type CourseWithNestedRows,
  type NestedLessonRow
} from './course-row-mapper';

const NESTED_SELECT = 'id, language, level, title, units(id, course_id, title, position, lessons(id, unit_id, title, position, exercises(id, lesson_id, position, type, payload)))';

export class SupabaseCourseRepository implements CourseRepository {
  constructor(private readonly client: SupabaseClient) {}

  async saveCourse(course: Course): Promise<void> {
    const rows = courseToRows(course);

    // Reemplaza el curso existente (el cascade borra units/lessons/exercises)
    const del = await this.client
      .from('courses')
      .delete()
      .eq('language', course.language)
      .eq('level', course.level);
    if (del.error) {
      throw new Error(`Supabase delete falló: ${del.error.message}`);
    }

    const insCourse = await this.client.from('courses').insert(rows.course);
    if (insCourse.error) {
      throw new Error(`Supabase insert courses falló: ${insCourse.error.message}`);
    }
    const insUnits = await this.client.from('units').insert(rows.units);
    if (insUnits.error) {
      throw new Error(`Supabase insert units falló: ${insUnits.error.message}`);
    }
    const insLessons = await this.client.from('lessons').insert(rows.lessons);
    if (insLessons.error) {
      throw new Error(`Supabase insert lessons falló: ${insLessons.error.message}`);
    }
    const insExercises = await this.client.from('exercises').insert(rows.exercises);
    if (insExercises.error) {
      throw new Error(`Supabase insert exercises falló: ${insExercises.error.message}`);
    }
  }

  async findByLanguageAndLevel(
    language: LearningLanguage,
    level: CEFRLevel
  ): Promise<Course | null> {
    const { data, error } = await this.client
      .from('courses')
      .select(NESTED_SELECT)
      .eq('language', language)
      .eq('level', level)
      .maybeSingle();
    if (error) {
      throw new Error(`Supabase select course falló: ${error.message}`);
    }
    return data ? rowsToCourse(data as unknown as CourseWithNestedRows) : null;
  }

  async listSummaries(): Promise<CourseSummary[]> {
    const { data, error } = await this.client
      .from('courses')
      .select('id, language, level, title')
      .order('language')
      .order('level');
    if (error) {
      throw new Error(`Supabase list courses falló: ${error.message}`);
    }
    return (data ?? []) as CourseSummary[];
  }

  async findLessonById(lessonId: string): Promise<Lesson | null> {
    const { data, error } = await this.client
      .from('lessons')
      .select('id, unit_id, title, position, exercises(id, lesson_id, position, type, payload)')
      .eq('id', lessonId)
      .maybeSingle();
    if (error) {
      throw new Error(`Supabase select lesson falló: ${error.message}`);
    }
    return data ? rowToLesson(data as unknown as NestedLessonRow) : null;
  }
}
```

- [ ] **Step 5: Verificar y commitear**

Run: `pnpm --filter @lingoleap/api test` — Expected: PASS.
Run: `pnpm build` — Expected: compila sin errores.

```bash
git add -A
git commit -m "feat(api): migración de contenido y repositorio Supabase con mapeos testeados"
```

---

### Task 12: Wiring del módulo de ingesta + CLI + smoke real

**Files:**
- Create: `apps/api/src/infrastructure/ingest.module.ts`, `apps/api/src/cli/parse-ingest-args.ts`, `apps/api/src/cli/ingest.cli.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/cli/parse-ingest-args.spec.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces:
  - `IngestModule` que provee `ENV`, `SUPABASE_CLIENT`, los 5 puertos (tokens de Task 6) cableados a los adaptadores reales, e `IngestContentUseCase` (por clase, vía `useFactory`). Exporta `IngestContentUseCase` y `COURSE_REPOSITORY`.
  - `parseIngestArgs(argv: string[]): IngestCommand` — lanza `Error` con mensaje de uso si `--lang` no está en `LEARNING_LANGUAGES` o `--level` no está en `CEFR_LEVELS`; `--limit` opcional entero positivo.
  - Comando: `pnpm --filter @lingoleap/api ingest --lang en --level A1 --limit 15`

- [ ] **Step 1: Test que falla para parseIngestArgs**

`apps/api/src/cli/parse-ingest-args.spec.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseIngestArgs } from './parse-ingest-args';

describe('parseIngestArgs', () => {
  it('parsea lang, level y limit', () => {
    expect(parseIngestArgs(['--lang', 'en', '--level', 'A1', '--limit', '15'])).toEqual({
      language: 'en',
      level: 'A1',
      wordLimit: 15
    });
  });

  it('limit es opcional', () => {
    expect(parseIngestArgs(['--lang', 'pt-BR', '--level', 'B1'])).toEqual({
      language: 'pt-BR',
      level: 'B1',
      wordLimit: undefined
    });
  });

  it('rechaza idioma o nivel inválido', () => {
    expect(() => parseIngestArgs(['--lang', 'fr', '--level', 'A1'])).toThrow(/uso/i);
    expect(() => parseIngestArgs(['--lang', 'en', '--level', 'Z9'])).toThrow(/uso/i);
  });
});
```

Run: `pnpm --filter @lingoleap/api test` — Expected: FAIL.

- [ ] **Step 2: Implementar parseIngestArgs**

`apps/api/src/cli/parse-ingest-args.ts`:
```ts
import type { CEFRLevel, LearningLanguage } from '@lingoleap/core';
import { CEFR_LEVELS, LEARNING_LANGUAGES } from '@lingoleap/core';
import type { IngestCommand } from '../application/use-cases/ingest-content.use-case';

const USAGE = 'Uso: ingest --lang <en|pt-BR|it> --level <A1..C2> [--limit <n>]';

function readFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function parseIngestArgs(argv: string[]): IngestCommand {
  const lang = readFlag(argv, '--lang');
  const level = readFlag(argv, '--level');
  const limitRaw = readFlag(argv, '--limit');

  if (!lang || !(LEARNING_LANGUAGES as readonly string[]).includes(lang)) {
    throw new Error(USAGE);
  }
  if (!level || !(CEFR_LEVELS as readonly string[]).includes(level)) {
    throw new Error(USAGE);
  }
  let wordLimit: number | undefined;
  if (limitRaw !== undefined) {
    wordLimit = Number(limitRaw);
    if (!Number.isInteger(wordLimit) || wordLimit <= 0) {
      throw new Error(USAGE);
    }
  }
  return { language: lang as LearningLanguage, level: level as CEFRLevel, wordLimit };
}
```

Run: `pnpm --filter @lingoleap/api test` — Expected: PASS.

- [ ] **Step 3: Implementar IngestModule y CLI**

`apps/api/src/infrastructure/ingest.module.ts`:
```ts
import { Module } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ENV, loadEnv, type Env } from '../config/env';
import { COURSE_REPOSITORY, type CourseRepository } from '../application/ports/course.repository';
import { IMAGE_PROVIDER, type ImageProvider } from '../application/ports/image-provider.port';
import {
  SENTENCE_PROVIDER,
  type SentenceProvider
} from '../application/ports/sentence-provider.port';
import {
  TRANSLATION_PROVIDER,
  type TranslationProvider
} from '../application/ports/translation-provider.port';
import {
  VOCABULARY_PROVIDER,
  type VocabularyProvider
} from '../application/ports/vocabulary-provider.port';
import { IngestContentUseCase } from '../application/use-cases/ingest-content.use-case';
import {
  createSupabaseClient,
  SUPABASE_CLIENT
} from './persistence/supabase/supabase-client.factory';
import { SupabaseCourseRepository } from './persistence/supabase/supabase-course.repository';
import { FrequencyWordsVocabularyProvider } from './providers/frequency-words/frequency-words.provider';
import { MyMemoryTranslationProvider } from './providers/mymemory/mymemory-translation.provider';
import { PexelsImageProvider } from './providers/pexels/pexels-image.provider';
import { TatoebaSentenceProvider } from './providers/tatoeba/tatoeba-sentence.provider';

@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    { provide: SUPABASE_CLIENT, useFactory: (env: Env) => createSupabaseClient(env), inject: [ENV] },
    { provide: VOCABULARY_PROVIDER, useFactory: () => new FrequencyWordsVocabularyProvider() },
    { provide: TRANSLATION_PROVIDER, useFactory: () => new MyMemoryTranslationProvider() },
    { provide: SENTENCE_PROVIDER, useFactory: () => new TatoebaSentenceProvider() },
    {
      provide: IMAGE_PROVIDER,
      useFactory: (env: Env) => new PexelsImageProvider(env.PEXELS_API_KEY),
      inject: [ENV]
    },
    {
      provide: COURSE_REPOSITORY,
      useFactory: (client: SupabaseClient) => new SupabaseCourseRepository(client),
      inject: [SUPABASE_CLIENT]
    },
    {
      provide: IngestContentUseCase,
      useFactory: (
        vocabulary: VocabularyProvider,
        translations: TranslationProvider,
        sentences: SentenceProvider,
        images: ImageProvider,
        courses: CourseRepository
      ) => new IngestContentUseCase({ vocabulary, translations, sentences, images, courses }),
      inject: [
        VOCABULARY_PROVIDER,
        TRANSLATION_PROVIDER,
        SENTENCE_PROVIDER,
        IMAGE_PROVIDER,
        COURSE_REPOSITORY
      ]
    }
  ],
  exports: [IngestContentUseCase, COURSE_REPOSITORY]
})
export class IngestModule {}
```

`apps/api/src/cli/ingest.cli.ts`:
```ts
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { IngestContentUseCase } from '../application/use-cases/ingest-content.use-case';
import { parseIngestArgs } from './parse-ingest-args';

async function main(): Promise<void> {
  const command = parseIngestArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn']
  });
  try {
    const useCase = app.get(IngestContentUseCase);
    const report = await useCase.execute(command);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
```

Modificar `apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { IngestModule } from './infrastructure/ingest.module';
import { HealthController } from './presentation/health.controller';

@Module({
  imports: [IngestModule],
  controllers: [HealthController]
})
export class AppModule {}
```

- [ ] **Step 4: Verificar tests y build**

Run: `pnpm --filter @lingoleap/api test && pnpm build` — Expected: PASS / compila.

- [ ] **Step 5: Smoke real (manual, requiere cuentas gratuitas)**

Prerrequisitos (una sola vez, guiar al usuario si falta algo):
1. Crear proyecto gratuito en https://supabase.com → copiar `Project URL` y `service_role key` (Settings → API).
2. Ejecutar el SQL de `supabase/migrations/0001_content.sql` en el SQL Editor del dashboard de Supabase.
3. Crear cuenta gratuita en https://www.pexels.com/api/ → copiar API key.
4. Copiar `apps/api/.env.example` a `apps/api/.env` y llenar los valores.

Run: `pnpm --filter @lingoleap/api ingest --lang en --level A1 --limit 15`
Expected: JSON del reporte con `materialsBuilt >= 10`, `unitCount >= 1`; en el dashboard de Supabase, las tablas `courses/units/lessons/exercises` tienen filas.

Si Tatoeba devuelve una forma distinta a la del fixture (Task 7 Step 1), ajustar el mapper aquí.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): módulo de ingesta cableado y CLI de ingesta"
```

---

### Task 13: Endpoints REST de lectura + filtro de errores de dominio

**Files:**
- Create: `apps/api/src/application/use-cases/get-course.use-case.ts`, `apps/api/src/application/use-cases/get-lesson.use-case.ts`, `apps/api/src/application/use-cases/list-courses.use-case.ts`, `apps/api/src/presentation/domain-exception.filter.ts`, `apps/api/src/presentation/courses.controller.ts`, `apps/api/src/presentation/lessons.controller.ts`, `apps/api/src/presentation/content-api.module.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/main.ts`
- Test: `apps/api/src/presentation/content-api.spec.ts`

**Interfaces:**
- Consumes: `COURSE_REPOSITORY`/`CourseRepository`, errores del dominio, `IngestModule` (exporta el repo).
- Produces:
  - `class ListCoursesUseCase { constructor(courses: CourseRepository); execute(): Promise<CourseSummary[]> }`
  - `class GetCourseUseCase { constructor(courses: CourseRepository); execute(language: LearningLanguage, level: CEFRLevel): Promise<Course> }` — lanza `CourseNotFoundError` si no existe
  - `class GetLessonUseCase { constructor(courses: CourseRepository); execute(lessonId: string): Promise<Lesson> }` — lanza `LessonNotFoundError`
  - Endpoints: `GET /courses` → `CourseSummary[]`; `GET /courses/:language/:level` → `Course`; `GET /lessons/:id` → `Lesson`
  - `DomainExceptionFilter` (global): `COURSE_NOT_FOUND|LESSON_NOT_FOUND → 404`, `INVALID_CONTENT → 422`, otros `DomainError → 400`; cuerpo `{ code, message }`.

- [ ] **Step 1: Test que falla (supertest contra el módulo con repo fake)**

`apps/api/src/presentation/content-api.spec.ts`:
```ts
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CEFRLevel, Course, CourseSummary, LearningLanguage, Lesson } from '@lingoleap/core';
import { COURSE_REPOSITORY, type CourseRepository } from '../application/ports/course.repository';
import { ContentApiModule } from './content-api.module';
import { DomainExceptionFilter } from './domain-exception.filter';

const lesson: Lesson = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  title: 'Lección 1',
  position: 1,
  exercises: [{ id: 'e1', type: 'match-pairs', pairs: [{ left: 'water', right: 'agua' }] }]
};

const course: Course = {
  id: 'c1',
  language: 'en',
  level: 'A1',
  title: 'Inglés A1',
  units: [{ id: 'u1', title: 'Unidad 1', position: 1, lessons: [lesson] }]
};

class FakeRepo implements CourseRepository {
  async saveCourse(): Promise<void> {}
  async findByLanguageAndLevel(l: LearningLanguage, lv: CEFRLevel): Promise<Course | null> {
    return l === 'en' && lv === 'A1' ? course : null;
  }
  async listSummaries(): Promise<CourseSummary[]> {
    return [{ id: 'c1', language: 'en', level: 'A1', title: 'Inglés A1' }];
  }
  async findLessonById(id: string): Promise<Lesson | null> {
    return id === lesson.id ? lesson : null;
  }
}

describe('API de contenido', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
    process.env.PEXELS_API_KEY = 'stub';

    const moduleRef = await Test.createTestingModule({ imports: [ContentApiModule] })
      .overrideProvider(COURSE_REPOSITORY)
      .useValue(new FakeRepo())
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /courses lista resúmenes', async () => {
    const res = await request(app.getHttpServer()).get('/courses').expect(200);
    expect(res.body).toEqual([{ id: 'c1', language: 'en', level: 'A1', title: 'Inglés A1' }]);
  });

  it('GET /courses/:language/:level devuelve el curso', async () => {
    const res = await request(app.getHttpServer()).get('/courses/en/A1').expect(200);
    expect(res.body.title).toBe('Inglés A1');
    expect(res.body.units).toHaveLength(1);
  });

  it('GET /courses inexistente responde 404 con código semántico', async () => {
    const res = await request(app.getHttpServer()).get('/courses/it/C2').expect(404);
    expect(res.body.code).toBe('COURSE_NOT_FOUND');
  });

  it('GET /lessons/:id devuelve la lección y 404 si no existe', async () => {
    await request(app.getHttpServer()).get(`/lessons/${lesson.id}`).expect(200);
    const res = await request(app.getHttpServer())
      .get('/lessons/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
      .expect(404);
    expect(res.body.code).toBe('LESSON_NOT_FOUND');
  });
});
```

Run: `pnpm --filter @lingoleap/api test` — Expected: FAIL.

- [ ] **Step 2: Implementar casos de uso de lectura**

`apps/api/src/application/use-cases/list-courses.use-case.ts`:
```ts
import type { CourseSummary } from '@lingoleap/core';
import type { CourseRepository } from '../ports/course.repository';

export class ListCoursesUseCase {
  constructor(private readonly courses: CourseRepository) {}

  execute(): Promise<CourseSummary[]> {
    return this.courses.listSummaries();
  }
}
```

`apps/api/src/application/use-cases/get-course.use-case.ts`:
```ts
import type { CEFRLevel, Course, LearningLanguage } from '@lingoleap/core';
import { CourseNotFoundError } from '../../domain/errors';
import type { CourseRepository } from '../ports/course.repository';

export class GetCourseUseCase {
  constructor(private readonly courses: CourseRepository) {}

  async execute(language: LearningLanguage, level: CEFRLevel): Promise<Course> {
    const course = await this.courses.findByLanguageAndLevel(language, level);
    if (course === null) {
      throw new CourseNotFoundError(`${language} ${level}`);
    }
    return course;
  }
}
```

`apps/api/src/application/use-cases/get-lesson.use-case.ts`:
```ts
import type { Lesson } from '@lingoleap/core';
import { LessonNotFoundError } from '../../domain/errors';
import type { CourseRepository } from '../ports/course.repository';

export class GetLessonUseCase {
  constructor(private readonly courses: CourseRepository) {}

  async execute(lessonId: string): Promise<Lesson> {
    const lesson = await this.courses.findLessonById(lessonId);
    if (lesson === null) {
      throw new LessonNotFoundError(lessonId);
    }
    return lesson;
  }
}
```

- [ ] **Step 3: Implementar filtro, controllers y módulo**

`apps/api/src/presentation/domain-exception.filter.ts`:
```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../domain/errors';

const STATUS_BY_CODE: Record<string, number> = {
  COURSE_NOT_FOUND: HttpStatus.NOT_FOUND,
  LESSON_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_CONTENT: HttpStatus.UNPROCESSABLE_ENTITY
};

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.BAD_REQUEST;
    response.status(status).json({ code: exception.code, message: exception.message });
  }
}
```

`apps/api/src/presentation/courses.controller.ts`:
```ts
import { BadRequestException, Controller, Get, Param } from '@nestjs/common';
import type { CEFRLevel, Course, CourseSummary, LearningLanguage } from '@lingoleap/core';
import { CEFR_LEVELS, LEARNING_LANGUAGES } from '@lingoleap/core';
import { GetCourseUseCase } from '../application/use-cases/get-course.use-case';
import { ListCoursesUseCase } from '../application/use-cases/list-courses.use-case';

@Controller('courses')
export class CoursesController {
  constructor(
    private readonly listCourses: ListCoursesUseCase,
    private readonly getCourse: GetCourseUseCase
  ) {}

  @Get()
  list(): Promise<CourseSummary[]> {
    return this.listCourses.execute();
  }

  @Get(':language/:level')
  get(@Param('language') language: string, @Param('level') level: string): Promise<Course> {
    if (!(LEARNING_LANGUAGES as readonly string[]).includes(language)) {
      throw new BadRequestException(`Idioma no soportado: ${language}`);
    }
    if (!(CEFR_LEVELS as readonly string[]).includes(level)) {
      throw new BadRequestException(`Nivel no soportado: ${level}`);
    }
    return this.getCourse.execute(language as LearningLanguage, level as CEFRLevel);
  }
}
```

`apps/api/src/presentation/lessons.controller.ts`:
```ts
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { Lesson } from '@lingoleap/core';
import { GetLessonUseCase } from '../application/use-cases/get-lesson.use-case';

@Controller('lessons')
export class LessonsController {
  constructor(private readonly getLesson: GetLessonUseCase) {}

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Lesson> {
    return this.getLesson.execute(id);
  }
}
```

`apps/api/src/presentation/content-api.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { COURSE_REPOSITORY, type CourseRepository } from '../application/ports/course.repository';
import { GetCourseUseCase } from '../application/use-cases/get-course.use-case';
import { GetLessonUseCase } from '../application/use-cases/get-lesson.use-case';
import { ListCoursesUseCase } from '../application/use-cases/list-courses.use-case';
import { IngestModule } from '../infrastructure/ingest.module';
import { CoursesController } from './courses.controller';
import { LessonsController } from './lessons.controller';

@Module({
  imports: [IngestModule],
  controllers: [CoursesController, LessonsController],
  providers: [
    {
      provide: ListCoursesUseCase,
      useFactory: (repo: CourseRepository) => new ListCoursesUseCase(repo),
      inject: [COURSE_REPOSITORY]
    },
    {
      provide: GetCourseUseCase,
      useFactory: (repo: CourseRepository) => new GetCourseUseCase(repo),
      inject: [COURSE_REPOSITORY]
    },
    {
      provide: GetLessonUseCase,
      useFactory: (repo: CourseRepository) => new GetLessonUseCase(repo),
      inject: [COURSE_REPOSITORY]
    }
  ]
})
export class ContentApiModule {}
```

Modificar `apps/api/src/app.module.ts` (reemplazar contenido):
```ts
import { Module } from '@nestjs/common';
import { ContentApiModule } from './presentation/content-api.module';
import { HealthController } from './presentation/health.controller';

@Module({
  imports: [ContentApiModule],
  controllers: [HealthController]
})
export class AppModule {}
```

Modificar `apps/api/src/main.ts` — añadir el filtro global y CORS (después de `NestFactory.create`):
```ts
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { DomainExceptionFilter } from './presentation/domain-exception.filter';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.listen(env.PORT);
}

void bootstrap();
```

- [ ] **Step 4: Verificar tests, servidor real y commitear**

Run: `pnpm --filter @lingoleap/api test` — Expected: PASS (todos los suites).
Run (con `.env` de Task 12): `pnpm --filter @lingoleap/api dev` y en otra terminal `curl http://localhost:3000/courses` — Expected: JSON con el curso `Inglés A1` ingestado en Task 12. Detener el servidor.

```bash
git add -A
git commit -m "feat(api): endpoints REST de cursos y lecciones con filtro de errores de dominio"
```

---

### Task 14: CI con GitHub Actions + README

**Files:**
- Create: `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Consumes: scripts raíz `pnpm lint|build|test` (Task 1).
- Produces: pipeline de CI que corre en cada push/PR.

- [ ] **Step 1: Workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm build
      - run: pnpm test
```

- [ ] **Step 2: README**

`README.md`:
```markdown
# LingoLeap 🦉

Aplicación de aprendizaje de idiomas estilo Duolingo (inglés, portugués brasileño e italiano)
con contenido 100% dinámico desde APIs gratuitas. Monorepo TypeScript con arquitectura hexagonal.

## Estructura

- `apps/api` — Backend NestJS (arquitectura hexagonal: domain / application / infrastructure / presentation)
- `packages/core` — Tipos y lógica de dominio compartidos
- `supabase/migrations` — Esquema de la base de datos
- `docs/superpowers` — Specs y planes de diseño

## Fuentes de contenido (todas gratuitas)

Tatoeba (oraciones + audio) · FrequencyWords (vocabulario por frecuencia) ·
MyMemory (traducciones de palabras) · Pexels (imágenes)

## Desarrollo

```bash
pnpm install
pnpm build
pnpm test

# Backend (requiere apps/api/.env — ver apps/api/.env.example)
pnpm --filter @lingoleap/api dev

# Ingesta de contenido
pnpm --filter @lingoleap/api ingest --lang en --level A1 --limit 40
```
```

- [ ] **Step 3: Verificar y commitear**

Run: `pnpm lint && pnpm build && pnpm test` — Expected: todo PASS.

```bash
git add -A
git commit -m "chore: pipeline de CI y README"
```

---

## Verificación final de la Fase 1

- [ ] `pnpm lint && pnpm build && pnpm test` en verde.
- [ ] `pnpm --filter @lingoleap/api ingest --lang en --level A1 --limit 40` produce un curso con ≥2 unidades en Supabase.
- [ ] `pnpm --filter @lingoleap/api dev` + `curl http://localhost:3000/courses`, `curl http://localhost:3000/courses/en/A1` y `curl http://localhost:3000/lessons/<id-real>` devuelven contenido real.
- [ ] Push a GitHub y CI en verde (crear el repo remoto si no existe: `gh repo create`).
