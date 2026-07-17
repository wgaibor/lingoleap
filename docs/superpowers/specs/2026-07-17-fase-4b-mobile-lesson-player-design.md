# Fase 4B — Reproductor de lecciones móvil (diseño)

> Segundo corte de la Fase 4 (app móvil React Native + Expo). **4A** (hecho): esqueleto con auth +
> cursos + camino + StatsBar. **4B** (este spec): reproductor de lecciones con los 4 tipos de
> ejercicio, TTS con expo-speech y guardado de stats al completar. **4C** (futuro): logros/tienda/
> liga como pantallas + offline básico. Decisiones tomadas en brainstorm con el usuario el
> 2026-07-17.

## 1. Objetivo

Reemplazar el placeholder "Próximamente" de `app/lesson/[lessonId].tsx` por el reproductor de
lecciones completo: los 4 tipos de ejercicio (image-select, translate con word bank, listening con
TTS, match-pairs), la validación de corazones al entrar, el guardado de progreso/stats al completar
y la pantalla de recompensas — con paridad funcional con la web. Cierra además la deuda declarada
en la bitácora de la 4A: el placeholder no validaba que el id fuera una lección real ni aplicaba
`canStartLesson`.

## 2. Alcance

- Port 1:1 del `features/lesson-player` de la web a React Native, reusando sin cambios
  `packages/core` (máquina de sesión, validación de respuestas, `canStartLesson`, `progressRatio`)
  y `@lingoleap/api-client` (`getLesson`, `completeLesson`).
- `sessionStore` zustand **duplicado** en `apps/mobile` (~40 líneas): la lógica real vive en core;
  duplicar el wrapper evita un paquete compartido de UI-state y deja a cada app evolucionar libre.
  Mismo criterio que el theme manual de la 4A.
- TTS con `expo-speech` detrás de un `useSpeech` móvil con la misma interfaz que el de la web.
- Guardas de entrada: id inexistente → error con volver; sin corazones y lección no completada →
  pantalla de bloqueo (repaso permitido de completadas, igual que la web).
- `CompletionScreen` con XP/racha/freeze usado y reintento si falla el guardado.

### Fuera de alcance (4C u otras fases)

- Offline/cola de resultados; animaciones y sonidos de acierto/error.
- Pantallas de logros, tienda y liga.
- Audio pregrabado (la web tampoco lo tiene en la práctica: siempre cae a TTS).
- Drag & drop: word bank y match-pairs funcionan por taps, igual que la web.

## 3. Estructura

`app/lesson/[lessonId].tsx` monta `src/features/lesson-player/LessonPlayerScreen.tsx`. La ruta
recibe `lessonId` y `lang` vía `useLocalSearchParams` (si `CoursePathScreen` aún no pasa `lang`
al navegar, se agrega en esta fase).

```
apps/mobile/src/features/lesson-player/
  sessionStore.ts          wrapper zustand sobre startSession/submitAnswer/advance de core
  LessonPlayerScreen.tsx   orquestación: queries, guardas, mutación de completado
  FeedbackBar.tsx          barra de feedback correcto/incorrecto + "Continuar"
  CompletionScreen.tsx     resumen, recompensas del POST, reintento de guardado
  useSpeech.ts             expo-speech; mapea LearningLanguage → locale
  exercises/
    types.ts               ExerciseComponentProps<E> (idéntico al de la web)
    ImageSelectExercise.tsx
    TranslateExercise.tsx
    ListeningExercise.tsx
    MatchPairsExercise.tsx
```

## 4. Orquestación y guardas (port de bugs ya pagados en la web)

`LessonPlayerScreen` porta tal cual las guardas que a la web le costaron bugs reales
(documentadas en comentarios de `LessonPlayerPage.tsx` y en la BITACORA Fase 2/3A):

1. `key={exercise.id}` al renderizar el ejercicio: fuerza remount entre ejercicios consecutivos
   del mismo tipo (estado interno de match-pairs).
2. **Ownership guard**: el estado del store solo cuenta si `state.lesson.id === lessonId`.
3. `reset()` del store al desmontar la pantalla (el store es un singleton global).
4. `completedRef` + reset por cambio de `lessonId`: la mutación de completado se dispara UNA vez.
5. Guard de re-`start()`: tras invalidar `stats`/`progress` al completar, el refetch no debe
   reiniciar la sesión ya terminada (`state?.lesson.id !== lessonQuery.data.id`).
