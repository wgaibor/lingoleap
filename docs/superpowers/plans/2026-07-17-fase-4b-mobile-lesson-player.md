# Reproductor de lecciones móvil (Fase 4B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el placeholder de `app/lesson/[lessonId].tsx` por el reproductor completo:
4 tipos de ejercicio, TTS con expo-speech, guardas de corazones/id y guardado de stats al completar.

**Architecture:** Port 1:1 de `apps/web/src/features/lesson-player` a React Native, reusando sin
cambios `packages/core` (startSession/submitAnswer/advance, isTokenAnswerCorrect, canStartLesson,
progressRatio) y `@lingoleap/api-client` (getLesson, completeLesson). Spec:
`docs/superpowers/specs/2026-07-17-fase-4b-mobile-lesson-player-design.md`.

**Tech Stack:** Expo SDK 57 + expo-router, React Native 0.86, zustand, TanStack Query 5,
expo-speech, jest-expo + @testing-library/react-native.

## Global Constraints

- TypeScript `strict: true`; prohibido `any` explícito. Copy de UI en español.
- Colores/espaciados/radios SOLO desde `src/app/theme.ts` (traducción de `@lingoleap/tokens`);
  prohibido hex suelto en componentes.
- La app NUNCA llama `fetch` directo: todo por `@lingoleap/api-client` vía `src/app/api.ts`.
- Reglas de dominio solo desde `packages/core`; los componentes de ejercicio no conocen
  store/sesión/API — solo `onResolve(correct)` una vez.
- Tests con jest-expo + RNTL (`globals` de Jest disponibles; ver `jest.setup.ts` existente).
  `waitFor` de RNTL con `{ timeout: 15000 }` cuando espere updates asíncronos (CI lento, ver
  commit `0ad33e6`).
- Commits convencionales en español al final de cada tarea + trailer
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Rama de trabajo nueva sobre `master`: `feature/fase-4b-lesson-player`.
- Todos los comandos se corren desde la raíz del monorepo salvo indicación contraria.

---

### Task 1: Dependencias + sessionStore + localDate

**Files:**
- Modify: `apps/mobile/package.json`
- Create: `apps/mobile/src/features/lesson-player/sessionStore.ts`,
  `apps/mobile/src/features/lesson-player/sessionStore.spec.ts`,
  `apps/mobile/src/shared/localDate.ts`

**Interfaces:**
- Consumes: `startSession/submitAnswer/advance`, tipos `Lesson`/`LessonSessionState` de
  `@lingoleap/core`.
- Produces:
```ts
// sessionStore.ts
export const useSessionStore: UseBoundStore<StoreApi<{
  state: LessonSessionState | null;
  start: (lesson: Lesson) => void;
  resolve: (correct: boolean) => void;
  next: () => void;
  reset: () => void;
}>>;
// localDate.ts
export function localDateString(now?: Date): string; // 'YYYY-MM-DD' en hora local
```

- [ ] **Step 1: Instalar zustand y expo-speech**

Run: `pnpm --filter @lingoleap/mobile add zustand expo-speech`
Expected: ambas quedan en `apps/mobile/package.json` (expo-speech en versión compatible con SDK 57;
si `expo install` sugiere otra, usar `pnpm --filter @lingoleap/mobile exec npx expo install expo-speech`).

- [ ] **Step 2: Test que falla (RED)** — `apps/mobile/src/features/lesson-player/sessionStore.spec.ts`:

```ts
import type { Lesson } from '@lingoleap/core';
import { useSessionStore } from './sessionStore';

const lesson: Lesson = {
  id: 'l1',
  title: 'Lección 1',
  position: 1,
  exercises: [
    { id: 'e1', type: 'translate', sourceText: 'hola', correctAnswer: 'hello', wordBank: ['hello', 'bye'], audioUrl: null },
    { id: 'e2', type: 'translate', sourceText: 'adiós', correctAnswer: 'bye', wordBank: ['hello', 'bye'], audioUrl: null }
  ]
};

describe('sessionStore', () => {
  beforeEach(() => useSessionStore.getState().reset());

  it('start crea la sesión y resolve/next delegan en core', () => {
    useSessionStore.getState().start(lesson);
    expect(useSessionStore.getState().state?.phase).toBe('answering');
    useSessionStore.getState().resolve(false);
    expect(useSessionStore.getState().state?.phase).toBe('feedback');
    expect(useSessionStore.getState().state?.wrongCount).toBe(1);
    useSessionStore.getState().next();
    expect(useSessionStore.getState().state?.index).toBe(1);
  });

  it('resolve/next sin sesión no rompen; reset vuelve a null', () => {
    useSessionStore.getState().resolve(true);
    useSessionStore.getState().next();
    expect(useSessionStore.getState().state).toBeNull();
    useSessionStore.getState().start(lesson);
    useSessionStore.getState().reset();
    expect(useSessionStore.getState().state).toBeNull();
  });
});
```

Nota: si el shape de `Exercise`/`Lesson` no compila (campos exactos en
`packages/core/src/types.ts` o similar — buscar `interface TranslateExercise`), ajustar el fixture
al tipo real; la intención del test no cambia.

- [ ] **Step 3: Verificar RED**

Run: `pnpm --filter @lingoleap/mobile test -- sessionStore`
Expected: FAIL (módulo `./sessionStore` no existe).

- [ ] **Step 4: Implementar** — copiar el store de la web 1:1
  (`apps/web/src/features/lesson-player/sessionStore.ts`):

```ts
// apps/mobile/src/features/lesson-player/sessionStore.ts
// Duplicado consciente del wrapper de apps/web (decisión del spec §2): la lógica
// real vive en @lingoleap/core; esto es solo wiring de zustand.
import { create } from 'zustand';
import { advance, startSession, submitAnswer, type Lesson, type LessonSessionState } from '@lingoleap/core';

interface SessionStore {
  state: LessonSessionState | null;
  start: (lesson: Lesson) => void;
  resolve: (correct: boolean) => void;
  next: () => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  state: null,
  start: (lesson) => set({ state: startSession(lesson) }),
  resolve: (correct) => {
    const current = get().state;
    if (!current) return;
    set({ state: submitAnswer(current, correct) });
  },
  next: () => {
    const current = get().state;
    if (!current) return;
    set({ state: advance(current) });
  },
  reset: () => set({ state: null })
}));
```

Y `apps/mobile/src/shared/localDate.ts` (copia de `apps/web/src/shared/localDate.ts`):

```ts
export function localDateString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 5: Verificar GREEN**

Run: `pnpm --filter @lingoleap/mobile test -- sessionStore`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/src/features/lesson-player apps/mobile/src/shared
git commit -m "feat(mobile): sessionStore zustand y localDate para el reproductor (Fase 4B)"
```

---

### Task 2: useSpeech sobre expo-speech

**Files:**
- Create: `apps/mobile/src/shared/useSpeech.ts`, `apps/mobile/src/shared/useSpeech.spec.ts`
- Modify: `apps/mobile/jest.setup.ts`

**Interfaces:**
- Produces:
```ts
export function useSpeech(language: LearningLanguage): { speak: (text: string) => void; supported: boolean };
```
Misma interfaz que `apps/web/src/shared/useSpeech.ts`; mapeo BCP47 idéntico
(`en → en-US`, `pt-BR → pt-BR`, `it → it-IT`), `rate: 0.95`, `Speech.stop()` antes de cada speak.

- [ ] **Step 1: Mock de expo-speech en jest.setup.ts** — agregar al final de
  `apps/mobile/jest.setup.ts`:

