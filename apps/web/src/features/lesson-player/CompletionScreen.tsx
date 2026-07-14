import type { LessonRewards } from '@lingoleap/core';
import { ACHIEVEMENT_LABEL } from '../achievements/achievementLabels';

export interface CompletionScreenProps {
  correctCount: number;
  wrongCount: number;
  onBack: () => void;
  saveError?: boolean;
  onRetry?: () => void;
  retryPending?: boolean;
  rewards?: LessonRewards;
}

export function CompletionScreen({
  correctCount,
  wrongCount,
  onBack,
  saveError,
  onRetry,
  retryPending,
  rewards
}: CompletionScreenProps) {
  return (
    <div className="container">
      <h2>¡Lección completada!</h2>
      {rewards && (
        <div className="completion-rewards">
          <p className="completion-xp">+{rewards.xpEarned} XP</p>
          <p>🔥 Racha: {rewards.streakCount} {rewards.streakCount === 1 ? 'día' : 'días'}</p>
          {rewards.freezeUsed && <p>🧊 Un congelador salvó tu racha</p>}
          {rewards.achievementsUnlocked.map((achievement) => (
            <p key={achievement.id} className="completion-achievement">
              🏆 Nuevo logro: {ACHIEVEMENT_LABEL[achievement.id]} (+{achievement.gems}💎)
            </p>
          ))}
        </div>
      )}
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
