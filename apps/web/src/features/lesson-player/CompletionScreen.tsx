export interface CompletionScreenProps {
  correctCount: number;
  wrongCount: number;
  onBack: () => void;
  saveError?: boolean;
  onRetry?: () => void;
  retryPending?: boolean;
}

export function CompletionScreen({
  correctCount,
  wrongCount,
  onBack,
  saveError,
  onRetry,
  retryPending
}: CompletionScreenProps) {
  return (
    <div className="container">
      <h2>¡Lección completada!</h2>
      <p className="completion-screen-phrase">¡Gran trabajo! Cada lección te acerca más.</p>
      <p>Aciertos: {correctCount}</p>
      <p>Errores: {wrongCount}</p>
      {(saveError || retryPending) && (
        <div role="alert" style={{ color: 'var(--color-danger)', marginBottom: 'var(--space-md)' }}>
          <p style={{ margin: 0 }}>No pudimos guardar tu progreso.</p>
          <button
            type="button"
            className="button button-primary"
            onClick={onRetry}
            disabled={retryPending}
            style={{ marginTop: 'var(--space-sm)' }}
          >
            Reintentar
          </button>
        </div>
      )}
      <button type="button" className="button button-primary" onClick={onBack}>
        Volver al curso
      </button>
    </div>
  );
}