```ts
// expo-speech toca APIs nativas que no existen en el entorno jsdom/node de jest.
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));
```

- [ ] **Step 2: Test que falla (RED)** — `apps/mobile/src/shared/useSpeech.spec.ts`:

```tsx
import { renderHook } from '@testing-library/react-native';
import * as Speech from 'expo-speech';
import { useSpeech } from './useSpeech';

const mockSpeak = Speech.speak as jest.Mock;
const mockStop = Speech.stop as jest.Mock;

describe('useSpeech', () => {
  beforeEach(() => jest.clearAllMocks());

  it('habla con el locale BCP47 del idioma y rate 0.95, cancelando lo anterior', () => {
    const { result } = renderHook(() => useSpeech('pt-BR'));
    result.current.speak('bom dia');
    expect(mockStop).toHaveBeenCalled();
    expect(mockSpeak).toHaveBeenCalledWith('bom dia', { language: 'pt-BR', rate: 0.95 });
  });

  it('mapea en → en-US y reporta supported', () => {
    const { result } = renderHook(() => useSpeech('en'));
    result.current.speak('hello');
    expect(mockSpeak).toHaveBeenCalledWith('hello', { language: 'en-US', rate: 0.95 });
    expect(result.current.supported).toBe(true);
  });
});
```

- [ ] **Step 3: Verificar RED**

Run: `pnpm --filter @lingoleap/mobile test -- useSpeech`
Expected: FAIL (módulo `./useSpeech` no existe).

- [ ] **Step 4: Implementar** — `apps/mobile/src/shared/useSpeech.ts`:

```ts
import { useCallback } from 'react';
import * as Speech from 'expo-speech';
import type { LearningLanguage } from '@lingoleap/core';

// Mismo mapeo que apps/web/src/shared/useSpeech.ts (mantener en sincronía).
const BCP47: Record<LearningLanguage, string> = { en: 'en-US', 'pt-BR': 'pt-BR', it: 'it-IT' };

export function useSpeech(language: LearningLanguage): { speak: (text: string) => void; supported: boolean } {
  const speak = useCallback(
    (text: string) => {
      Speech.stop();
      Speech.speak(text, { language: BCP47[language], rate: 0.95 });
    },
    [language]
  );
  return { speak, supported: true };
}
```

- [ ] **Step 5: Verificar GREEN**

Run: `pnpm --filter @lingoleap/mobile test -- useSpeech`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/shared apps/mobile/jest.setup.ts
git commit -m "feat(mobile): useSpeech con expo-speech (TTS para el reproductor)"
```

---

### Task 3: ImageSelectExercise

**Files:**
- Create: `apps/mobile/src/features/lesson-player/exercises/types.ts`,
  `apps/mobile/src/features/lesson-player/exercises/ImageSelectExercise.tsx`,
  `apps/mobile/src/features/lesson-player/exercises/ImageSelectExercise.spec.tsx`

**Interfaces:**
- Produces:
```ts
// types.ts — idéntico a apps/web/src/features/lesson-player/exercises/types.ts
export interface ExerciseComponentProps<E> {
  exercise: E;
  onResolve: (correct: boolean) => void; // se llama UNA vez
}
// ImageSelectExercise
export function ImageSelectExercise(props: ExerciseComponentProps<ImageSelectModel>): JSX.Element;
```

- [ ] **Step 1: types.ts**

```ts
// apps/mobile/src/features/lesson-player/exercises/types.ts
/** Contrato común de todos los componentes de ejercicio (idéntico al de apps/web). */
export interface ExerciseComponentProps<E> {
  exercise: E;
  /** Se llama UNA vez cuando el usuario resuelve el ejercicio. */
  onResolve: (correct: boolean) => void;
}
```

- [ ] **Step 2: Test que falla (RED)** —
  `apps/mobile/src/features/lesson-player/exercises/ImageSelectExercise.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ImageSelectExercise as ImageSelectModel } from '@lingoleap/core';
import { ImageSelectExercise } from './ImageSelectExercise';

const exercise: ImageSelectModel = {
  id: 'e1',
  type: 'image-select',
  prompt: 'cat',
  options: [
    { label: 'gato', imageUrl: 'https://img/cat.jpg', correct: true },
    { label: 'perro', imageUrl: 'https://img/dog.jpg', correct: false }
  ]
};

describe('ImageSelectExercise', () => {
  it('Comprobar está deshabilitado sin selección y resuelve true con la opción correcta', () => {
    const onResolve = jest.fn();
    render(<ImageSelectExercise exercise={exercise} onResolve={onResolve} />);
    fireEvent.press(screen.getByText('Comprobar'));
    expect(onResolve).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('gato'));
    fireEvent.press(screen.getByText('Comprobar'));
    expect(onResolve).toHaveBeenCalledWith(true);
  });

  it('resuelve false con la opción incorrecta', () => {
    const onResolve = jest.fn();
    render(<ImageSelectExercise exercise={exercise} onResolve={onResolve} />);
    fireEvent.press(screen.getByText('perro'));
    fireEvent.press(screen.getByText('Comprobar'));
    expect(onResolve).toHaveBeenCalledWith(false);
  });
});
```

Nota: ajustar el fixture si el shape real de `ImageSelectExercise` en `packages/core` difiere
(verificar con `Select-String -Path packages/core/src -Pattern 'ImageSelectExercise' -Recurse` o
mirando `packages/core/src/index.ts`).

- [ ] **Step 3: Verificar RED**

Run: `pnpm --filter @lingoleap/mobile test -- ImageSelect`
Expected: FAIL (módulo no existe).

- [ ] **Step 4: Implementar** —
  `apps/mobile/src/features/lesson-player/exercises/ImageSelectExercise.tsx`:

```tsx
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ImageSelectExercise as ImageSelectModel } from '@lingoleap/core';
import { theme } from '../../../app/theme';
import type { ExerciseComponentProps } from './types';

