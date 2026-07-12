import { isTokenAnswerCorrect } from '@lingoleap/core';
import type { TranslateExercise as TranslateModel, LearningLanguage } from '@lingoleap/core';
import { useSpeech } from '../../../shared/useSpeech';
import type { ExerciseComponentProps } from './types';
import { WordBankAnswer } from './WordBankAnswer';

export function TranslateExercise({
  exercise,
  language,
  onResolve
}: ExerciseComponentProps<TranslateModel> & { language: LearningLanguage }) {
  const { speak } = useSpeech(language);

  function handleCheck(chosenTokens: string[]) {
    onResolve(isTokenAnswerCorrect(exercise.correctAnswer, chosenTokens));
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-md)'
        }}
      >
        <p style={{ fontWeight: 700 }}>{exercise.sourceText}</p>
        <button
          type="button"
          className="button-secondary"
          aria-label="Escuchar"
          onClick={() => speak(exercise.sourceText)}
        >
          🔊
        </button>
      </div>
      <WordBankAnswer wordBank={exercise.wordBank} onCheck={handleCheck} />
    </div>
  );
}
