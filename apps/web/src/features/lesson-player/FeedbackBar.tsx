export interface FeedbackBarProps {
  correct: boolean;
  correctAnswer?: string;
  onContinue: () => void;
}

export function FeedbackBar({ correct, correctAnswer, onContinue }: FeedbackBarProps) {
  return (
    <div
      role="status"
      style={{
        position: 'sticky',
        bottom: 0,
        marginTop: 'var(--space-lg)',
        padding: 'var(--space-md)',
        borderRadius: 'var(--radius-md)',
        background: correct ? 'var(--color-primary)' : 'var(--color-danger)',
        color: 'var(--color-surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-md)'
      }}
    >
      <div>
        <p style={{ fontWeight: 700, margin: 0 }}>{correct ? '¡Correcto!' : 'Incorrecto'}</p>
        {!correct && correctAnswer && <p style={{ margin: 0 }}>Respuesta correcta: {correctAnswer}</p>}
      </div>
      <button type="button" className="button button-primary" onClick={onContinue}>
        Continuar
      </button>
    </div>
  );
}