export function ImageSelectExercise({ exercise, onResolve }: ExerciseComponentProps<ImageSelectModel>) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  function handleCheck() {
    if (selectedIndex === null) return;
    onResolve(exercise.options[selectedIndex].correct);
  }

  return (
    <View>
      <Text style={styles.prompt}>¿Cuál es «{exercise.prompt}»?</Text>
      <View style={styles.options}>
        {exercise.options.map((option, index) => {
          const isSelected = selectedIndex === index;
          return (
            <Pressable
              key={option.label}
              onPress={() => setSelectedIndex(index)}
              style={[styles.option, isSelected && styles.optionSelected]}
            >
              {option.imageUrl && (
                <Image source={{ uri: option.imageUrl }} style={styles.image} resizeMode="cover" />
              )}
              <Text style={styles.optionLabel}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={handleCheck}
        disabled={selectedIndex === null}
        style={[styles.check, selectedIndex === null && styles.checkDisabled]}
      >
        <Text style={styles.checkText}>Comprobar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: { fontWeight: '700', color: theme.colors.text, marginBottom: theme.space.md, fontSize: 16 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, marginBottom: theme.space.md },
  option: {
    alignItems: 'center',
    gap: theme.space.xs,
    padding: theme.space.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    width: '47%'
  },
  optionSelected: { borderColor: theme.colors.primary, borderWidth: 2 },
  image: { width: '100%', aspectRatio: 1, borderRadius: theme.radius.sm, backgroundColor: theme.colors.border },
  optionLabel: { color: theme.colors.text },
  check: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    alignItems: 'center'
  },
  checkDisabled: { opacity: 0.5 },
  checkText: { color: theme.colors.surface, fontWeight: '700' }
});
```

- [ ] **Step 5: Verificar GREEN**

Run: `pnpm --filter @lingoleap/mobile test -- ImageSelect`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/lesson-player/exercises
git commit -m "feat(mobile): ejercicio image-select"
```

---

### Task 4: WordBankAnswer + Translate + Listening

**Files:**
- Create: `apps/mobile/src/features/lesson-player/exercises/WordBankAnswer.tsx`,
  `apps/mobile/src/features/lesson-player/exercises/TranslateExercise.tsx`,
  `apps/mobile/src/features/lesson-player/exercises/TranslateExercise.spec.tsx`,
  `apps/mobile/src/features/lesson-player/exercises/ListeningExercise.tsx`,
  `apps/mobile/src/features/lesson-player/exercises/ListeningExercise.spec.tsx`

**Interfaces:**
- Consumes: `ExerciseComponentProps` (Task 3), `useSpeech` (Task 2), `isTokenAnswerCorrect` de
  `@lingoleap/core`.
- Produces:
```tsx
export function WordBankAnswer(props: { wordBank: string[]; onCheck: (chosenTokens: string[]) => void }): JSX.Element;
export function TranslateExercise(props: ExerciseComponentProps<TranslateModel> & { language: LearningLanguage }): JSX.Element;
export function ListeningExercise(props: ExerciseComponentProps<ListeningModel> & { language: LearningLanguage }): JSX.Element;
```

- [ ] **Step 1: Tests que fallan (RED)** — `TranslateExercise.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { TranslateExercise as TranslateModel } from '@lingoleap/core';
import { TranslateExercise } from './TranslateExercise';

const exercise: TranslateModel = {
  id: 'e1',
  type: 'translate',
  sourceText: 'el gato',
  correctAnswer: 'the cat',
  wordBank: ['the', 'dog', 'cat'],
  audioUrl: null
};

describe('TranslateExercise', () => {
  it('arma la respuesta con fichas y resuelve true si coincide', () => {
    const onResolve = jest.fn();
    render(<TranslateExercise exercise={exercise} language="en" onResolve={onResolve} />);
    fireEvent.press(screen.getByText('the'));
    fireEvent.press(screen.getByText('cat'));
    fireEvent.press(screen.getByText('Comprobar'));
    expect(onResolve).toHaveBeenCalledWith(true);
  });

  it('resuelve false con la respuesta incorrecta y permite devolver una ficha', () => {
    const onResolve = jest.fn();
    render(<TranslateExercise exercise={exercise} language="en" onResolve={onResolve} />);
    fireEvent.press(screen.getByText('dog'));
    // Devuelve la ficha al banco (queda en la zona de respuesta → tap la saca).
    fireEvent.press(screen.getByText('dog'));
    fireEvent.press(screen.getByText('the'));
    fireEvent.press(screen.getByText('dog'));
    fireEvent.press(screen.getByText('Comprobar'));
    expect(onResolve).toHaveBeenCalledWith(false);
  });
});
```

Y `ListeningExercise.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Speech from 'expo-speech';
import type { ListeningExercise as ListeningModel } from '@lingoleap/core';
import { ListeningExercise } from './ListeningExercise';

const exercise: ListeningModel = {
  id: 'e1',
  type: 'listening',
  text: 'good morning',
  wordBank: ['good', 'night', 'morning'],
  audioUrl: null
};

describe('ListeningExercise', () => {
  beforeEach(() => jest.clearAllMocks());

  it('el botón de audio dispara TTS con el texto del ejercicio', () => {
    render(<ListeningExercise exercise={exercise} language="en" onResolve={jest.fn()} />);
    fireEvent.press(screen.getByText(/Escucha/));
    expect(Speech.speak).toHaveBeenCalledWith('good morning', { language: 'en-US', rate: 0.95 });
  });

  it('resuelve true al armar el texto correcto', () => {
    const onResolve = jest.fn();
    render(<ListeningExercise exercise={exercise} language="en" onResolve={onResolve} />);
    fireEvent.press(screen.getByText('good'));
    fireEvent.press(screen.getByText('morning'));
    fireEvent.press(screen.getByText('Comprobar'));
    expect(onResolve).toHaveBeenCalledWith(true);
  });
});
```

Notas: ajustar fixtures al shape real de `packages/core` si difiere (`audioUrl` es opcional en
listening — el móvil NO usa audio pregrabado, va directo a TTS, spec §5). El test de devolver
fichas asume que la ficha elegida se renderiza en la zona de respuesta y el tap la devuelve.

- [ ] **Step 2: Verificar RED**

Run: `pnpm --filter @lingoleap/mobile test -- "Translate|Listening"`
Expected: FAIL (módulos no existen).

- [ ] **Step 3: Implementar WordBankAnswer** —
  `apps/mobile/src/features/lesson-player/exercises/WordBankAnswer.tsx`:

```tsx
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../../app/theme';

export interface WordBankAnswerProps {
  wordBank: string[];
  onCheck: (chosenTokens: string[]) => void;
}

/** Banco de fichas compartido: tap mueve una ficha del banco a la respuesta y viceversa. */
export function WordBankAnswer({ wordBank, onCheck }: WordBankAnswerProps) {
  const [chosen, setChosen] = useState<number[]>([]);

  const availableIndexes = wordBank
    .map((_, index) => index)
    .filter((index) => !chosen.includes(index));

  function handleCheck() {
    if (chosen.length === 0) return;
    onCheck(chosen.map((index) => wordBank[index]));
  }

  return (
    <View>
      <View style={styles.answerZone} testID="answer-zone">
        {chosen.map((index, position) => (
          <Pressable
            key={`${index}-${position}`}
            onPress={() => setChosen((prev) => prev.filter((_, i) => i !== position))}
            style={styles.token}
          >
            <Text style={styles.tokenText}>{wordBank[index]}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.bank}>
        {availableIndexes.map((index) => (
          <Pressable key={index} onPress={() => setChosen((prev) => [...prev, index])} style={styles.token}>
            <Text style={styles.tokenText}>{wordBank[index]}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={handleCheck}
        disabled={chosen.length === 0}
        style={[styles.check, chosen.length === 0 && styles.checkDisabled]}
      >
        <Text style={styles.checkText}>Comprobar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  answerZone: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.xs,
    minHeight: 44,
    padding: theme.space.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    marginBottom: theme.space.sm
  },
  bank: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.xs, marginBottom: theme.space.md },
  token: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.space.xs,
    paddingHorizontal: theme.space.sm
  },
  tokenText: { color: theme.colors.text },
  check: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    alignItems: 'center'
  },
  checkDisabled: { opacity: 0.5 },
  checkText: { color: theme.colors.surface, fontWeight: '700' }
});
```

- [ ] **Step 4: Implementar TranslateExercise**:

```tsx
// apps/mobile/src/features/lesson-player/exercises/TranslateExercise.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isTokenAnswerCorrect } from '@lingoleap/core';
import type { TranslateExercise as TranslateModel, LearningLanguage } from '@lingoleap/core';
import { theme } from '../../../app/theme';
import { useSpeech } from '../../../shared/useSpeech';
import type { ExerciseComponentProps } from './types';
import { WordBankAnswer } from './WordBankAnswer';

export function TranslateExercise({
  exercise,
  language,
  onResolve
}: ExerciseComponentProps<TranslateModel> & { language: LearningLanguage }) {
  const { speak } = useSpeech(language);

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.source}>{exercise.sourceText}</Text>
        <Pressable accessibilityLabel="Escuchar" onPress={() => speak(exercise.sourceText)} style={styles.speaker}>
          <Text style={styles.speakerText}>🔊</Text>
        </Pressable>
      </View>
      <WordBankAnswer
        wordBank={exercise.wordBank}
        onCheck={(chosenTokens) => onResolve(isTokenAnswerCorrect(exercise.correctAnswer, chosenTokens))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, marginBottom: theme.space.md },
  source: { fontWeight: '700', fontSize: 16, color: theme.colors.text },
  speaker: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    padding: theme.space.xs,
    backgroundColor: theme.colors.surface
  },
  speakerText: { fontSize: 16 }
});
```

- [ ] **Step 5: Implementar ListeningExercise** (sin audio pregrabado, directo a TTS — spec §5):

```tsx
// apps/mobile/src/features/lesson-player/exercises/ListeningExercise.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isTokenAnswerCorrect } from '@lingoleap/core';
import type { ListeningExercise as ListeningModel, LearningLanguage } from '@lingoleap/core';
import { theme } from '../../../app/theme';
import { useSpeech } from '../../../shared/useSpeech';
import type { ExerciseComponentProps } from './types';
import { WordBankAnswer } from './WordBankAnswer';

export function ListeningExercise({
  exercise,
  language,
  onResolve
}: ExerciseComponentProps<ListeningModel> & { language: LearningLanguage }) {
  const { speak } = useSpeech(language);

  return (
    <View>
      <Pressable onPress={() => speak(exercise.text)} style={styles.play}>
        <Text style={styles.playText}>🔊 Escucha y arma lo que oíste</Text>
      </Pressable>
      <WordBankAnswer
        wordBank={exercise.wordBank}
        onCheck={(chosenTokens) => onResolve(isTokenAnswerCorrect(exercise.text, chosenTokens))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  play: {
    backgroundColor: theme.colors.info,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    alignItems: 'center',
    marginBottom: theme.space.md
  },
  playText: { color: theme.colors.surface, fontWeight: '700', fontSize: 16 }
});
```

- [ ] **Step 6: Verificar GREEN**

Run: `pnpm --filter @lingoleap/mobile test -- "Translate|Listening"`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/features/lesson-player/exercises
git commit -m "feat(mobile): ejercicios translate y listening con word bank y TTS"
```

---

### Task 5: MatchPairsExercise

**Files:**
- Create: `apps/mobile/src/features/lesson-player/exercises/MatchPairsExercise.tsx`,
  `apps/mobile/src/features/lesson-player/exercises/MatchPairsExercise.spec.tsx`

**Interfaces:**
- Consumes: `ExerciseComponentProps` (Task 3).
- Produces: `export function MatchPairsExercise(props: ExerciseComponentProps<MatchPairsModel>): JSX.Element;`
  — llama `onResolve(true)` al emparejar todo; NUNCA `onResolve(false)` (los errores de
  emparejamiento no cuentan como respuesta incorrecta; par erróneo se marca 400ms y se
  des-selecciona — paridad con la web).

- [ ] **Step 1: Test que falla (RED)** — `MatchPairsExercise.spec.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { MatchPairsExercise as MatchPairsModel } from '@lingoleap/core';
import { MatchPairsExercise } from './MatchPairsExercise';

const exercise: MatchPairsModel = {
  id: 'e1',
  type: 'match-pairs',
  pairs: [
    { left: 'gato', right: 'cat' },
    { left: 'perro', right: 'dog' }
  ]
};

describe('MatchPairsExercise', () => {
  it('resuelve true al emparejar todos los pares', () => {
    const onResolve = jest.fn();
    render(<MatchPairsExercise exercise={exercise} onResolve={onResolve} />);
    fireEvent.press(screen.getByText('gato'));
    fireEvent.press(screen.getByText('cat'));
    expect(onResolve).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('perro'));
    fireEvent.press(screen.getByText('dog'));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith(true);
  });

  it('un par incorrecto no resuelve y se des-selecciona tras el flash', () => {
    jest.useFakeTimers();
    const onResolve = jest.fn();
    render(<MatchPairsExercise exercise={exercise} onResolve={onResolve} />);
    fireEvent.press(screen.getByText('gato'));
    fireEvent.press(screen.getByText('dog'));
    expect(onResolve).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(400));
    // Tras el flash se puede emparejar bien.
    fireEvent.press(screen.getByText('gato'));
    fireEvent.press(screen.getByText('cat'));
    fireEvent.press(screen.getByText('perro'));
    fireEvent.press(screen.getByText('dog'));
    expect(onResolve).toHaveBeenCalledWith(true);
    jest.useRealTimers();
  });
});
```

- [ ] **Step 2: Verificar RED**

Run: `pnpm --filter @lingoleap/mobile test -- MatchPairs`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar** — port de `apps/web/.../MatchPairsExercise.tsx` con `setTimeout`
  de RN en lugar de `window.setTimeout`:

```tsx
// apps/mobile/src/features/lesson-player/exercises/MatchPairsExercise.tsx
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MatchPairsExercise as MatchPairsModel } from '@lingoleap/core';
import { theme } from '../../../app/theme';
import type { ExerciseComponentProps } from './types';

