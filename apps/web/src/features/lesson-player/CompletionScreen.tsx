export interface CompletionScreenProps {
  correctCount: number;
  wrongCount: number;
  onBack: () => void;
}

export function CompletionScreen({ correctCount, wrongCount, onBack }: CompletionScreenProps) {
  return (
    <div className="container">
      <h2>¡Lección completada!</h2>
      <p>Aciertos: {correctCount}</p>
      <p>Errores: {wrongCount}</p>
      <button type="button" className="button button-primary" onClick={onBack}>
        Volver al curso
      </button>
    </div>
  );
}
