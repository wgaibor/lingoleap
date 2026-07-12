import { isTokenAnswerCorrect } from '@lingoleap/core';
import type { ListeningExercise as ListeningModel, LearningLanguage } from '@lingoleap/core';
import { useSpeech } from '../../../shared/useSpeech';
import type { ExerciseComponentProps } from './types';
import { WordBankAnswer } from './WordBankAnswer';

export function ListeningExercise({
  exercise,
  language,
  onResolve
}: ExerciseComponentProps<ListeningModel> & { language: LearningLanguage }) {
  const { speak } = useSpeech(language);

  function handlePlay() {
    if (exercise.audioUrl) {
      new Audio(exercise.audioUrl).play().catch(() => speak(exercise.text));
    } else {
      speak(exercise.text);
    }
  }

  function handleCheck(chosenTokens: string[]) {
    onResolve(isTokenAnswerCorrect(exercise.text, chosenTokens));
  }

  return (
    <div>
      <button
        type="button"
        className="button button-primary"
        onClick={handlePlay}
        style={{ display: 'block', marginBottom: 'var(--space-md)', fontSize: '1.5rem' }}
      >
        🔊 Escucha y escribe lo que oíste
      </button>
      <WordBankAnswer wordBank={exercise.wordBank} onCheck={handleCheck} />
    </div>
  );
}