export function MatchPairsExercise({ exercise, onResolve }: ExerciseComponentProps<MatchPairsModel>) {
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [wrongPair, setWrongPair] = useState<{ left: string; right: string } | null>(null);
  const resolvedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rightColumn = [...exercise.pairs].sort((a, b) => a.right.localeCompare(b.right));

  useEffect(() => {
    if (!resolvedRef.current && matched.size === exercise.pairs.length && exercise.pairs.length > 0) {
      resolvedRef.current = true;
      onResolve(true);
    }
  }, [matched, exercise.pairs, onResolve]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, []);

  function evaluate(left: string, right: string) {
    const isPair = exercise.pairs.some((pair) => pair.left === left && pair.right === right);
    if (isPair) {
      setMatched((prev) => new Set(prev).add(left));
      setSelectedLeft(null);
      setSelectedRight(null);
    } else {
      setWrongPair({ left, right });
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setWrongPair(null);
        setSelectedLeft(null);
        setSelectedRight(null);
        timeoutRef.current = null;
      }, 400);
    }
  }

  function handleLeftPress(left: string) {
    if (matched.has(left) || wrongPair) return;
    setSelectedLeft(left);
    if (selectedRight) evaluate(left, selectedRight);
  }

  function handleRightPress(right: string) {
    if (wrongPair) return;
    setSelectedRight(right);
    if (selectedLeft) evaluate(selectedLeft, right);
  }

  function cardStyle(isMatched: boolean, isWrong: boolean, isSelected: boolean) {
    return [
      styles.card,
      isMatched && styles.cardMatched,
      isWrong && styles.cardWrong,
      isSelected && styles.cardSelected
    ];
  }

  return (
    <View style={styles.columns}>
      <View style={styles.column}>
        {exercise.pairs.map((pair) => {
          const isMatched = matched.has(pair.left);
          const isWrong = wrongPair?.left === pair.left;
          const isSelected = selectedLeft === pair.left;
          return (
            <Pressable
              key={pair.left}
              disabled={isMatched}
              onPress={() => handleLeftPress(pair.left)}
              style={cardStyle(isMatched, isWrong, isSelected)}
            >
              <Text style={isMatched || isWrong ? styles.cardTextInverse : styles.cardText}>{pair.left}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.column}>
        {rightColumn.map((pair) => {
          const isMatched = matched.has(pair.left);
          const isWrong = wrongPair?.right === pair.right;
          const isSelected = selectedRight === pair.right;
          return (
            <Pressable
              key={pair.right}
              disabled={isMatched}
              onPress={() => handleRightPress(pair.right)}
              style={cardStyle(isMatched, isWrong, isSelected)}
            >
              <Text style={isMatched || isWrong ? styles.cardTextInverse : styles.cardText}>{pair.right}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', gap: theme.space.md },
  column: { flex: 1, gap: theme.space.xs },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    padding: theme.space.sm,
    alignItems: 'center'
  },
  cardMatched: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  cardWrong: { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger },
  cardSelected: { borderColor: theme.colors.primary, borderWidth: 2 },
  cardText: { color: theme.colors.text },
  cardTextInverse: { color: theme.colors.surface }
});
```

- [ ] **Step 4: Verificar GREEN**

Run: `pnpm --filter @lingoleap/mobile test -- MatchPairs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/lesson-player/exercises
git commit -m "feat(mobile): ejercicio match-pairs con flash de error"
```

---

### Task 6: FeedbackBar + motivationalPhrases + CompletionScreen + achievementLabels

**Files:**
- Create: `apps/mobile/src/features/lesson-player/motivationalPhrases.ts`,
  `apps/mobile/src/features/lesson-player/FeedbackBar.tsx`,
  `apps/mobile/src/features/lesson-player/CompletionScreen.tsx`,
  `apps/mobile/src/features/lesson-player/CompletionScreen.spec.tsx`,
  `apps/mobile/src/features/achievements/achievementLabels.ts`

**Interfaces:**
- Consumes: tipo `LessonRewards` de `@lingoleap/core`.
- Produces:
```tsx
export function motivationalPhrase(exerciseIndex: number): string;
export function FeedbackBar(props: {
  correct: boolean; correctAnswer?: string; exerciseIndex: number; onContinue: () => void;
}): JSX.Element;
export function CompletionScreen(props: {
  correctCount: number; wrongCount: number; onBack: () => void;
  saveError?: boolean; onRetry?: () => void; retryPending?: boolean; rewards?: LessonRewards;
}): JSX.Element;
export const ACHIEVEMENT_LABEL: Record<string, string>;
```

- [ ] **Step 1: Copias directas** — `motivationalPhrases.ts` y `achievementLabels.ts` son copias
  1:1 de la web:

```ts
// apps/mobile/src/features/lesson-player/motivationalPhrases.ts
const FRASES = ['¡Sigue así!', '¡Vas muy bien!', '¡Excelente!', '¡Un paso más cerca!'];

/** Rota las frases motivacionales de forma determinista según el índice del ejercicio. */
export function motivationalPhrase(exerciseIndex: number): string {
  return FRASES[exerciseIndex % FRASES.length];
}
```

```ts
// apps/mobile/src/features/achievements/achievementLabels.ts
// Copia de apps/web/src/features/achievements/achievementLabels.ts (mantener en sincronía).
export const ACHIEVEMENT_LABEL: Record<string, string> = {
  'streak-3': 'Racha de 3 días',
  'streak-7': 'Racha de 7 días',
  'streak-30': 'Racha de 30 días',
  'lessons-10': '10 lecciones completadas',
  'lessons-50': '50 lecciones completadas',
  'lessons-100': '100 lecciones completadas',
  'level-5': 'Nivel 5 alcanzado',
  'level-10': 'Nivel 10 alcanzado'
};
```

- [ ] **Step 2: Test que falla (RED)** — `CompletionScreen.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CompletionScreen } from './CompletionScreen';

describe('CompletionScreen', () => {
  it('muestra recompensas, logros y contadores', () => {
    render(
      <CompletionScreen
        correctCount={5}
        wrongCount={1}
        onBack={jest.fn()}
        rewards={{
          xpEarned: 12,
          totalXp: 112,
          level: 2,
          streakCount: 3,
          freezeUsed: true,
          hearts: 4,
          gemsEarned: 5,
          achievementsUnlocked: [{ id: 'streak-3', category: 'streak', threshold: 3, gems: 5 }]
        }}
      />
    );
    expect(screen.getByText('+12 XP')).toBeTruthy();
    expect(screen.getByText(/Racha: 3 días/)).toBeTruthy();
    expect(screen.getByText(/congelador salvó tu racha/)).toBeTruthy();
    expect(screen.getByText(/Racha de 3 días/)).toBeTruthy();
    expect(screen.getByText('Aciertos: 5')).toBeTruthy();
    expect(screen.getByText('Errores: 1')).toBeTruthy();
  });

  it('con saveError muestra reintento y lo dispara', () => {
    const onRetry = jest.fn();
    render(<CompletionScreen correctCount={1} wrongCount={0} onBack={jest.fn()} saveError onRetry={onRetry} />);
    expect(screen.getByText('No pudimos guardar tu progreso.')).toBeTruthy();
    fireEvent.press(screen.getByText('Reintentar'));
    expect(onRetry).toHaveBeenCalled();
  });
});
```

Nota: ajustar el fixture de `rewards` al shape real de `LessonRewards` en `packages/core`
(buscar `interface LessonRewards`); la intención de las aserciones no cambia.

- [ ] **Step 3: Verificar RED**

Run: `pnpm --filter @lingoleap/mobile test -- CompletionScreen`
Expected: FAIL (módulo no existe).

- [ ] **Step 4: Implementar FeedbackBar**:

```tsx
// apps/mobile/src/features/lesson-player/FeedbackBar.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../app/theme';
import { motivationalPhrase } from './motivationalPhrases';

export interface FeedbackBarProps {
  correct: boolean;
  correctAnswer?: string;
  exerciseIndex: number;
  onContinue: () => void;
}

export function FeedbackBar({ correct, correctAnswer, exerciseIndex, onContinue }: FeedbackBarProps) {
  return (
    <View style={[styles.bar, correct ? styles.barCorrect : styles.barIncorrect]}>
      <View style={styles.message}>
        <Text style={styles.title}>{correct ? '¡Correcto!' : 'Incorrecto'}</Text>
        {correct && <Text style={styles.detail}>{motivationalPhrase(exerciseIndex)}</Text>}
        {!correct && correctAnswer && <Text style={styles.detail}>Respuesta correcta: {correctAnswer}</Text>}
      </View>
      <Pressable onPress={onContinue} style={styles.continue}>
        <Text style={styles.continueText}>Continuar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginTop: theme.space.md
  },
  barCorrect: { backgroundColor: theme.colors.primary },
  barIncorrect: { backgroundColor: theme.colors.danger },
  message: { flex: 1 },
  title: { color: theme.colors.surface, fontWeight: '700', fontSize: 16 },
  detail: { color: theme.colors.surface, marginTop: theme.space.xs },
  continue: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.md
  },
  continueText: { color: theme.colors.text, fontWeight: '700' }
});
```

- [ ] **Step 5: Implementar CompletionScreen**:

```tsx
// apps/mobile/src/features/lesson-player/CompletionScreen.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LessonRewards } from '@lingoleap/core';
import { theme } from '../../app/theme';
import { ACHIEVEMENT_LABEL } from '../achievements/achievementLabels';

export interface CompletionScreenProps {
  correctCount: number;
  wrongCount: number;
  onBack: () => void;
  saveError?: boolean;
  onRetry?: () => void;
  retryPending?: boolean;
  rewards?: LessonRewards;
}

export function CompletionScreen({
  correctCount,
  wrongCount,
  onBack,
  saveError,
  onRetry,
  retryPending,
  rewards
}: CompletionScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>¡Lección completada!</Text>
      {rewards && (
        <View style={styles.rewards}>
          <Text style={styles.xp}>+{rewards.xpEarned} XP</Text>
          <Text style={styles.line}>
            🔥 Racha: {rewards.streakCount} {rewards.streakCount === 1 ? 'día' : 'días'}
          </Text>
          {rewards.freezeUsed && <Text style={styles.line}>🧊 Un congelador salvó tu racha</Text>}
          {rewards.achievementsUnlocked.map((achievement) => (
            <Text key={achievement.id} style={styles.achievement}>
              🏆 Nuevo logro: {ACHIEVEMENT_LABEL[achievement.id]} (+{achievement.gems}💎)
            </Text>
          ))}
        </View>
      )}
      <Text style={styles.phrase}>¡Gran trabajo! Cada lección te acerca más.</Text>
      <Text style={styles.line}>Aciertos: {correctCount}</Text>
      <Text style={styles.line}>Errores: {wrongCount}</Text>
      {(saveError || retryPending) && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>No pudimos guardar tu progreso.</Text>
          <Pressable
            onPress={onRetry}
            disabled={retryPending}
            style={[styles.button, retryPending && styles.buttonDisabled]}
          >
            <Text style={styles.buttonText}>Reintentar</Text>
          </Pressable>
        </View>
      )}
      <Pressable onPress={onBack} style={styles.button}>
        <Text style={styles.buttonText}>Volver al curso</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: theme.space.lg, backgroundColor: theme.colors.background },
  title: { fontSize: 24, fontWeight: '700', color: theme.colors.text, marginBottom: theme.space.md },
  rewards: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.space.md,
    marginBottom: theme.space.md,
    gap: theme.space.xs
  },
  xp: { fontSize: 20, fontWeight: '700', color: theme.colors.primary },
  line: { color: theme.colors.text, marginBottom: theme.space.xs },
  achievement: { color: theme.colors.warning, fontWeight: '700' },
  phrase: { color: theme.colors.textMuted, marginBottom: theme.space.md },
  errorBox: { marginVertical: theme.space.md },
  errorText: { color: theme.colors.danger, marginBottom: theme.space.sm },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    alignItems: 'center',
    marginTop: theme.space.sm
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: theme.colors.surface, fontWeight: '700' }
});
```

- [ ] **Step 6: Verificar GREEN**

Run: `pnpm --filter @lingoleap/mobile test -- CompletionScreen`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/features/lesson-player apps/mobile/src/features/achievements
git commit -m "feat(mobile): FeedbackBar y CompletionScreen con recompensas"
```

