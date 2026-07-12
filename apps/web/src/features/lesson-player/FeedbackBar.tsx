export interface FeedbackBarProps {
  correct: boolean;
  correctAnswer?: string;
  onContinue: () => void;
}

export function FeedbackBar({ correct, correctAnswer, onContinue }: FeedbackBarProps) {
  return (
    <div role="status" className={`feedback-bar ${correct ? 'feedback-bar-correct' : 'feedback-bar-incorrect'}`}>
      <div className="feedback-bar-message">
        <p className="feedback-bar-title">{correct ? '¡Correcto!' : 'Incorrecto'}</p>
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
