import { motivationalPhrase } from './motivationalPhrases';

export interface FeedbackBarProps {
  correct: boolean;
  correctAnswer?: string;
  exerciseIndex: number;
  onContinue: () => void;
}

export function FeedbackBar({ correct, correctAnswer, exerciseIndex, onContinue }: FeedbackBarProps) {
  return (
    <div role="status" className={`feedback-bar ${correct ? 'feedback-bar-correct' : 'feedback-bar-incorrect'}`}>
      <div className="feedback-bar-message">
        <p className="feedback-bar-title">{correct ? '¡Correcto!' : 'Incorrecto'}</p>
        {correct && <p className="feedback-bar-phrase">{motivationalPhrase(exerciseIndex)}</p>}
        {!correct && correctAnswer && <p className="feedback-bar-answer">Respuesta correcta: {correctAnswer}</p>}
      </div>
      <button
        type="button"
        className={`button button-continue ${correct ? 'button-continue-correct' : 'button-continue-incorrect'}`}
        onClick={onContinue}
      >
        Continuar
      </button>
    </div>
  );
}