---

### Task 7: LessonPlayerScreen + ruta + lang en la navegación

**Files:**
- Create: `apps/mobile/src/features/lesson-player/LessonPlayerScreen.tsx`,
  `apps/mobile/src/features/lesson-player/LessonPlayerScreen.spec.tsx`,
  `apps/mobile/src/features/lesson-player/queries.ts`
- Modify: `apps/mobile/app/lesson/[lessonId].tsx` (reemplazar el placeholder),
  `apps/mobile/src/features/course-path/CoursePathScreen.tsx` (pasar `lang` al navegar)

**Interfaces:**
- Consumes: todo lo producido por Tasks 1-6; `useStats` (`../stats/queries`), `useProgress`
  (`../course-path/queries`); `api.getLesson(lessonId)` y
  `api.completeLesson(lessonId, { errorCount, date })` de `@lingoleap/api-client`;
  `canStartLesson`, `progressRatio`, tipos `Exercise`/`LearningLanguage` de `@lingoleap/core`.
- Produces: `export function LessonPlayerScreen(): JSX.Element;` — lee `lessonId` y `lang` de
  `useLocalSearchParams`.

- [ ] **Step 1: Pasar lang al navegar** — en
  `apps/mobile/src/features/course-path/CoursePathScreen.tsx` cambiar el `onPress` de la lección:

