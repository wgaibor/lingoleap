import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { progressRatio, type Exercise, type LearningLanguage } from '@lingoleap/core';
import { api } from '../../app/api';
import { useSessionStore } from './sessionStore';
import { FeedbackBar } from './FeedbackBar';
import { CompletionScreen } from './CompletionScreen';
import { ImageSelectExercise } from './exercises/ImageSelectExercise';
import { MatchPairsExercise } from './exercises/MatchPairsExercise';
import { TranslateExercise } from './exercises/TranslateExercise';
import { ListeningExercise } from './exercises/ListeningExercise';

function renderExercise(exercise: Exercise, language: LearningLanguage, onResolve: (correct: boolean) => void) {
  switch (exercise.type) {
    case 'image-select':
      return <ImageSelectExercise exercise={exercise} onResolve={onResolve} />;
    case 'match-pairs':
      return <MatchPairsExercise exercise={exercise} onResolve={onResolve} />;
    case 'translate':
      return <TranslateExercise exercise={exercise} language={language} onResolve={onResolve} />;
    case 'listening':
      return <ListeningExercise exercise={exercise} language={language} onResolve={onResolve} />;
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

  useEffect(() => {
    if (lessonQuery.data) {
      start(lessonQuery.data);
    }
  }, [lessonQuery.data, start]);

  const completeMutation = useMutation({
    mutationFn: (id: string) => api.completeLesson(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progress'] });
    }
  });
  const { mutate: completeLessonMutate, isError: completeLessonFailed } = completeMutation;

  // Ownership guard: el estado 'finished' solo cuenta como el de ESTA lección
  // si state.lesson.id coincide con lessonId. Sin esto, el estado 'finished'
  // que quedó en el store al terminar una lección anterior dispararía la
  // mutación de completado (y el render final) para la lección recién abierta.
  const belongsToCurrentLesson = state?.lesson.id === lessonId;

  useEffect(() => {
    if (state?.phase === 'finished' && belongsToCurrentLesson && !completedRef.current && lessonId) {
      completedRef.current = true;
      completeLessonMutate(lessonId);
    }
  }, [state?.phase, belongsToCurrentLesson, lessonId, completeLessonMutate]);

  function handleRetryComplete() {
    if (lessonId) completeLessonMutate(lessonId);
  }

  if (lessonQuery.isError) {
    return (
      <div className="container">
        <p role="alert">No pudimos cargar la lección</p>
      </div>
    );
  }

  if (lessonQuery.isPending || !state || !belongsToCurrentLesson) {
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

  return (
    <div className="container">
      <p className="exercise-counter">
        Ejercicio {state.index + 1} de {state.lesson.exercises.length}
      </p>
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${progressRatio(state) * 100}%` }} />
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
