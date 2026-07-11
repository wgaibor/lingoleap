import type { Lesson } from '../exercises';

export interface LessonSessionState {
  lesson: Lesson;
  index: number;
  correctCount: number;
  wrongCount: number;
  phase: 'answering' | 'feedback' | 'finished';
  lastAnswerCorrect: boolean | null;
}

export function startSession(lesson: Lesson): LessonSessionState {
  return { lesson, index: 0, correctCount: 0, wrongCount: 0, phase: 'answering', lastAnswerCorrect: null };
}

export function submitAnswer(state: LessonSessionState, correct: boolean): LessonSessionState {
  if (state.phase !== 'answering') return state;
  return {
    ...state,
    phase: 'feedback',
    lastAnswerCorrect: correct,
    correctCount: state.correctCount + (correct ? 1 : 0),
    wrongCount: state.wrongCount + (correct ? 0 : 1)
  };
}

export function advance(state: LessonSessionState): LessonSessionState {
  if (state.phase !== 'feedback') return state;
  const isLast = state.index >= state.lesson.exercises.length - 1;
  return isLast
    ? { ...state, phase: 'finished' }
    : { ...state, phase: 'answering', index: state.index + 1, lastAnswerCorrect: null };
}

export function progressRatio(state: LessonSessionState): number {
  const total = state.lesson.exercises.length;
  if (total === 0) return 1;
  const answered = state.correctCount + state.wrongCount;
  return answered / total;
}