```tsx
onPress={() => router.push(`/lesson/${lesson.id}?lang=${language}`)}
```

(el archivo es `.tsx`; el resto no cambia). Verificar que el test existente de CoursePathScreen
siga en verde: `pnpm --filter @lingoleap/mobile test -- CoursePathScreen`.

- [ ] **Step 2: queries.ts del player**:

```ts
// apps/mobile/src/features/lesson-player/queries.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../../app/api';

export function useLesson(lessonId: string | undefined) {
  return useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: () => api.getLesson(lessonId as string),
    enabled: Boolean(lessonId)
  });
}
```

- [ ] **Step 3: Test que falla (RED)** — `LessonPlayerScreen.spec.tsx` (mismo patrón de mocks que
  `CoursePathScreen.spec.tsx`):

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

jest.mock('../../app/api', () => ({
  api: {
    getLesson: jest.fn(),
    getStats: jest.fn(),
    getCompletedLessonIds: jest.fn(),
    completeLesson: jest.fn()
  }
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ lessonId: 'l1', lang: 'en' })
}));

import { api } from '../../app/api';
import { useSessionStore } from './sessionStore';
import { LessonPlayerScreen } from './LessonPlayerScreen';

const getLesson = api.getLesson as jest.Mock;
const getStats = api.getStats as jest.Mock;
const getCompletedLessonIds = api.getCompletedLessonIds as jest.Mock;
const completeLesson = api.completeLesson as jest.Mock;

const statsFixture = {
  xp: 0, level: 1, xpIntoLevel: 0, xpToNextLevel: 100,
  streakCount: 0, streakFreezes: 0, gems: 0,
  hearts: 5, maxHearts: 5, nextHeartAt: null
};

const lesson = {
  id: 'l1',
  title: 'Lección 1',
  position: 1,
  exercises: [
    { id: 'e1', type: 'translate', sourceText: 'el gato', correctAnswer: 'the cat', wordBank: ['the', 'cat'], audioUrl: null }
  ]
};

const rewardsFixture = {
  xpEarned: 12, totalXp: 12, level: 1, streakCount: 1,
  freezeUsed: false, hearts: 5, gemsEarned: 0, achievementsUnlocked: []
};

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const WAIT = { timeout: 15000 } as const;

