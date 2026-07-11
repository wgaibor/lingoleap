# Bitácora de desarrollo — LingoLeap

Registro de lo que se construyó, **por qué se decidió así**, y cómo explicarlo en una
entrevista técnica. Se actualiza al final de cada fase.

---

## Fase 1 — Backend hexagonal + pipeline de contenido (2026-07-10) ✅

### El problema a resolver

Construir una app tipo Duolingo sin pagar por contenido ni infraestructura. El reto central:
**no existe una API que entregue lecciones de idiomas listas** (Duolingo cerró la suya).
La solución fue componer las lecciones a partir de piezas abiertas: listas de frecuencia de
palabras (para saber qué enseñar y en qué orden), oraciones reales de Tatoeba, traducciones
de MyMemory e imágenes de Pexels.

### Decisiones técnicas y su porqué

| Decisión | Alternativas consideradas | Por qué se eligió |
|---|---|---|
| **Monorepo** (pnpm workspaces + Turborepo) | Repos separados por app | Web y móvil compartirán los tipos y la lógica de dominio (`packages/core`) sin duplicar código ni publicar paquetes a npm |
| **NestJS** para el backend | Express + TS a mano; Supabase Edge Functions | Su sistema de módulos e inyección de dependencias está diseñado alrededor de SOLID; mismo lenguaje (TS) que el frontend |
| **Arquitectura hexagonal solo en el backend** | Hexagonal también en frontends | La hexagonal brilla donde hay integraciones externas (APIs, BD); forzarla en React es un anti-patrón conocido. Los frontends serán React idiomático + dominio compartido |
| **Pipeline de ingesta offline** (BD como caché) | Que la app llame las APIs en tiempo real | Los rate limits de APIs gratuitas no afectan a usuarios; si una API muere, la app sigue viva; latencia mínima |
| **Supabase** (Postgres + Auth) | Base de datos propia en Render | Plan gratuito con 500MB, auth incluida para la Fase 2, RLS para seguridad a nivel de fila |
| **TTS en el dispositivo** (Web Speech API / expo-speech) | TTS en la nube (Azure/Google) | Costo $0 y sin servidor; hallazgo clave: Tatoeba ya no expone audio en su API, así que el TTS del cliente es la única fuente de audio |
| **Vitest** en vez de Jest | Jest (default de NestJS) | Más rápido, config unificada en todo el monorepo; requirió `unplugin-swc` porque los decoradores de Nest necesitan `emitDecoratorMetadata`, que esbuild no soporta |
| **Ejercicios en `payload jsonb`** | Una tabla por tipo de ejercicio | Los 4 tipos comparten tabla con columnas comunes (`id`, `type`, `position`) y el resto en JSON; agregar un tipo nuevo no requiere migración |

### La arquitectura hexagonal, explicada con este código

**Regla de oro: las dependencias apuntan hacia adentro.** El dominio no importa nada de
NestJS ni de Supabase — se verifica leyendo los imports.

- **Dominio** (`apps/api/src/domain/`): factorías como `createCourse()` que garantizan
  invariantes (un curso sin unidades lanza `InvalidContentError`). Errores semánticos con
  código (`COURSE_NOT_FOUND`), sin saber nada de HTTP.
- **Aplicación** (`apps/api/src/application/`): los casos de uso son **clases TypeScript
  puras** — sin decoradores de NestJS. Reciben sus dependencias por constructor como
  **interfaces** (los "puertos"): `CourseRepository`, `SentenceProvider`, `ImageProvider`,
  `TranslationProvider`, `VocabularyProvider`.
- **Infraestructura** (`apps/api/src/infrastructure/`): los "adaptadores" implementan los
  puertos: `TatoebaSentenceProvider`, `PexelsImageProvider`, `SupabaseCourseRepository`…
  NestJS los cablea con providers `useFactory` en `ingest.module.ts` — el framework solo
  toca la capa de wiring.
- **Presentación** (`apps/api/src/presentation/`): controllers REST que solo llaman casos
  de uso, y un `DomainExceptionFilter` global que traduce errores de dominio a HTTP
  (`COURSE_NOT_FOUND` → 404).

### Dónde está cada principio SOLID (con archivo)

| Principio | Dónde verlo |
|---|---|
| **S** — Responsabilidad única | Cada caso de uso hace una cosa: `ingest-content.use-case.ts` orquesta la ingesta y no sabe de HTTP ni SQL |
| **O** — Abierto/cerrado | Agregar francés = agregar una entrada a los `Record<LearningLanguage, ...>` (el compilador obliga a completar todos los adaptadores); cambiar Pexels por Unsplash = un adaptador nuevo, cero cambios en dominio |
| **L** — Sustitución de Liskov | Los tests usan `FakeCourseRepository` en memoria donde producción usa `SupabaseCourseRepository` — intercambiables porque ambos cumplen el puerto |
| **I** — Segregación de interfaces | Puertos mínimos: `ImageProvider` tiene un solo método `findImageUrl()`, no un mega-repositorio |
| **D** — Inversión de dependencias | `IngestContentUseCase` depende de interfaces, nunca de implementaciones; NestJS inyecta las concretas vía tokens `Symbol` (`ingest.module.ts`) |

### Cómo se desarrolló: TDD

Todo el código nació con **Test-Driven Development**: primero se escribe el test, se corre
para verlo **fallar** (RED), se implementa lo mínimo para que pase (GREEN), y se commitea.
39 tests en 3 niveles:

