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

## Fase 2 — Web en React (auth, camino del curso, reproductor de lecciones) (2026-07-11) ✅

### El problema a resolver

Construir el primer cliente sobre el backend hexagonal de la Fase 1: una web donde alguien
se registra, ve su camino de lecciones con desbloqueo progresivo, y completa una lección de
principio a fin (4 tipos de ejercicio, con corrección y texto a voz) sin que el frontend
duplique lógica de dominio que ya vive en `packages/core` — porque esa misma lógica la va a
reutilizar la futura app móvil (Fase 4).

### Decisiones técnicas y su porqué

| Decisión | Alternativas consideradas | Por qué se eligió |
|---|---|---|
| **zustand** para el estado de sesión de una lección en curso (fase, índice, aciertos) | `useReducer` local; Context API | El estado (¿qué ejercicio toca?, ¿en feedback o respondiendo?) vive fuera del árbol de componentes, sobrevive a re-renders del reproductor y no necesita Provider/boilerplate para un solo store |
| **TanStack Query** para el estado de servidor (cursos, progreso, lección) | `fetch` en `useEffect` + `useState` | Cache y deduplicación automática; invalidación declarativa (`invalidateQueries(['progress'])` al completar una lección) — separa con nitidez "datos que vienen del servidor" (Query) de "estado de interfaz" (zustand), en vez de mezclarlos en un solo `useState` |
| **Lógica de desbloqueo progresivo** (`computePathStatus`) **y máquina de estados de la sesión** (`startSession`/`submitAnswer`/`advance`) como funciones puras en `packages/core` | Escribirlas directamente en los componentes de `apps/web` | Son funciones puras (input → output, sin React ni DOM) testeadas con Vitest sin renderizar nada; la futura app móvil las importa tal cual, sin reescribir la regla de negocio |
| **`@lingoleap/api-client`** como SDK tipado propio | Llamar `fetch` directo desde cada feature | Un solo lugar centraliza el header `Authorization: Bearer`, y traduce errores HTTP a `ApiError` con el mismo código semántico que ya expone el backend (`COURSE_NOT_FOUND`, etc.); reutilizable por mobile |
| **`@lingoleap/tokens`** como paquete de design tokens (colores, radios, espaciados) | Definir CSS/valores en cada app por separado | Web y la futura mobile comparten la misma paleta; y se volvió la regla dura del proyecto — "los colores solo salen de tokens, nunca hex a mano" (violada una vez y corregida en review, problema #4 abajo) |
| **TTS del navegador** (`Web Speech API`, hook `useSpeech`) para pronunciar y para el ejercicio de escucha | Servir archivos de audio pregrabados | Ya decidido en Fase 1 (Tatoeba no expone audio); acá se implementa el lado cliente: mapear idioma → BCP-47 (`en-US`, `pt-BR`, `it-IT`) y bajar la velocidad a 0.95 para aprendizaje |
| **Selección del banco de palabras por índice**, no por string elegido | Guardar el string de la ficha tocada | Las oraciones reales tienen tokens repetidos ("the… the…"); un array de índices sobre `wordBank` identifica sin ambigüedad *cuál* ficha física se usó, aunque el texto se repita |
| **Supabase Auth** (email/contraseña + Google OAuth) para login/registro | Sistema de auth propio | Ya incluido en el plan gratuito de Supabase usado desde Fase 1; `user_progress` ya tenía RLS por `auth.uid()`; evita construir registro, hash de contraseñas y recuperación desde cero |

### División de responsabilidades en el frontend, explicada con este código

**Regla: el dominio no sabe de React.** `packages/core` (`computePathStatus`,
`startSession/submitAnswer/advance`, `normalizeAnswer/isTokenAnswerCorrect`) son funciones
puras sin imports de React — se testean llamándolas directo, sin `render()`.

- **Estado de servidor** (`features/course-path/queries.ts`): hooks `useCourses`,
  `useCourse`, `useProgress` sobre TanStack Query. Su única responsabilidad es traer datos
  del backend vía `api` (el SDK de `@lingoleap/api-client`) y cachearlos.
- **Estado de sesión** (`features/lesson-player/sessionStore.ts`): un store de zustand que
  es un envoltorio delgado sobre las funciones puras de `packages/core` — el store no
  calcula nada, solo guarda el resultado de llamarlas.
- **Estado de auth** (`features/auth/AuthProvider.tsx` + `useAuth` + `RequireAuth`): un
  Context de React sobre la sesión de Supabase; `RequireAuth` es el único componente que
  decide si redirigir a `/login`.
- **Componentes de ejercicio** (`features/lesson-player/exercises/`): reciben props tipadas
  por un contrato compartido `ExerciseComponentProps<E>` (`exercises/types.ts`) y solo llaman
  `onResolve(correct)` — no conocen la sesión, ni la API, ni el store. `LessonPlayerPage.tsx`
  es el único que conecta ejercicio ↔ store ↔ API.

### Cómo se desarrolló: TDD

Mismo flujo que en Fase 1 — test primero (falla, RED), implementación mínima (GREEN), commit.
La fase sumó **39 tests nuevos** (39 → 78 en todo el monorepo, en 29 archivos de test):

- **`packages/core`**: 10 tests — funciones puras, sin mocks (`answer-validation`,
  `path-status`, `lesson-session`).
- **`packages/api-client`**: 4 tests — con **msw** simulando el backend (token adjunto,
  errores semánticos).
- **`apps/api`**: 47 tests (39 de Fase 1 + 8 nuevos: `AuthVerifier`, progreso, guard, filtro
  de stopwords).
- **`apps/web`**: 17 tests — **Testing Library** con `@testing-library/react` +
  `user-event` + `jsdom`; se testea *comportamiento visible* (roles ARIA, texto en pantalla),
  nunca implementación interna. El test de `LessonPlayerPage` es el más valioso: simula con
  `userEvent` una lección completa de punta a punta (responde 3 tipos de ejercicio distintos,
  ve el feedback, avanza, llega a la pantalla de finalización) contra un `api` mockeado —
  es la prueba que más confianza da de que las piezas (store + queries + componentes de
  ejercicio) encajan.

### Problemas reales encontrados (oro para entrevistas)

1. **`vi.mock` + hoisting de Vitest → `ReferenceError: Cannot access '<fixture>' before
   initialization`**: Vitest eleva (hoiza) las llamadas a `vi.mock()` por encima de las
   declaraciones `const` del módulo; si el factory del mock lee una variable declarada más
   abajo en el archivo, revienta en tiempo de ejecución antes de que corra ni un test. Pasó
   dos veces (`CoursePathPage.spec.tsx` y, de nuevo, `LessonPlayerPage.spec.tsx`) porque el
   patrón de fixture-arriba-del-mock es natural de escribir. Solución: `vi.hoisted(() => ({
   fixture }))`, el mecanismo oficial de Vitest para declarar valores que el mock necesita
   antes de que el módulo termine de evaluarse. Lección: *entender el orden de ejecución de
   un test runner no es opcional cuando se usa module mocking*.
2. **`pnpm build` rompía solo en `apps/web`, con un error que apuntaba al paquete
   equivocado**: `"LingoApiClient" is not exported by ".../api-client/dist/index.js"` al
   construir con Vite. Causa real: pnpm resuelve paquetes del workspace por symlink a su
   ruta real (`packages/core`, `packages/api-client`), *fuera* de `node_modules`; el
   `commonjsOptions.include` por defecto de Vite (`/node_modules/`) no cubre esa ruta, así
   que el plugin de interop CJS→ESM nunca tocaba esos `dist/index.js` (compilados como
   CommonJS porque `tsconfig.base.json` es compartido con el backend NestJS). Rollup solo
   reporta el primer binding roto que encuentra, lo que hizo parecer que solo fallaba
   `api-client` cuando en realidad `core` tenía el mismo problema. Se descartó
   `resolve.preserveSymlinks: true` (rompe dependencias transitivas hoisted por pnpm) y se
   descartó tocar `tsconfig.base.json` (afectaría al build del backend). Fix acotado a
   `apps/web/vite.config.ts`: `commonjsOptions.include: [/packages\/core/,
   /packages\/api-client/, /node_modules/]`.
3. **Los tests de `LoginPage` se contaminaban entre sí**: con `globals: false` en
   `vitest.config.ts`, `@testing-library/react` no registra su auto-cleanup entre tests
   (ese registro depende de los hooks globales de Vitest/Jest). El segundo test de la suite
   heredaba el DOM montado por el primero y `getByRole('button', { name: 'Entrar' })› fallaba
   por "multiple elements found". Solución: `afterEach(() => cleanup())` explícito en
   `test/setup.ts`. Lección: *`globals: false` es más explícito, pero apaga magia que uno
   asume gratis — hay que revisar qué depende de esos globals*.
4. **Un `#ffffff` hardcodeado se coló en el primer CSS y lo atrapó el review**: el botón
   primario tenía `color: #ffffff` en vez de `var(--color-surface)`, violando la restricción
   del proyecto de que los colores solo salen de `@lingoleap/tokens`. El bug no rompía nada
   visualmente (el token vale lo mismo), pero rompía la garantía de que un cambio de tema
   futuro (dark mode, rebrand) solo toca `tokens.css`. Corregido en review antes de mergear.
5. **Un `aria-label` le ganaba al texto visible como nombre accesible del botón**: el botón
   grande de Listening tenía tanto el texto "🔊 Escucha y escribe lo que oíste" como
   `aria-label="Escuchar"` — y en el algoritmo de *accessible name* del navegador, el
   `aria-label` siempre gana sobre el contenido de texto, así que un lector de pantalla
   anunciaba solo "Escuchar", no la instrucción completa. El `aria-label` es correcto en el
   botón de Translate (que es *solo* un ícono 🔊 sin texto), pero era un error copiarlo al
   botón que ya tenía texto propio. Lección: *`aria-label` no es "una etiqueta extra", es un
   reemplazo total — solo se usa cuando no hay texto visible que sirva de nombre*.
6. **`new Audio(url).play()` es una promesa, y nadie la esperaba**: el ejercicio de escucha
   reproduce un archivo de audio si `exercise.audioUrl` existe; `.play()` devuelve una
   promesa que los navegadores rechazan si las políticas de autoplay lo bloquean (o si la
   URL falla). Sin `.catch()`, ese rechazo queda como una promesa no manejada — en el mejor
   caso un warning en consola, en el peor un audio que nunca suena y ningún indicio de por
   qué. Fix: `.play().catch(() => speak(exercise.text))` — si el audio pregrabado falla, cae
   al TTS del navegador como plan B, coherente con la decisión de Fase 1 de que el TTS es la
   fuente de audio de respaldo.
7. **`setTimeout` sin limpiar en `MatchPairsExercise`**: el flash rojo de 400ms al fallar una
   pareja se armaba con `window.setTimeout`, pero si el usuario navegaba fuera del ejercicio
   antes de que el timeout disparara, React tiraba el warning clásico de "no se puede
   actualizar el estado de un componente desmontado" — un memory leak silencioso en producción.
   Fix: guardar el id en un `useRef` y limpiarlo tanto antes de programar uno nuevo como en el
   cleanup de un `useEffect` vacío (`return () => clearTimeout(ref.current)`).
8. **El reproductor de lecciones no tenía guarda para una lección sin ejercicios**: el review
   final encontró que `startSession` deja la fase en `'answering'` sin importar cuántos
   ejercicios tenga la lección, así que `renderExercise` indexaba `exercises[0]` sobre un
   array vacío y explotaba con `TypeError: Cannot read properties of undefined`. No lo
   cubría el test dado en el brief porque ese test usa una lección con ejercicios reales.
   Fix: guarda explícita que muestra "Esta lección no tiene ejercicios" con un botón de
   vuelta, más un test que fuerza `exercises: []` y confirma que `completeLesson` nunca se
   llama en ese caso. Lección: *un test que pasa con el "camino feliz" no prueba que el
   camino vacío esté cubierto — hay que pedirlo explícitamente*.

### Deuda técnica registrada (consciente y priorizada)

- `AuthGuard.verifyToken` no atrapa errores de red hacia Supabase Auth: si Supabase está caído,
  el guard lanza una excepción no controlada (500) en vez de responder 401. Aceptable para MVP
  porque Supabase Auth es el mismo proveedor que ya sostiene toda la persistencia.
- `normalizeAnswer` no aplica `Unicode NFC` antes de comparar: dos formas de escribir el mismo
  acento (compuesto vs. precompuesto) podrían no matchear. No se disparó en los tests porque
  los fixtures usan una sola forma; **antes de exponer el input a usuarios reales** hay que
  agregar `.normalize('NFC')`.
- La distinción visual entre lección "desbloqueada" y "completada" en el camino del curso es
  débil (solo cambia la opacidad) — deuda de diseño, no de lógica: `computePathStatus` ya
  devuelve el estado correcto, falta el tratamiento visual.
- El guard de `completedRef` que evita reenviar `completeLesson` dos veces al cambiar de
  `:lessonId` en la misma ruta montada quedó sin test directo (se encontró y corrigió por
  auto-revisión, no por TDD) — vale agregarle cobertura cuando exista navegación "siguiente
  lección" que mantenga `LessonPlayerPage` montado entre lecciones.
- `saveCourse` (Fase 1) sigue sin ser transaccional — deuda heredada, aún no abordada.
- **Smoke real end-to-end pendiente** (Task 17 del plan): todo lo de arriba está verificado
  con tests automatizados y build limpio, pero falta correr la app contra un backend real
  desplegado (cuenta Supabase real, navegador real) antes de dar la fase por cerrada de
  verdad.

> Los problemas 1 y 2 de esta fase son los más "de infraestructura de build/test" que hasta
> ahora aparecieron en el proyecto — buena señal de que la lógica de dominio (Fase 1 y
> `packages/core`) es sólida y lo que falla es el cableado entre herramientas, no las reglas
> de negocio.

### Números de la fase

- 20 commits · 76 archivos · +3.747/−44 líneas · 39 tests nuevos (39 → 78 en el monorepo,
  29 archivos de test) · CI verde
- 15 tareas de plan ejecutadas con TDD (Task 16 es esta entrada de documentación), cada una
  con revisión de código independiente antes de integrarse; 5 de ellas (Tasks 9, 10, 13, 14,
  15) tuvieron un commit adicional (`fix(web): …` en cuatro casos, `refactor(web): …` en uno)
  por hallazgos de esa revisión (ver problemas #3–8 arriba)

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
> gratuitas nunca tocan al usuario. Todo corre en CI con GitHub Actions. Encima construí el
> cliente web en React: TanStack Query para el estado de servidor, zustand para el estado de
> la sesión de una lección, y la lógica de negocio (desbloqueo progresivo, validación de
> respuestas) vive como funciones puras en un paquete compartido — lista para reusarse cuando
> haga la versión móvil con React Native.

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

**Temas de React (Fase 2):**

- *¿Para qué usaste `useEffect` y `useRef` en este proyecto, en concreto?* → "`useEffect` en
  `LessonPlayerPage` arranca la sesión (`start(lesson)`) una vez que llega la lección de
  TanStack Query, y en `MatchPairsExercise` limpio un `setTimeout` al desmontar para no
  actualizar estado de un componente que ya no existe — sin ese cleanup, React tira el warning
  clásico de memory leak. `useRef` lo usé para guardas que no deben disparar un re-render:
  `completedRef` evita que `completeLesson` se llame dos veces, `resolvedRef` en MatchPairs
  evita que `onResolve` dispare más de una vez. La regla que aprendí: si el valor no debe
  causar un render cuando cambia, es `useRef`, no `useState`."
- *¿Por qué separaste TanStack Query de tu estado local (zustand)?* → "Porque son datos de
  naturaleza distinta: el curso y el progreso *viven en el servidor* — pueden quedar viejos,
  hay que revalidarlos, otro dispositivo puede cambiarlos — y ahí Query brilla (cache,
  invalidación, refetch). La fase actual del ejercicio que estoy respondiendo *no existe en
  ningún servidor*, es puramente de esta pestaña — ahí uso zustand. Mezclarlos en un solo
  `useState` es la forma más común en la que he visto bugs de estado desincronizado."
- *¿Cómo testeas componentes de React?* → "Con Testing Library: `render` + `screen.getByRole` +
  `userEvent`, nunca `getElementById` ni tocar el estado interno — si el test sobrevive a un
  refactor que no cambia el comportamiento visible, está bien escrito. El test que más orgullo
  me da es el de `LessonPlayerPage`: con `userEvent` simulo una lección completa — contestar
  varios tipos de ejercicio, ver el feedback, avanzar, llegar a la pantalla final — contra un
  `api` mockeado. Si ese test pasa, sé que el store, las queries y los componentes de ejercicio
  encajan de verdad, no en aislamiento."
- *¿Cómo manejaste la autenticación?* → "`AuthProvider` envuelve la app con la sesión de
  Supabase Auth (email/contraseña + Google OAuth) vía Context; `useAuth` la expone; `RequireAuth`
  es el único componente que decide si redirige a `/login` cuando no hay sesión. El resto de la
  app ni sabe que la auth existe — solo usa `useAuth()` si necesita el usuario."
- *¿Qué harías diferente en el frontend?* → usa la sección de deuda de la Fase 2: falta
  `normalize('NFC')` antes de comparar respuestas de usuarios reales, y el guard de
  `completedRef` no tiene test directo — se encontró por auto-revisión, no por TDD.

---

*Próxima entrada: Fase 3 — gamificación (XP, rachas, corazones, ligas semanales, logros).*