describe('LessonPlayerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.getState().reset();
  });

  it('flujo feliz: ejercicio → feedback → completar → recompensas', async () => {
    getLesson.mockResolvedValue(lesson);
    getStats.mockResolvedValue(statsFixture);
    getCompletedLessonIds.mockResolvedValue([]);
    completeLesson.mockResolvedValue(rewardsFixture);
    renderWithQuery(<LessonPlayerScreen />);
    await waitFor(() => expect(screen.getByText('el gato')).toBeTruthy(), WAIT);
    fireEvent.press(screen.getByText('the'));
    fireEvent.press(screen.getByText('cat'));
    fireEvent.press(screen.getByText('Comprobar'));
    expect(screen.getByText('¡Correcto!')).toBeTruthy();
    fireEvent.press(screen.getByText('Continuar'));
    await waitFor(() => expect(screen.getByText('¡Lección completada!')).toBeTruthy(), WAIT);
    await waitFor(() => expect(screen.getByText('+12 XP')).toBeTruthy(), WAIT);
    expect(completeLesson).toHaveBeenCalledTimes(1);
    expect(completeLesson.mock.calls[0][0]).toBe('l1');
    expect(completeLesson.mock.calls[0][1].errorCount).toBe(0);
  });

  it('sin corazones y lección no completada → pantalla de bloqueo', async () => {
    getLesson.mockResolvedValue(lesson);
    getStats.mockResolvedValue({ ...statsFixture, hearts: 0, nextHeartAt: '2026-07-17T18:00:00.000Z' });
    getCompletedLessonIds.mockResolvedValue([]);
    renderWithQuery(<LessonPlayerScreen />);
    await waitFor(() => expect(screen.getByText('Te quedaste sin corazones')).toBeTruthy(), WAIT);
  });

  it('sin corazones pero lección ya completada → se puede repasar', async () => {
    getLesson.mockResolvedValue(lesson);
    getStats.mockResolvedValue({ ...statsFixture, hearts: 0 });
    getCompletedLessonIds.mockResolvedValue(['l1']);
    renderWithQuery(<LessonPlayerScreen />);
    await waitFor(() => expect(screen.getByText('el gato')).toBeTruthy(), WAIT);
  });

  it('error al cargar la lección (id inexistente incluido) → mensaje de error', async () => {
    getLesson.mockRejectedValue(new Error('LESSON_NOT_FOUND'));
    getStats.mockResolvedValue(statsFixture);
    getCompletedLessonIds.mockResolvedValue([]);
    renderWithQuery(<LessonPlayerScreen />);
    await waitFor(() => expect(screen.getByText('No pudimos cargar la lección')).toBeTruthy(), WAIT);
  });

  it('fallo del guardado → error con reintento que vuelve a llamar la API', async () => {
    getLesson.mockResolvedValue(lesson);
    getStats.mockResolvedValue(statsFixture);
    getCompletedLessonIds.mockResolvedValue([]);
    completeLesson.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(rewardsFixture);
    renderWithQuery(<LessonPlayerScreen />);
    await waitFor(() => expect(screen.getByText('el gato')).toBeTruthy(), WAIT);
    fireEvent.press(screen.getByText('the'));
    fireEvent.press(screen.getByText('cat'));
    fireEvent.press(screen.getByText('Comprobar'));
    fireEvent.press(screen.getByText('Continuar'));
    await waitFor(() => expect(screen.getByText('No pudimos guardar tu progreso.')).toBeTruthy(), WAIT);
    fireEvent.press(screen.getByText('Reintentar'));
    await waitFor(() => expect(completeLesson).toHaveBeenCalledTimes(2), WAIT);
    await waitFor(() => expect(screen.getByText('+12 XP')).toBeTruthy(), WAIT);
  });
});
```

Nota: ajustar fixtures al shape real de `LessonRewards`/`Exercise` de `packages/core` si difiere.

- [ ] **Step 4: Verificar RED**

Run: `pnpm --filter @lingoleap/mobile test -- LessonPlayerScreen`
Expected: FAIL (módulo no existe).

- [ ] **Step 5: Implementar LessonPlayerScreen** — port de
  `apps/web/src/features/lesson-player/LessonPlayerPage.tsx` con TODAS sus guardas (los
  comentarios largos se copian tal cual: documentan bugs reales ya pagados):

```tsx
// apps/mobile/src/features/lesson-player/LessonPlayerScreen.tsx
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { canStartLesson, progressRatio, type Exercise, type LearningLanguage } from '@lingoleap/core';
import { api } from '../../app/api';
import { theme } from '../../app/theme';
import { localDateString } from '../../shared/localDate';
import { useProgress } from '../course-path/queries';
import { useStats } from '../stats/queries';
import { useLesson } from './queries';
import { useSessionStore } from './sessionStore';
import { FeedbackBar } from './FeedbackBar';
import { CompletionScreen } from './CompletionScreen';
import { ImageSelectExercise } from './exercises/ImageSelectExercise';
import { MatchPairsExercise } from './exercises/MatchPairsExercise';
import { TranslateExercise } from './exercises/TranslateExercise';
import { ListeningExercise } from './exercises/ListeningExercise';

function renderExercise(exercise: Exercise, language: LearningLanguage, onResolve: (correct: boolean) => void) {
  // key={exercise.id} fuerza a React a remontar el componente en cada cambio
  // de ejercicio. Sin esto, dos ejercicios del mismo tipo consecutivos (p. ej.
  // dos match-pairs seguidos) reutilizan la misma instancia: el estado interno
  // de MatchPairsExercise queda del ejercicio anterior y el nuevo nunca llega
  // a resolverse.
  switch (exercise.type) {
    case 'image-select':
      return <ImageSelectExercise key={exercise.id} exercise={exercise} onResolve={onResolve} />;
    case 'match-pairs':
      return <MatchPairsExercise key={exercise.id} exercise={exercise} onResolve={onResolve} />;
    case 'translate':
      return <TranslateExercise key={exercise.id} exercise={exercise} language={language} onResolve={onResolve} />;
    case 'listening':
      return <ListeningExercise key={exercise.id} exercise={exercise} language={language} onResolve={onResolve} />;
  }
}

function correctAnswerFor(exercise: Exercise): string | undefined {
  switch (exercise.type) {
    case 'image-select':
      return exercise.options.find((option) => option.correct)?.label;
    case 'translate':
      return exercise.correctAnswer;
    case 'listening':
      return exercise.text;
    case 'match-pairs':
      return undefined;
  }
}