6. Lección sin ejercicios → mensaje y volver, no crash.
7. Fallo de stats/progreso → error con "Reintentar" (no "Cargando…" infinito).

Flujo de entrada: `getLesson(lessonId)` + `useStats()` + `getCompletedLessonIds()`. Con las tres
resueltas: si `getLesson` falla (id inexistente incluido) → pantalla de error; si
`!canStartLesson(stats.hearts, lessonAlreadyCompleted)` → pantalla "Te quedaste sin corazones"
con la hora local de `nextHeartAt` y volver; si pasa → `start(lesson)`.

Flujo de cierre: al llegar `phase === 'finished'`, `POST /progress/lessons/:id/complete` con
`{ errorCount: state.wrongCount, date: localDateString() }` (helper local equivalente al de la
web), `invalidateQueries(['stats'])` + `(['progress'])`, y `CompletionScreen` con las recompensas
de la respuesta. Si la mutación falla, la pantalla muestra el error y un botón de reintento
deshabilitado mientras está pendiente.

Contador de corazones en el header del player: `max(0, stats.hearts - state.wrongCount)`,
solo visual (el servidor recalcula).

## 5. Ejercicios en React Native

Contrato sin cambios: `ExerciseComponentProps<E>` con `onResolve(correct)` llamado una sola vez;
los componentes no conocen store/sesión/API. Validación de respuestas siempre con las funciones
puras de `packages/core` (misma normalización que la web). Diferencias nativas:

- **image-select**: `<Image>` de RN con las URLs (Pexels) que ya vienen en el contenido;
  `resizeMode="cover"`, placeholder de color del theme mientras carga.
- **translate**: word bank por taps — tocar una palabra la mueve al área de respuesta y viceversa;
  botón "Comprobar". Sin input de texto libre (igual que la web).
- **listening**: botón 🔊 que llama `speak(text)`; word bank igual que translate.
- **match-pairs**: dos columnas, selección por taps; par correcto queda deshabilitado, par
  incorrecto se marca en rojo ~400ms y se des-selecciona; `onResolve(true)` al completar todos
  los pares — nunca `onResolve(false)` (igual que la web: los errores de emparejamiento no
  cuentan como respuesta incorrecta de la sesión).
- **useSpeech**: misma interfaz que la web — `useSpeech(language) → { speak(text), supported }` —
  implementada sobre `expo-speech` (`Speech.speak(text, { language, rate: 0.95 })`, `Speech.stop()`
  antes de cada speak) con el mismo mapeo BCP47 (`en-US`, `pt-BR`, `it-IT`).
- Estilos con `StyleSheet.create` + `src/app/theme.ts` únicamente (regla de tokens de la 4A).

## 6. Testing

Mismo nivel de inversión que la 4A: jest-expo + Testing Library RN, sin e2e automatizado.

- Render test por componente de ejercicio: resolver correcto e incorrecto → `onResolve` con el
  valor esperado; listening con `expo-speech` mockeado en `jest.setup.ts`.
- `LessonPlayerScreen.spec.tsx` con `api` mockeada: flujo feliz (ejercicio → feedback → completar
  → recompensas), bloqueo sin corazones, error de carga de lección, fallo del complete con
  reintento.
- `sessionStore.spec.ts`: humo mínimo (start/resolve/next/reset delegan en core).
- El e2e real es el smoke manual en Expo Go con el usuario (última task del plan).

## 7. Decisiones y alternativas descartadas

1. **Port 1:1 vs player "headless" compartido**: se descartó extraer la orquestación a un paquete
   compartido — exigía refactorizar la web en la misma fase y agrega un paquete por lógica de UI
   que recién se estabiliza en móvil. La lógica de dominio ya está compartida en `packages/core`;
   lo duplicado es solo wiring fino.
2. **WebView embebiendo el player web**: descartado, rompe la experiencia nativa y el objetivo de
   la Fase 4.
3. **Drag & drop para word bank/match-pairs**: descartado en este corte; taps dan paridad con la
   web sin meter gesture handlers, y el drag puede entrar como mejora en 4C si aporta.
4. **Corte parcial (2 ejercicios primero)**: descartado por el usuario; los 4 tipos entran en 4B
   como quedó definido en el brainstorm de la 4A.
