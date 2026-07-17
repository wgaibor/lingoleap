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
