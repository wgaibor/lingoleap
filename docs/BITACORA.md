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

> El botón "Continuar con Google" está implementado en código (`LoginPage.handleGoogle`), pero
> configurarlo de verdad requiere un OAuth Client ID en Google Cloud Console — durante el smoke
> real (Task 17) el usuario decidió posponerlo como feature futura y probar el smoke completo
> solo con email/contraseña, que sí quedó verificado de punta a punta.

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
- ~~La distinción visual entre lección "desbloqueada" y "completada" en el camino del curso es
  débil (solo cambia la opacidad)~~ — **resuelto durante el smoke** (fix 590d427): ahora cada
  círculo muestra ✓ (completada), el número de posición (desbloqueada) o 🔒 (bloqueada), con
  colores distintos por estado.
- El guard de `completedRef` que evita reenviar `completeLesson` dos veces al cambiar de
  `:lessonId` en la misma ruta montada quedó sin test directo (se encontró y corrigió por
  auto-revisión, no por TDD) — vale agregarle cobertura cuando exista navegación "siguiente
  lección" que mantenga `LessonPlayerPage` montado entre lecciones.
- `saveCourse` (Fase 1) sigue sin ser transaccional, y el smoke real reveló una consecuencia
  concreta: re-ingestar reemplaza las lecciones con UUIDs nuevos y el `on delete cascade` de
  `user_progress` borra el progreso de usuarios existentes (detalle completo en "Idempotencia"
  más abajo).
- La migración `supabase/migrations/0002_progress.sql` no es re-ejecutable (`create policy` sin
  guard) — decisión aceptada: se corre una sola vez por proyecto Supabase.
- El botón "Reintentar" de `CompletionScreen` no deshabilitaba el botón mientras la mutación de
  reintento estaba en curso (hallazgo de la revisión final de rama, commit 7e9d8b9) —
  **arreglado en el cierre de la Fase 2** (ver "Idempotencia" más abajo).
- **Smoke real end-to-end** (Task 17 del plan): ~~pendiente~~ **completado el 12 de julio de
  2026** — ver la sección dedicada más abajo.

> Los problemas 1 y 2 de esta fase son los más "de infraestructura de build/test" que hasta
> ahora aparecieron en el proyecto — buena señal de que la lógica de dominio (Fase 1 y
> `packages/core`) es sólida y lo que falla es el cableado entre herramientas, no las reglas
> de negocio.

### Smoke real end-to-end (Task 17)

El plan reservaba la Task 17 para un recorrido manual real, en el navegador, con una cuenta de
usuario real — la única verificación que ningún test automatizado puede reemplazar. Se hizo el
12 de julio de 2026, después de cerrar en verde las 15 tareas de código y la revisión final de
la rama (commit 7e9d8b9).

**El recorrido**: registro con email, login, curso "Inglés A1", lecciones 1 y 2 completadas de
punta a punta, progreso persistido en `user_progress` (verificado directo en la base de datos),
desbloqueo progresivo funcionando, y sesión cerrada y reabierta con el progreso intacto.

**Lo que encontró — 7 problemas reales que ningún test automatizado había atrapado:**

1. **(624bc9f)** El token `'s` (clítico posesivo inglés) de la lista de frecuencia rompía la
   ingesta contra Tatoeba (HTTP 500) y, peor, el fallo de UNA palabra abortaba TODO el
   pipeline — violando el principio de resiliencia que el spec de Fase 1 ya había fijado ("la
   ingesta nunca aborta completa"). Fix: filtro `/^\p{L}+$/u` para el token, más un `try/catch`
   por palabra en el caso de uso que ahora la salta y la reporta en `skippedWords`.
2. **(a41ae4c)** En modo `dev` de Vite, los paquetes CJS del workspace se servían sin
   transformar: `"LingoApiClient" is not exported by ...`. Los tests pasaban y `pnpm build`
   pasaba — el modo dev nunca se había ejercitado hasta este smoke. Fix: `optimizeDeps.include`
   en `vite.config.ts`.
3. **(a18fac7)** El registro no daba ningún feedback visual y el login no navegaba a la app —
   no existía un solo `navigate()` en todo el flujo de auth.
4. **(590d427)** El camino del curso se veía apretado e ilegible — rediseño tipo roadmap
   vertical.
5. **(b91b85f)** El botón "Continuar" verde sobre la barra de feedback verde era casi
   invisible — hallazgo de UX puro del usuario durante el smoke.
6. **(f6d45ed)** Sin porcentaje de progreso del curso, sin contador de ejercicio dentro de la
   lección, sin ningún refuerzo motivacional — se agregaron los tres.
7. **(3ae1b9e)** Las imágenes de Pexels del ejercicio "elige la imagen" se veían estiradas y
   aplastadas por un marco demasiado ancho; de paso, la revisión de código atrapó una sombra
   con un color crudo (`rgba(...)`) que debía salir de un token.

**El incidente que validó dos decisiones de arquitectura**: a mitad del smoke, la API de
Tatoeba se cayó por completo (500 hasta en su propia web) — una caída externa real, no
simulada. Confirmó en producción dos decisiones de la Fase 1: la arquitectura de "BD como
caché" (la app siguió funcionando perfectamente sin que Tatoeba respondiera, porque el
contenido ya estaba ingerido en Supabase) y el invariante de dominio de `createCourse` (un
curso sin unidades lanza `InvalidContentError`, así que una ingesta 100% fallida no pudo dejar
guardado un curso vacío). La re-ingesta con el filtro de stopwords quedó pendiente de que
Tatoeba se recupere.

