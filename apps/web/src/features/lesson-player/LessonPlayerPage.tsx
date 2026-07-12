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
  const { mutate: completeLessonMutate } = completeMutation;

  useEffect(() => {
    if (state?.phase === 'finished' && !completedRef.current && lessonId) {
      completedRef.current = true;
      completeLessonMutate(lessonId);
    }
  }, [state?.phase, lessonId, completeLessonMutate]);

  if (lessonQuery.isError) {
    return (
      <div className="container">
        <p role="alert">No pudimos cargar la lección</p>
      </div>
    );
  }

  if (lessonQuery.isPending || !state) {
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
      <div
        style={{
          background: 'var(--color-border)',
          borderRadius: 'var(--radius-pill)',
          height: 8,
          marginBottom: 'var(--space-lg)'
        }}
      >
        <div
          style={{
            background: 'var(--color-primary)',
            width: `${progressRatio(state) * 100}%`,
            height: '100%',
            borderRadius: 'var(--radius-pill)'
          }}
        />
      </div>

      {renderExercise(exercise, language, resolve)}

      {state.phase === 'feedback' && state.lastAnswerCorrect !== null && (
        <FeedbackBar
          correct={state.lastAnswerCorrect}
          correctAnswer={state.lastAnswerCorrect ? undefined : correctAnswerFor(exercise)}
          onContinue={next}
        />
      )}
    </div>
  );
}