export function LessonPlayerScreen() {
  const { lessonId, lang } = useLocalSearchParams<{ lessonId: string; lang?: string }>();
  const language = (lang ?? 'en') as LearningLanguage;
  const router = useRouter();
  const queryClient = useQueryClient();
  const completedRef = useRef(false);

  // Guard contra un flag "ya completada" stale si la ruta queda montada
  // mientras cambia lessonId (expo-router reutiliza el elemento).
  useEffect(() => {
    completedRef.current = false;
  }, [lessonId]);

  const state = useSessionStore((s) => s.state);
  const start = useSessionStore((s) => s.start);
  const resolve = useSessionStore((s) => s.resolve);
  const next = useSessionStore((s) => s.next);
  const reset = useSessionStore((s) => s.reset);

  // El store de sesión es un singleton global de zustand: si esta pantalla se
  // desmonta (navegación a otra lección) sin limpiar el estado, la próxima
  // lección puede montarse viendo la fase 'finished' de la lección anterior.
  useEffect(() => () => reset(), [reset]);

  const lessonQuery = useLesson(lessonId);
  const statsQuery = useStats();
  const progressQuery = useProgress();
  const stats = statsQuery.data;
  const completedIds = progressQuery.data;
  const lessonAlreadyCompleted = Boolean(lessonId && completedIds?.includes(lessonId));
  const blocked = Boolean(stats && completedIds && !canStartLesson(stats.hearts, lessonAlreadyCompleted));

  // Guard contra re-disparos: stats/progreso se invalidan al completar la
  // lección, y ese refetch trae valores realmente distintos que structural
  // sharing de TanStack Query no colapsa. Sin comprobar si ya existe una
  // sesión para esta lección, el refetch volvería a llamar start() y tiraría
  // la sesión 'finished' recién alcanzada.
  useEffect(() => {
    if (lessonQuery.data && stats && completedIds && !blocked && state?.lesson.id !== lessonQuery.data.id) {
      start(lessonQuery.data);
    }
  }, [lessonQuery.data, stats, completedIds, blocked, start, state]);

  const completeMutation = useMutation({
    mutationFn: () =>
      api.completeLesson(lessonId as string, { errorCount: state?.wrongCount ?? 0, date: localDateString() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
    }
  });
  const {
    mutate: completeLessonMutate,
    data: completeLessonRewards,
    isError: completeLessonFailed,
    isPending: completeLessonPending
  } = completeMutation;

  // Ownership guard: el estado 'finished' solo cuenta como el de ESTA lección
  // si state.lesson.id coincide con lessonId.
  const belongsToCurrentLesson = state?.lesson.id === lessonId;

  useEffect(() => {
    if (state?.phase === 'finished' && belongsToCurrentLesson && !completedRef.current && lessonId) {
      completedRef.current = true;
      completeLessonMutate();
    }
  }, [state?.phase, belongsToCurrentLesson, lessonId, completeLessonMutate]);

  if (lessonQuery.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>No pudimos cargar la lección</Text>
        <Pressable onPress={() => router.back()} style={styles.button}>
          <Text style={styles.buttonText}>Volver al curso</Text>
        </Pressable>
      </View>
    );
  }

  // Sin este guard, un fallo de stats/progreso dejaría "Cargando…" para
  // siempre: isPending pasa a false pero data queda undefined.
  if (statsQuery.isError || progressQuery.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>No pudimos cargar tus estadísticas.</Text>
        <Pressable
          onPress={() => {
            if (statsQuery.isError) void statsQuery.refetch();
            if (progressQuery.isError) void progressQuery.refetch();
          }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  if (lessonQuery.isPending || statsQuery.isPending || progressQuery.isPending) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Cargando…</Text>
      </View>
    );
  }

  if (stats && blocked) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Te quedaste sin corazones</Text>
        <Text style={styles.muted}>Se regenera 1 corazón cada 4 horas.</Text>
        {stats.nextHeartAt && (
          <Text style={styles.muted}>
            El próximo llega a las{' '}
            {new Date(stats.nextHeartAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.
          </Text>
        )}
        <Text style={styles.muted}>
          Mientras tanto, repasa una lección completada: no pierdes corazones por repasar.
        </Text>
        <Pressable onPress={() => router.back()} style={styles.button}>
          <Text style={styles.buttonText}>Volver al curso</Text>
        </Pressable>
      </View>
    );
  }

  if (!state || !belongsToCurrentLesson) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Cargando…</Text>
      </View>
    );
  }

  if (state.phase === 'finished') {
    return (
      <CompletionScreen
        correctCount={state.correctCount}
        wrongCount={state.wrongCount}
        onBack={() => router.back()}
        saveError={completeLessonFailed}
        onRetry={() => completeLessonMutate()}
        retryPending={completeLessonPending}
        rewards={completeLessonRewards}
      />
    );
  }

  const exercise = state.lesson.exercises[state.index];

  // startSession deja la fase en 'answering' aunque la lección venga sin
  // ejercicios; sin esta guardia, renderExercise rompería con undefined.
  if (!exercise) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Esta lección no tiene ejercicios.</Text>
        <Pressable onPress={() => router.back()} style={styles.button}>
          <Text style={styles.buttonText}>Volver al curso</Text>
        </Pressable>
      </View>
    );
  }

  const heartsLeft = Math.max(0, (stats?.hearts ?? 5) - state.wrongCount);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.muted}>
          Ejercicio {state.index + 1} de {state.lesson.exercises.length}
        </Text>
        <Text style={heartsLeft === 0 ? styles.heartsZero : styles.hearts}>❤️ {heartsLeft}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressRatio(state) * 100}%` }]} />
      </View>

      {renderExercise(exercise, language, resolve)}

      {state.phase === 'feedback' && state.lastAnswerCorrect !== null && (
        <FeedbackBar
          correct={state.lastAnswerCorrect}
          correctAnswer={state.lastAnswerCorrect ? undefined : correctAnswerFor(exercise)}
          exerciseIndex={state.index}
          onContinue={next}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.space.md },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.lg,
    gap: theme.space.sm,
    backgroundColor: theme.colors.background
  },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  muted: { color: theme.colors.textMuted, textAlign: 'center' },
  error: { color: theme.colors.danger },
  hearts: { color: theme.colors.danger, fontWeight: '700' },
  heartsZero: { color: theme.colors.textMuted, fontWeight: '700' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.space.sm
  },
  progressTrack: {
    height: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.border,
    marginBottom: theme.space.md,
    overflow: 'hidden'
  },
  progressFill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    alignItems: 'center',
    marginTop: theme.space.md
  },
  buttonText: { color: theme.colors.surface, fontWeight: '700' }
});
```

- [ ] **Step 6: Reemplazar el placeholder** — `apps/mobile/app/lesson/[lessonId].tsx` queda:

```tsx
import { LessonPlayerScreen } from '../../src/features/lesson-player/LessonPlayerScreen';

export default function LessonRoute() {
  return <LessonPlayerScreen />;
}
```

- [ ] **Step 7: Verificar GREEN + suite completa**

Run: `pnpm --filter @lingoleap/mobile test`
Expected: PASS (todas las suites, incluidas las previas de la 4A).

- [ ] **Step 8: Verificar monorepo**

Run: `pnpm lint ; if ($?) { pnpm build } ; if ($?) { pnpm test }`
Expected: todo PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/app apps/mobile/src
git commit -m "feat(mobile): LessonPlayerScreen con guardas de corazones y guardado de progreso"
```

---

### Task 8: Documentación

**Files:**
- Modify: `README.md` (sección de la app móvil: el reproductor ya no es placeholder; mencionar
  los 4 ejercicios y TTS), `docs/BITACORA.md` (nueva entrada "Fase 4B — Reproductor de lecciones
  móvil", mismo formato que las fases anteriores)

- [ ] **Step 1: Actualizar ambos documentos.** La entrada de BITACORA se escribe con los
  problemas REALES que hayan aparecido en las Tasks 1-7 (revisar los reportes/commits) — nada
  genérico. Documentar explícitamente: (1) el port 1:1 y por qué se descartó el player headless
  compartido (spec §7); (2) las guardas portadas de la web y si alguna volvió a morder en RN;
  (3) la decisión de TTS directo sin audio pregrabado; (4) actualizar la deuda técnica de la 4A
  (el placeholder sin validación queda saldado).

- [ ] **Step 2: Verificar y commitear**

Run: `pnpm lint ; if ($?) { pnpm build } ; if ($?) { pnpm test }`
Expected: PASS.

```bash
git add README.md docs/BITACORA.md
git commit -m "docs: bitácora y README del reproductor de lecciones móvil (Fase 4B)"
```

---

### Task 9: Smoke real end-to-end (manual, con el usuario)

**Prerrequisito:** backend corriendo (`pnpm --filter @lingoleap/api dev`) y el teléfono/emulador
con Expo Go en la misma red (config de `.env` según `apps/mobile/.env.example`).

- [ ] **Step 1: Levantar**: `pnpm --filter @lingoleap/api dev` y
  `pnpm --filter @lingoleap/mobile dev`.
- [ ] **Step 2: Recorrido en el dispositivo** (el usuario):
  - Entrar a una lección desbloqueada → aparece el primer ejercicio con contador y corazones.
  - Resolver los 4 tipos de ejercicio; verificar TTS audible en translate (🔊) y listening.
  - Fallar a propósito → FeedbackBar roja con la respuesta correcta; el contador ❤️ baja.
  - Completar la lección → pantalla de recompensas con XP/racha; la StatsBar del camino refleja
    los valores nuevos al volver; la lección queda ✅ y la siguiente ⭐.
  - Repetir la lección completada → se puede (repaso), y al completarla no vuelve a dar XP.
  - Poner `hearts = 0` en Supabase (Table Editor → `user_stats`) → entrar a una lección nueva
    muestra el bloqueo con la hora del próximo corazón; una completada sí abre.
  - Modo avión al completar → aparece "No pudimos guardar tu progreso." y el reintento funciona
    al volver la red.
- [ ] **Step 3: Registrar hallazgos** como fix-commits en la rama y en la BITACORA.

---

## Verificación final

- [ ] `pnpm lint && pnpm build && pnpm test` en verde (los 6 paquetes).
- [ ] Smoke del Task 9 completado en dispositivo real.
- [ ] Merge a master + push + CI verde (flujo de cierre habitual).