**La lección para entrevistas**: los tests unitarios/integración estaban en 28/28 verde en
`apps/web` (y verdes en todo el monorepo), `pnpm build` y `pnpm lint` limpios, y aun así el
smoke encontró 7 problemas reales. Esa es la diferencia entre "los tests pasan" y "el producto
funciona": los tests automatizados verifican comportamiento que alguien pensó en escribir; el
smoke expone todo lo que nadie pensó en testear porque nadie lo había visto correr de verdad.

### Idempotencia: dónde está y dónde falta

Revisar el bug del botón "Reintentar" sin `disabled` (ver Deuda técnica) llevó a hacer una
pasada explícita por el resto del código preguntando "¿qué pasa si esta operación se ejecuta
dos veces?" — la pregunta central detrás de la idempotencia: **poder repetir una operación sin
que el resultado cambie más allá de la primera vez**. Importa en cualquier sistema con
reintentos de red, que es exactamente el caso de este proyecto: un POST que falla y el cliente
(o el usuario, a mano) lo reintenta.

**Ya idempotente:**

| Dónde | Por qué |
|---|---|
| Upsert de progreso (`SupabaseProgressRepository`, `.upsert(..., { onConflict: 'user_id,lesson_id', ignoreDuplicates: true })`) | Completar la misma lección dos veces no duplica filas — el servidor es seguro ante reintentos aunque el cliente falle |
| `completedRef` + guard de pertenencia en `LessonPlayerPage` | Una sola llamada a `completeLesson` por lección, incluso si el efecto se re-evalúa o la ruta se reutiliza entre lecciones |
| `submitAnswer` / `advance` (`packages/core/src/logic/lesson-session.ts`) | Son no-ops fuera de su fase (`if (state.phase !== 'answering') return state`, `if (state.phase !== 'feedback') return state`) — un doble clic en "Comprobar" o "Continuar" no rompe la máquina de estados |
| La ingesta de contenido (`IngestContentUseCase` + `saveCourse`) | Re-ejecutable por diseño: `saveCourse` borra el curso existente (por `language`+`level`) antes de insertar el nuevo, así que correr el CLI dos veces con el mismo idioma/nivel reemplaza el curso en vez de duplicarlo |

**Falta (deuda consciente, plan de hardening antes de desplegar):**

- `saveCourse` no es transaccional (`delete` + 4 `insert` secuenciales). Si falla a mitad de
  camino, el curso queda en estado parcial. Ticket ya registrado desde la Fase 1: una función
  RPC de Postgres (`replace_course`) que haga todo en una sola transacción.
- Re-ingestar un curso genera lecciones con UUIDs nuevos (la tabla los autogenera), y
  `user_progress.lesson_id` referencia `lessons(id) on delete cascade` — así que una
  re-ingesta **borra el progreso de los usuarios que ya habían completado lecciones de ese
  curso**. Aceptable en desarrollo (donde corrió este smoke); bloqueante antes de producción:
  hace falta IDs estables entre re-ingestas o una migración explícita de progreso.
- La migración `supabase/migrations/0002_progress.sql` no es re-ejecutable: sus `create policy`
  no llevan guard. Decisión aceptada desde la Task 1: se corre una sola vez por proyecto
  Supabase.
- El botón "Reintentar" de `CompletionScreen` no tenía `disabled` mientras la mutación de
  reintento estaba en curso — un doble clic rápido podía disparar dos POST. El servidor ya era
  idempotente (ver tabla de arriba), así que no rompía nada, pero era un descuido de cliente.
  **Arreglado en el cierre de esta fase.**

### Números de la fase

- 31 commits · 84 archivos · +4.658/−91 líneas · 91 tests en el monorepo (39 al cierre de la
  Fase 1 → 91) · CI verde
- 17 tareas de plan ejecutadas (16 con TDD; Task 16 es la entrada de documentación y Task 17 es
  el smoke manual), cada una con revisión de código independiente antes de integrarse; 5 de
  ellas (Tasks 9, 10, 13, 14, 15) tuvieron un commit adicional por hallazgos de esa revisión
  (ver problemas #3–8 arriba), y el smoke (Task 17) sumó 7 commits de fix/mejora en vivo (ver
  arriba)

---

## Fase 3A — Gamificación: XP, niveles, racha diaria y corazones (2026-07-13)