1. **Unit** — dominio y casos de uso con fakes de los puertos: sin red ni BD, milisegundos.
2. **Integración** — cada adaptador contra respuestas HTTP simuladas con **msw**; el fixture
   de Tatoeba se capturó de la **API real** con curl (y reveló que la respuesta difería de lo
   asumido: `translations` es un array plano y el parámetro `sort` es obligatorio).
3. **End-to-end** — supertest levanta la app NestJS real y verifica los endpoints, incluidos
   los códigos de error semánticos.

### Problemas reales encontrados (oro para entrevistas)

1. **La API de Tatoeba no coincidía con la documentación asumida**: sin `sort` devuelve 400,
   las traducciones vienen planas, y **ya no expone audio**. Solución: capturar la respuesta
   real como fixture, ajustar el mapper, y diseñar `audioUrl: null` → el cliente usa TTS.
   Lección: *verificar contra la API real antes de codificar el adaptador*.
2. **Decoradores de NestJS vs Vitest**: esbuild no soporta `emitDecoratorMetadata`; se
   resolvió con `unplugin-swc` (la receta oficial de NestJS para Vitest).
3. **CI falló al primer push**: `pnpm/action-setup` no permite declarar la versión de pnpm
   dos veces (workflow + `packageManager` en package.json). Se quitó del workflow: el
   `packageManager` es la única fuente de verdad.
4. **URL de Supabase mal formada en el `.env`** (incluía `/rest/v1/`): el cliente de
   supabase-js agrega esa ruta solo. El error "Invalid path specified in request URL" llevó
   al diagnóstico.
5. **Palabras sin material**: "it" no consiguió traducción/oración → el pipeline la salta y
   la reporta en `skippedWords` en vez de abortar. La resiliencia se diseñó desde el spec:
   *la ingesta nunca aborta completa*.

### Verificación de punta a punta (smoke real)

```
pnpm --filter @lingoleap/api ingest --lang en --level A1 --limit 15
→ { materialsBuilt: 14, exerciseCount: 45, lessonCount: 5, unitCount: 1, skippedWords: ["it"] }

GET /courses          → [{ language: "en", level: "A1", title: "Inglés A1" }]
GET /courses/en/A1    → 200 (curso completo, 15KB)
GET /courses/it/C2    → 404 { code: "COURSE_NOT_FOUND" }
GET /lessons/:id      → "Lección 1", 10 ejercicios; ej: translate "You dance." → "Tú bailas."
```

### Deuda técnica registrada (consciente y priorizada)

De la revisión final de código, aceptada para Fase 1 con justificación:

- `saveCourse` no es transaccional (delete + 4 inserts). Aceptable hoy porque solo lo llama
  el CLI offline re-ejecutable; **primer ticket de Fase 2**: función Postgres (RPC) que haga
  todo en una transacción.
- El API de lectura arranca con la clave `service_role` (admin) aunque solo lee: **antes de
  desplegar** hay que separar los entornos (API → clave anónima + RLS; CLI → service role).
- Las primeras palabras por frecuencia del A1 son funcionales ("the", "of"...): falta un
  filtro de *stopwords* para que el curso arranque con sustantivos enseñables.
- Throttling entre llamadas del pipeline y contadores de imágenes/audio en el reporte.

> Saber nombrar tu deuda técnica y por qué la aceptaste vale tanto como no tenerla.

### Números de la fase

- 18 commits · 69 archivos · ~6.100 líneas · 39 tests · CI verde
- 14 tareas de plan ejecutadas con TDD, cada una con revisión de código independiente
  (spec compliance + calidad) antes de integrarse

---

## Guía rápida de entrevista

**"Háblame de un proyecto tuyo"** — guion de 60 segundos:

> Construí una app de idiomas tipo Duolingo con una restricción dura: costo cero. Como no
> existe una API de lecciones, diseñé un pipeline que compone las lecciones desde datasets
> abiertos: listas de frecuencia para el currículo, Tatoeba para oraciones reales, MyMemory
> para traducciones y Pexels para imágenes. El backend es NestJS con arquitectura hexagonal:
> el dominio es TypeScript puro y las integraciones externas son adaptadores intercambiables
> detrás de interfaces, lo que me dejó testear todo con fakes — 39 tests escritos con TDD.
> El contenido se ingesta offline a Postgres (Supabase), así los rate limits de las APIs
> gratuitas nunca tocan al usuario. Todo corre en CI con GitHub Actions.

**Preguntas probables y dónde apoyarte:**

- *¿Qué es la arquitectura hexagonal?* → "El dominio en el centro, sin conocer frameworks;
  la app define interfaces (puertos) y la infraestructura las implementa (adaptadores). En mi
  repo: `application/ports/` vs `infrastructure/providers/`."
- *¿Cómo aplicaste SOLID?* → usa la tabla de arriba, con la **D** como estrella: "mis casos
  de uso reciben interfaces por constructor; NestJS inyecta la implementación real y los
  tests inyectan fakes".
- *¿Cómo testeas integraciones externas?* → "3 niveles: fakes para la lógica, msw con
  fixtures reales para los adaptadores, supertest para la API. El fixture de Tatoeba lo
  capturé de la API real y me reveló que la doc asumida estaba mal."
- *¿Qué harías diferente / deuda técnica?* → usa la sección de deuda: transaccionalidad de
  `saveCourse` y separación de claves. Demuestra criterio, no perfección.
- *¿Qué es CI?* → "Cada push dispara lint + build + tests en GitHub Actions; nada se integra
  si el pipeline no está en verde. Mi primer push falló por un conflicto de versiones de pnpm
  y ahí mismo lo arreglé — para eso está."

---

*Próxima entrada: Fase 2 — frontend web en React.*
