import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { canStartLesson, progressRatio, type Exercise, type LearningLanguage } from '@lingoleap/core';
import { api } from '../../app/api';
import { localDateString } from '../../shared/localDate';
import { useProgress } from '../course-path/queries';
import { useStats } from '../stats/queries';
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
  // de MatchPairsExercise (parejas ya emparejadas, ref de "ya resuelto") queda
  // del ejercicio anterior y el nuevo nunca llega a resolverse.
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

export function LessonPlayerPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const [searchParams] = useSearchParams();
  const language = (searchParams.get('lang') ?? 'en') as LearningLanguage;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const completedRef = useRef(false);

  // Guards against a stale "already completed" flag if the route stays
  // mounted while :lessonId changes (React Router reuses the element).
  useEffect(() => {
    completedRef.current = false;
  }, [lessonId]);

  const state = useSessionStore((s) => s.state);
  const start = useSessionStore((s) => s.start);
  const resolve = useSessionStore((s) => s.resolve);
  const next = useSessionStore((s) => s.next);
  const reset = useSessionStore((s) => s.reset);

  // El store de sesión es un singleton global de zustand: si esta página se
  // desmonta (navegación a otra lección) sin limpiar el estado, la próxima
  // lección puede montarse viendo la fase 'finished' de la lección anterior.
  useEffect(() => () => reset(), [reset]);

  const lessonQuery = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: () => api.getLesson(lessonId as string),
    enabled: Boolean(lessonId)
  });

  const statsQuery = useStats();
  const progressQuery = useProgress();
  const stats = statsQuery.data;
  const completedIds = progressQuery.data;
  const lessonAlreadyCompleted = Boolean(lessonId && completedIds?.includes(lessonId));
  const blocked = Boolean(stats && completedIds && !canStartLesson(stats.hearts, lessonAlreadyCompleted));

  // Guard contra re-disparos: stats/progreso se invalidan al completar la
  // lección (para refrescar la StatsBar), y ese refetch trae valores
  // realmente distintos (xp ganado, lección agregada a completadas) que
  // structural sharing de TanStack Query no colapsa a la referencia previa.
  // Sin comprobar si ya existe una sesión para esta lección, ese refetch
  // volvía a llamar a start() y tiraba la sesión 'finished' recién
  // alcanzada, reiniciando la lección antes de que el usuario viera sus
  // recompensas.
  useEffect(() => {
    if (lessonQuery.data && stats && completedIds && !blocked && state?.lesson.id !== lessonQuery.data.id) {
      start(lessonQuery.data);
    }
  }, [lessonQuery.data, stats, completedIds, blocked, start, state]);

  const completeMutation = useMutation({
    mutationFn: () =>
      api.completeLesson(lessonId as string, { errorCount: state?.wrongCount ?? 0, date: localDateString() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progress'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    }
  });
  const {
    mutate: completeLessonMutate,
    data: completeLessonRewards,
    isError: completeLessonFailed,
    isPending: completeLessonPending
  } = completeMutation;

  // Ownership guard: el estado 'finished' solo cuenta como el de ESTA lección
  // si state.lesson.id coincide con lessonId. Sin esto, el estado 'finished'
  // que quedó en el store al terminar una lección anterior dispararía la
  // mutación de completado (y el render final) para la lección recién abierta.
  const belongsToCurrentLesson = state?.lesson.id === lessonId;

  useEffect(() => {
    if (state?.phase === 'finished' && belongsToCurrentLesson && !completedRef.current && lessonId) {
      completedRef.current = true;
      completeLessonMutate();
    }
  }, [state?.phase, belongsToCurrentLesson, lessonId, completeLessonMutate]);

  function handleRetryComplete() {
    if (lessonId) completeLessonMutate();
  }

  if (lessonQuery.isError) {
    return (
      <div className="container">
        <p role="alert">No pudimos cargar la lección</p>
      </div>
    );
  }

  // Sin este guard, un fallo de stats/progreso dejaba "Cargando…" para siempre:
  // isPending pasa a false pero data queda undefined, así que ni el bloqueo ni
  // start() llegan a correr, aun con corazones disponibles.
  if (statsQuery.isError || progressQuery.isError) {
    return (
      <div className="container">
        <p role="alert">No pudimos cargar tus estadísticas.</p>
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            if (statsQuery.isError) void statsQuery.refetch();
            if (progressQuery.isError) void progressQuery.refetch();
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (lessonQuery.isPending || statsQuery.isPending || progressQuery.isPending) {
    return (
      <div className="container">
        <p>Cargando…</p>
      </div>
    );
  }

  if (stats && blocked) {
    return (
      <div className="container no-hearts">
        <h2>Te quedaste sin corazones</h2>
        <p>Se regenera 1 corazón cada 4 horas.</p>
        {stats.nextHeartAt && (
          <p>
            El próximo llega a las{' '}
            {new Date(stats.nextHeartAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.
          </p>
        )}
        <p>Mientras tanto, repasa una lección completada: no pierdes corazones por repasar lo aprendido.</p>
        <button type="button" className="button button-primary" onClick={() => navigate(-1)}>
          Volver al curso
        </button>
      </div>
    );
  }

  if (!state || !belongsToCurrentLesson) {
    return (
      <div className="container">
        <p>Cargando…</p>
      </div>
    );
  }

  if (state.phase === 'finished') {
    return (
      <CompletionScreen
        correctCount={state.correctCount}
        wrongCount={state.wrongCount}
        onBack={() => navigate(-1)}
        saveError={completeLessonFailed}
        onRetry={handleRetryComplete}
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
      <div className="container">
        <p>Esta lección no tiene ejercicios.</p>
        <button type="button" className="button button-primary" onClick={() => navigate(-1)}>
          Volver al curso
        </button>
      </div>
    );
  }

  const heartsLeft = Math.max(0, (stats?.hearts ?? 5) - state.wrongCount);

  return (
    <div className="container">
      <div className="lesson-player-header">
        <div className="lesson-player-top">
          <p className="exercise-counter">
            Ejercicio {state.index + 1} de {state.lesson.exercises.length}
          </p>
          <p className={`player-hearts${heartsLeft === 0 ? ' player-hearts-zero' : ''}`}>❤️ {heartsLeft}</p>
        </div>
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${progressRatio(state) * 100}%` }} />
        </div>
      </div>

      {renderExercise(exercise, language, resolve)}

      {state.phase === 'feedback' && state.lastAnswerCorrect !== null && (
        <FeedbackBar
          correct={state.lastAnswerCorrect}
          correctAnswer={state.lastAnswerCorrect ? undefined : correctAnswerFor(exercise)}
          exerciseIndex={state.index}
          onContinue={next}
        />
      )}
    </div>
  );
}