> Código de las 10 tareas técnicas completo y en verde en `feature/fase-3a-gamificacion`. El
> smoke real de la Task 12 (2026-07-14) encontró un bug real de UI (ver problema #4 abajo),
> ya arreglado con TDD; queda pendiente el merge final a `master`.

### El problema a resolver

Sumar los primeros mecanismos de motivación (XP, niveles, racha diaria con congeladores,
corazones con regeneración) sin tocar el modelo de contenido de las Fases 1-2, dejando el
terreno listo para la Fase 3B (gemas ya activas en el esquema, ligas semanales, logros) y para
que la futura app móvil (Fase 4) reutilice exactamente la misma lógica de negocio, sin
reescribirla en React Native.

### Decisiones técnicas y su porqué

| Decisión | Alternativas consideradas | Por qué se eligió |
|---|---|---|
| **Regeneración de corazones calculada al leer** (`regenerateHearts` en `GetStatsUseCase` y en `CompleteLessonUseCase`), nunca persistida por un job | Cron/worker en background que sume corazones periódicamente | `GET /me/stats` nunca escribe: solo lee `hearts` + `hearts_updated_at` guardados y calcula cuántos corazones "deberían" existir ahora mismo, comparando timestamps. Costo $0 (no hay proceso corriendo) y cero estado adicional que mantener sincronizado. La regla completa: sin corazones solo se pueden abrir lecciones ya completadas (repaso) — `canStartLesson(hearts, lessonAlreadyCompleted)` en `packages/core` |
| **La fecha de racha la aporta el cliente** (zona horaria del usuario), **XP y corazones se calculan solo en el servidor** con entrada clampada | Confiar también en XP/corazones que mande el cliente; o calcular la fecha en el servidor (UTC) | `localDateString()` en `apps/web/src/shared/localDate.ts` usa `getFullYear/getMonth/getDate` (hora LOCAL del navegador) — nunca `toISOString()`, que devuelve el día en UTC y rompería la racha de cualquiera que complete una lección de noche cerca de la medianoche local. Pero esa fecha es la *única* concesión al cliente: el servidor clampa `errorCount` a enteros `[0, 50]` y valida `clientDate` con `/^\d{4}-\d{2}-\d{2}$/` (si no matchea, usa `nowIso.slice(0, 10)`, la fecha UTC del propio servidor) — el cliente nunca puede inflar XP o inventar corazones |
| **`gems`/`streak_freezes` nacen en la migración `0003_stats.sql`** aunque no se otorgan ni se gastan gemas todavía (se activan en 3B) | Migrar el esquema dos veces (una para stats base, otra para gemas/congeladores) | Evitar una segunda migración sobre una tabla que ya tiene usuarios reales; la regla de racha (`applyLessonDay`) ya contempla consumir un congelador si `freezes > 0`, así que el campo no es especulativo — solo falta la UI/lógica para ganarlos |
| **Orden de escrituras en `CompleteLessonUseCase`: `markLessonCompleted` antes de `stats.save`** — adjudicada por Joao durante la Task 6, no en el plan original | Guardar primero las stats y el progreso después | Es retry-safe: si `stats.save` falla, **nada** de las stats quedó persistido, y un reintento del cliente recalcula XP/racha/corazones desde el estado original (`stored`) sin duplicar nada. El orden inverso (stats primero) sí duplicaría XP en un reintento: la lección ya contaría como parcialmente premiada mientras el `markLessonCompleted` todavía no se confirmó. Conecta directo con el análisis de idempotencia que cerró la Fase 2 — la misma pregunta ("¿qué pasa si esto se ejecuta dos veces?") aplicada a un caso nuevo |

### Confianza cliente/servidor: qué se acepta y qué se recalcula

El body de `POST /progress/lessons/:id/complete` es `{ errorCount?: number; date?: string }` —
ambos campos vienen del cliente y **ninguno se usa tal cual**:

- `errorCount` se clampa con `Math.min(50, Math.max(0, Math.floor(input.errorCount)))` antes de
  tocar cualquier fórmula — un cliente modificado no puede mandar `errorCount: -999` para ganar
  XP máximo, ni `errorCount: 999999` para autodestruir sus corazones de otro usuario (el
  `userId` sale del JWT verificado por `AuthGuard`, nunca del body).
- `date` solo se acepta si matchea el regex de fecha; si no, se descarta y se usa la fecha UTC
  del propio servidor. Es la única entrada de cliente con efecto real (decide si la racha se
  extiende hoy o mañana según *su* zona horaria), pero no puede alterar XP ni corazones — solo
  el conteo de días consecutivos.
- XP, nivel, corazones perdidos y si se usó un congelador de racha: **100% recalculados en el
  servidor** a partir del estado guardado en `user_stats` más el `errorCount` ya clampado. El
  cliente nunca envía "gané 15 XP"; el servidor decide cuánto XP corresponde.

### Funciones puras compartidas core↔backend (y futura app móvil)

`packages/core/src/logic/xp.ts`, `streak.ts` y `hearts.ts` son funciones puras — mismo patrón
que `path-status.ts`/`lesson-session.ts` de la Fase 2, pero esta vez **el consumidor principal
es el backend**, no la web:

- `lessonXp(errorCount)`, `xpRequiredForLevel(level)`, `levelProgress(totalXp)` — sin estado,
  sin I/O.
- `applyLessonDay(input, today)` — recibe el estado de racha y "hoy", devuelve el nuevo estado;
  no sabe qué hora es ni de dónde salió `today`.
- `regenerateHearts(state, nowIso)`, `loseHearts(hearts, errorCount)`, `nextHeartAt(state)`,
  `canStartLesson(hearts, lessonAlreadyCompleted)` — el reloj (`nowIso`) entra como parámetro,
  nunca como `Date.now()` interno, así que el mismo código es 100% testeable sin mocks de
  tiempo y 100% reusable: `CompleteLessonUseCase` (NestJS) y `GetStatsUseCase` (NestJS) las
  llaman en el servidor; `LessonPlayerPage` (React) usa `canStartLesson` en la web para decidir
  si bloquear la pantalla; cuando exista la app móvil, las va a importar sin cambiar una línea.

### Cómo se desarrolló: TDD

Mismo flujo RED→GREEN→commit de las fases anteriores. La fase sumó **34 tests nuevos** (91 al
cierre de la Fase 2 → 125 en el monorepo, en 39 archivos de test):

- **`packages/core`**: 26 tests — `xp.spec.ts`, `streak.spec.ts`, `hearts.spec.ts` (Tasks 2-4),
  sin mocks, con el reloj inyectado por parámetro.
- **`apps/api`**: 59 tests (56 al cierre de la Task 5 + 3 nuevos en la Task 6) — casos de uso
  unitarios con `FakeStats`, y e2e con supertest sobre `GET /me/stats` y el `POST` de completar
  lección con `errorCount`/`date` reales en el body.
- **`packages/api-client`**: 6 tests — `getStats()` y `completeLesson()` con msw.
- **`apps/web`**: 34 tests — `StatsBar` (mock de `useStats`), `localDate.spec.ts` (formato con
  ceros), la extensión de `LessonPlayerPage.spec.tsx` con recompensas, corazones en vivo, el
  bloqueo sin corazones, y el test de regresión del problema #4 (Task 12).

### Problemas reales encontrados (oro para entrevistas)

1. **Regresión introducida por la Task 10, detectada por el revisor**: al hacer que
   `LessonPlayerPage` dependiera de `useStats()`/`useProgress()` (para mostrar corazones en
   vivo y bloquear lecciones), un error en `getStats`/`getCompletedLessonIds` (no un simple
   *pending*) dejaba `isPending` en `false` con `data` en `undefined` — el guard de carga se
   saltaba, `blocked` quedaba `false`, `start()` nunca corría, y la pantalla se congelaba en
   "Cargando…" para siempre, sin ningún indicio de que algo había fallado. Antes de esta tarea
   el reproductor no dependía de esos endpoints, así que el bug no existía. Fix (commit
   `8e22ee0`): una rama de error espejo del patrón ya usado para `lessonQuery.isError` —
   `<p role="alert">No pudimos cargar tus estadísticas.</p>` con un botón "Reintentar" que
   refetchea *solo* la query que falló — más un test que fuerza el rechazo y verifica tanto el
   mensaje de error como la recuperación tras el clic. Lección: *agregar una dependencia de
   datos nueva a un componente que antes no la tenía obliga a revisar sus tres estados
   (loading/error/success), no solo el camino feliz que pedía el brief*.
2. **No existía el token `--color-accent`** que el diseño de la `StatsBar` hubiera usado
   naturalmente para la barra de progreso de nivel. En vez de inventarlo o colar un hex crudo
   (la regla dura del proyecto desde la Fase 2, problema #4), se verificó el archivo real
   `packages/tokens/src/tokens.css` y se reutilizó el amarillo existente `--color-warning`
   (`#FFC800`) — la regla "solo tokens" se respeta *leyendo lo que hay*, no memorizando qué
   token "debería" existir.
3. **Un `not.toHaveBeenCalledWith` pasaba en falso por cambio de aridad**: al extender
   `completeLesson(id)` a `completeLesson(id, { errorCount, date })` en la Task 9, el test que
   verificaba "no se llamó con la lección anterior" seguía escrito como
   `expect(completeLesson).not.toHaveBeenCalledWith('l2')` — y eso pasaba *trivialmente*,
   porque el mock ahora siempre se llama con 2 argumentos, así que ninguna llamada real matchea
   una aserción de 1 argumento, sin importar qué lección sea. El test "pasaba" sin verificar
   nada. Se endureció a
   `expect(completeLesson).not.toHaveBeenCalledWith('l2', expect.anything())`. Lección: *cuando
   cambia la firma de una función mockeada, hay que revisar también las aserciones negativas —
   son las que más fácil quedan "pasando por accidente"*.
4. **La pantalla de finalización nunca llegaba a verse, encontrado en el smoke manual de la
   Task 12**: al completar una lección, `completeLesson` invalida `['stats']` y `['progress']`
   a propósito (para que la `StatsBar` se refresque). Ese refetch trae valores *genuinamente*
   distintos — el xp recién ganado, la lección agregada a completadas — así que TanStack Query
   no colapsa la referencia por *structural sharing* (que sí colapsa cuando los valores no
   cambian, que es justo lo que hacían los mocks existentes del test, ocultando el bug). El
   `useEffect` de `LessonPlayerPage.tsx` que llama a `start(lessonQuery.data)` dependía de esas
   referencias (`stats`/`completedIds`) sin comprobar si ya había una sesión para *esta*
   lección, así que el refetch volvía a llamar a `start()` y tiraba la sesión `'finished'`
   recién alcanzada — la lección se reiniciaba sola desde el ejercicio 1 antes de que el
   usuario viera "+15 XP" y su racha, aunque los datos ya estaban bien guardados en el
   servidor. Fix: guardar el efecto con `state?.lesson.id !== lessonQuery.data.id`, y un test de
   regresión que reproduce el bug mockeando `getStats`/`getCompletedLessonIds` con valores que
   cambian de verdad entre llamadas (no solo un objeto "nuevo" con los mismos valores, que
   structural sharing habría colapsado igual). Lección: *un mock que siempre devuelve la misma
   referencia (o un objeto nuevo pero con los mismos valores) puede ocultar bugs de
   dependencias de efectos que solo aparecen cuando los datos cambian de verdad — hay que
   simular el cambio real, no solo la identidad del objeto*.

### Deuda técnica registrada (consciente y priorizada)

Del ledger de tareas (`.superpowers/sdd/progress.md`), triada al cierre de la fase:

- Tests de bordes del clamp de `errorCount` (0, 50, negativos, > 50) sin cobertura directa en
  `complete-lesson.use-case.spec.ts` — los clamps existen y se autorrevisaron contra el código,
  pero no tienen un test que falle si alguien los rompe.
- `applyLessonDay`/`shiftDay` (`packages/core/src/logic/streak.ts`) no tiene test de cambio de
  año (31 dic → 1 ene) — `Date` de JS lo maneja bien, pero no está verificado con un test.
- Un test legado de `packages/api-client/src/client.spec.ts` ("envía el token") quedó
  aseverando `undefined` por accidente de un mock viejo que no se actualizó al extender
  `completeLesson` — pasa, pero no prueba lo que su nombre dice.
- El plural "día"/"días" en el copy de racha (`🔥 Racha: N día(s)`) y la rama `freezeUsed` de
  `CompletionScreen` no tienen test directo que verifique el texto exacto en ambos casos.
- Heredado de Fase 1/2 y aún sin resolver: `saveCourse` no transaccional, re-ingesta rompe
  progreso existente, `normalize('NFC')` pendiente antes de exponer input real, re-ingesta con
  filtro de stopwords esperando que Tatoeba se recupere, Google OAuth pospuesto.

### Números de la fase

- 14 commits · 38 archivos · 125 tests en el monorepo (91 al cierre de la Fase 2 → 125) ·
  lint/build/test en verde
- 10 tareas de código ejecutadas con TDD, cada una con revisión de código independiente antes
  de integrarse; 2 de ellas tuvieron un commit adicional por un hallazgo de revisión/smoke
  (Task 10: ver problema #1; Task 12: ver problema #4)
- Task 12 (smoke real con usuario, 2026-07-14): recorrido completo en el navegador contra
  Supabase real — StatsBar, fórmula de XP, racha, corazones en vivo, bloqueo sin corazones y
  repaso, persistencia entre recargas — todo verificado correcto salvo el problema #4
  (encontrado y arreglado durante el propio smoke, con TDD)
- Queda pendiente: merge a `master` + push + CI verde (flujo de cierre habitual)

---

## Fase 3B — Logros y gemas (primer corte) (2026-07-14)

> Primer corte de la Fase 3B: catálogo de logros, gemas como recompensa y su exposición en la
> web. Las 7 tareas de código están completas, revisadas y en verde en
> `feature/fase-3b-logros-gemas`. El resto de la Fase 3B original (gastar gemas en un
> congelador de racha comprado, y la liga semanal con cron) queda deliberadamente fuera de este
> corte — cada una necesita su propio brainstorm antes de planearse. Queda pendiente la Task 9:
> smoke manual y merge a `master`.

### El problema a resolver

La Fase 3A dejó XP, nivel, racha y corazones funcionando, pero ningún hito reconocible: un
usuario que llega a 7 días de racha o a su lección 50 no recibe ninguna señal de que cruzó algo
especial, más allá del número subiendo en la `StatsBar`. Esta fase agrega **logros** (hitos
fijos por racha, lecciones completadas y nivel) que, al desbloquearse, otorgan **gemas** — la
moneda que ya existía en el esquema desde la Fase 3A (`user_stats.gems`, sin nada todavía que la
otorgara) pero que hasta ahora estaba muerta.

### Decisiones técnicas y su porqué

| Decisión | Alternativas consideradas | Por qué se eligió |
|---|---|---|
| **Catálogo de logros estático en código** (`ACHIEVEMENTS` en `packages/core/src/logic/achievements.ts`) | Una tabla de catálogo en Postgres (`achievements` con sus umbrales/gemas) | Los 8 logros de este corte son fijos y no los edita nadie desde un panel de administración — no existe ese panel ni está planeado. Una tabla de catálogo agrega una consulta y un join por cada evaluación sin comprar nada a cambio; el catálogo en código es la misma fuente de verdad que ya usan `unlockedAchievements()` (evaluación) y `GetAchievementsUseCase` (listado con estado) en el servidor, y la web lo importa vía `@lingoleap/core` para pintar todos los logros aunque no estén desbloqueados |
| **`user_achievements` como tabla de unión** (`user_id`, `achievement_id`, `unlocked_at`, migración `0004_achievements.sql`) — mismo patrón que `user_progress` | Un array/jsonb de ids desbloqueados dentro de `user_stats` | Aparece siempre junto a `user_progress` en el razonamiento de la Fase 2: "¿qué logros tiene ESTE usuario?" es una pregunta natural de fila-por-hito (con su propio `unlocked_at`, útil para futuro ordenar por fecha), no una propiedad escalar del usuario. Un jsonb funcionaría, pero perdería la clave primaria compuesta `(user_id, achievement_id)` que hace que `unlock()` sea trivialmente idempotente a nivel de fila (insertar el mismo logro dos veces no duplica) |
| **Evaluación de logros dentro de `CompleteLessonUseCase`, en el mismo request** (no un job aparte) | Cron/worker que recorra usuarios y calcule logros pendientes periódicamente | Ya se descartó un cron para corazones en la Fase 3A por la misma razón: cuesta infraestructura y puede desincronizarse. Los datos que determinan un logro (racha, lecciones completadas, nivel) ya se recalculan en cada `complete-lesson` — evaluarlos ahí es una función pura más (`unlockedAchievements`) sobre datos que la petición ya tiene en memoria, sin I/O adicional más que leer `listUnlockedIds` y escribir los nuevos |
| **El copy en español de cada logro (`ACHIEVEMENT_LABEL`) vive en `apps/web`, no en `packages/core`** | Meter el texto directamente en `AchievementDefinition` | `packages/core` es el paquete que también va a consumir la futura app móvil, potencialmente con sus propias decisiones de copy/idioma de interfaz; el catálogo (id, categoría, umbral, gemas) es lógica de negocio y no cambia entre plataformas, pero el texto que ve un usuario sí es una decisión de presentación — mismo principio que ya separaba "dominio" de "UI" desde la Fase 2 |

### Confianza cliente/servidor: qué se acepta y qué se recalcula

Esta fase no agrega ninguna entrada nueva del cliente: sigue siendo el mismo body
`{ errorCount?, date? }` de la Fase 3A, con las mismas reglas (`errorCount` clampado a
`[0, 50]`, `date` validado por regex o descartado a favor de la fecha UTC del servidor). Los
logros y las gemas que otorgan se calculan **100% en el servidor**, a partir de la racha, el
conteo de lecciones y el nivel que el propio `CompleteLessonUseCase` ya recalculaba — el cliente
nunca envía ni puede inflar "desbloqueé el logro X".

### Funciones puras compartidas core↔backend

`packages/core/src/logic/achievements.ts` sigue el mismo patrón que `xp.ts`/`streak.ts`/
`hearts.ts` de la Fase 3A:

- `unlockedAchievements(progress, alreadyUnlockedIds)` — sin estado, sin I/O: recibe el progreso
  actual (`streakCount`, `lessonsCompleted`, `level`) y los ids ya desbloqueados, devuelve la
  lista de definiciones que acaban de cruzar su umbral. La usa `CompleteLessonUseCase` en el
  servidor para decidir qué otorgar.
- `ACHIEVEMENTS` (el catálogo) y `AchievementStatus` (definición + `unlocked: boolean`) los
  consume también `GetAchievementsUseCase` en el servidor (para `GET /me/achievements`) y
  `AchievementsPage` en la web (para pintar los 8 logros, desbloqueados o no) — la misma fuente
  de verdad en los dos lados, sin duplicar los umbrales ni las gemas en dos sitios.

### Cómo se desarrolló: TDD

Mismo flujo RED→GREEN→commit de las fases anteriores. La fase sumó **20 tests nuevos** (125 al
cierre de la Fase 3A → 145 en el monorepo):

- **`packages/core`**: 32 tests (26 al cierre de la Fase 3A + 6 nuevos de `achievements.spec.ts`)
  — catálogo, umbrales por categoría, no repetir logros ya desbloqueados.
- **`apps/api`**: 69 tests (59 al cierre de la Fase 3A + 10 nuevos) — `SupabaseAchievementsRepository`
  con msw/fixtures, `GetAchievementsUseCase`, la extensión de `CompleteLessonUseCase` con logros y
  gemas, el endpoint `GET /me/achievements` con supertest, y el test de regresión de idempotencia
  (ver "Problemas reales encontrados").
- **`packages/api-client`**: 7 tests (6 al cierre de la Fase 3A + 1 nuevo) — `getAchievements()`
  con msw.
- **`apps/web`**: 37 tests (34 al cierre de la Fase 3A + 3 nuevos) — `AchievementsPage` (agrupado
  por categoría, estado bloqueado/desbloqueado) y el aviso de logro nuevo en `CompletionScreen`.

Cada una de las 7 tareas de código tuvo su propia revisión de código independiente antes de
darse por terminada. La Task 3 (la que extendió `CompleteLessonUseCase` para otorgar logros)
necesitó un commit adicional (`858ad5a`) después de que su revisión encontrara el hallazgo
principal de la fase — ver abajo.

### Problemas reales encontrados

1. **Riesgo de doble-otorgamiento en reintentos, agravado por esta fase** (Task 3): el endpoint
   `POST /progress/lessons/:id/complete` no tiene ninguna clave de idempotencia — esto ya era
   cierto desde la Fase 3A (XP y corazones ya se duplicaban en un reintento tras un `stats.save`
   exitoso sin respuesta al cliente) y no tiene relación con logros. Esta tarea **amplía la
   ventana de la carrera**: `CompleteLessonUseCase` ahora hace una segunda escritura secuencial
   después de `stats.save` (`achievements.unlock`, ver `complete-lesson.use-case.ts:66-79`) que
   puede fallar *después* de que las stats (XP, corazones, racha y ahora gemas) ya quedaron
   comprometidas. El botón "Reintentar" que ya existe en producción
   (`apps/web/src/features/lesson-player/CompletionScreen.tsx`, prop `onRetry`, disparado desde
   `LessonPlayerPage.handleRetryComplete`) reenvía la misma petición: en el reintento,
   `execute()` vuelve a leer un `stored` que ya refleja el primer otorgamiento y no tiene forma
   de saber que la petición ya se procesó — XP y corazones se duplican incondicionalmente, y si
   el logro no llegó a persistirse en `user_achievements` en el primer intento, sus gemas también
   se duplican.

   **Decisión tomada (por el dueño del proyecto, no por un agente): no rediseñar ahora.** No se
   agregó clave de idempotencia ni transacción en este corte. En su lugar se agregó un test de
   regresión (`apps/api/src/application/use-cases/complete-lesson.use-case.spec.ts`, el test
   titulado `[deuda documentada, ver BITACORA Fase 3B] un reintento tras un stats.save exitoso
   vuelve a otorgar XP y, si el logro no llegó a persistirse, también gemas`, commit `858ad5a`)
   que fija y hace visible el comportamiento actual — con dos llamadas reales a `execute()` y
   aserciones explícitas de que el segundo `totalXp` es 30 (no 15) y el segundo `gemsEarned` es 5
   (no 0) — en vez de dejarlo como un bug silencioso sin ningún rastro. Mismo criterio que la
   Fase 3A aplicó a sus propias regresiones reales (problema #4 de esa fase): documentar con
   honestidad y con un test que lo demuestre vale más que un arreglo apurado a mitad de un plan
   ya cerrado.

### Deuda técnica registrada (consciente y priorizada)

- **La de mayor prioridad**: falta de idempotencia en `POST /progress/lessons/:id/complete` —
  ver problema #1 arriba. Solución futura concreta: una clave de idempotencia por request (el
  cliente genera un UUID al armar la petición, el servidor la guarda y descarta reintentos con
  la misma clave), o envolver `stats.save` + `achievements.unlock` en una única transacción/RPC
  de Postgres para que ambas escrituras se comprometan o fallen juntas — ninguna de las dos se
  implementó en este corte porque cualquiera de las dos es un rediseño del endpoint, no un ajuste
  acotado a una tarea de logros.
- La policy de RLS de `0004_achievements.sql` se llama `"leer logros propios"` (español libre,
  como `0002_progress.sql`) en vez de snake_case como `user_stats_select_own` de
  `0003_stats.sql` — inconsistencia ya preexistente entre migraciones anteriores, no introducida
  por esta fase. Tampoco lleva el comentario que sí tiene `0003_stats.sql` explicando por qué la
  policy es solo de lectura (el API escribe con `service_role`).
- El ícono de candado/check de `AchievementsPage` (`🔒`/`✅`) está marcado `aria-hidden` sin
  ningún texto accesible que indique el estado bloqueado/desbloqueado a un lector de pantalla —
  viene del propio spec de diseño de la tarea, no es un descuido del implementador.
- `ACHIEVEMENT_LABEL` (`apps/web/src/features/achievements/achievementLabels.ts`) está tipado
  como `Record<string, string>` en vez de una unión literal de los 8 ids — no hay protección del
  compilador si el catálogo de `packages/core` cambia en el futuro; arrastra de que
  `AchievementDefinition.id` ya está tipado como `string` simple desde que se escribió el
  catálogo.
- `CompletionScreen` no tiene un test dedicado para el caso de 2+ logros desbloqueados a la vez
  en la misma pantalla — el `.map()` sobre `achievementsUnlocked` lo soporta correctamente
  (verificado por inspección de código en la revisión), pero ningún test lo ejercita.
- Heredado de fases anteriores y aún sin resolver: `saveCourse` no transaccional, re-ingesta
  rompe progreso existente, `normalize('NFC')` pendiente antes de exponer input real, Google
  OAuth pospuesto, tests de bordes del clamp de `errorCount` sin cobertura directa, cambio de año
  en la racha sin test.

### Números de la fase

- 8 commits de código hasta el cierre de esta documentación (`8c30558`, `f14f201`, `1f493ed`,
  `858ad5a`, `a57ad7d`, `8132127`, `b48b42c`, `ffaa536`) — este commit de documentación es el 9º;
  queda un 10º pendiente para el smoke manual de la Task 9
- 145 tests en el monorepo (125 al cierre de la Fase 3A → 145): 32 en `packages/core`, 7 en
  `packages/api-client`, 69 en `apps/api`, 37 en `apps/web`
- 7 tareas de código ejecutadas con TDD, cada una con revisión de código independiente antes de
  integrarse; 1 de ellas (Task 3) tuvo un commit adicional por el hallazgo de idempotencia (ver
  "Problemas reales encontrados")
- Este es un **primer corte** de la Fase 3B tal como la definía el spec de diseño original: el
  gasto de gemas en un congelador de racha comprado y la liga semanal (con su propio cron) quedan
  deliberadamente fuera — cada una es un sub-proyecto futuro que necesita su propio brainstorm
  antes de planearse
- Queda pendiente: Task 9 (smoke manual real + merge a `master`)

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

**Temas de gamificación (Fase 3A):**

- *¿Cómo compartes lógica de negocio entre el backend y el frontend, en concreto?* → "Las
  reglas de XP, racha y corazones (`packages/core/src/logic/xp.ts`, `streak.ts`, `hearts.ts`)
  son funciones puras: reciben todo lo que necesitan por parámetro — incluido el reloj
  (`nowIso`), nunca `Date.now()` interno — y devuelven un valor nuevo, sin tocar una base de
  datos ni el DOM. Eso significa que `CompleteLessonUseCase` en NestJS y `LessonPlayerPage` en
  React llaman literalmente la misma función (`canStartLesson`, por ejemplo) sin que ninguno de
  los dos sepa que el otro existe. Cuando construya la app móvil, la importan tal cual."
- *¿Por qué no usaste un cron job para regenerar los corazones?* → "Porque no hace falta: en
  vez de sumar corazones cada X horas con un proceso corriendo en background (que cuesta
  dinero, necesita monitoreo, y puede desincronizarse si se cae), `GET /me/stats` calcula al
  vuelo cuántos corazones deberían existir *ahora* comparando `hearts_updated_at` con la hora
  actual — es una resta y una división. Cero estado adicional, cero infraestructura, y el
  resultado es exactamente el mismo que si un cron hubiera corrido cada 4 horas."
- *¿Qué le confías al cliente y qué no?* → "Solo la fecha local, porque decidir 'qué día es
  para este usuario' requiere saber su zona horaria, y eso el servidor no lo tiene sin pedirlo
  explícitamente — pero igual la valido con un regex y caigo a la fecha UTC del servidor si no
  matchea. Todo lo que tiene valor económico dentro del juego (XP, corazones, si se gastó un
  congelador de racha) lo recalculo siempre en el servidor a partir de `errorCount`, y ese
  `errorCount` lo clampeo a `[0, 50]` antes de usarlo en cualquier fórmula. La regla general:
  el cliente puede decidir *contexto* (qué hora es donde está), nunca *resultado* (cuánto XP
  ganó)."
- *¿Qué es la idempotencia y dónde la aplicaste esta vez?* → usa la Task 6: el orden
  `markLessonCompleted` → `stats.save` en `CompleteLessonUseCase` es retry-safe a propósito —
  si el segundo paso falla, un reintento recalcula desde cero sin duplicar XP; el orden
  inverso sí duplicaría XP en un reintento. Conecta con el análisis de idempotencia que cerró
  la Fase 2 (mismo tipo de pregunta, caso nuevo).
- *¿Qué harías diferente en esta fase?* → usa la sección de deuda: faltan tests de los bordes
  del clamp de `errorCount`, de cambio de año en la racha, y un test legado del `api-client`
  que asevera `undefined` por accidente y no se dio cuenta nadie hasta la triage final.

---

*Próxima entrada: cierre de la Fase 3B (Task 9, smoke + merge) y, como sub-proyectos futuros
separados, el gasto de gemas en congeladores de racha comprados y la liga semanal con cron.*
