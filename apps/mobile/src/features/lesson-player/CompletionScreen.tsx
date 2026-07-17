import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LessonRewards } from '@lingoleap/core';
import { theme } from '../../app/theme';
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
    <View style={styles.container}>
      <Text style={styles.title}>¡Lección completada!</Text>
      {rewards && (
        <View style={styles.rewards}>
          <Text style={styles.xp}>+{rewards.xpEarned} XP</Text>
          <Text style={styles.line}>
            🔥 Racha: {rewards.streakCount} {rewards.streakCount === 1 ? 'día' : 'días'}
          </Text>
          {rewards.freezeUsed && <Text style={styles.line}>🧊 Un congelador salvó tu racha</Text>}
          {rewards.achievementsUnlocked.map((achievement) => (
            <Text key={achievement.id} style={styles.achievement}>
              🏆 Nuevo logro: {ACHIEVEMENT_LABEL[achievement.id]} (+{achievement.gems}💎)
            </Text>
          ))}
        </View>
      )}
      <Text style={styles.phrase}>¡Gran trabajo! Cada lección te acerca más.</Text>
      <Text style={styles.line}>Aciertos: {correctCount}</Text>
      <Text style={styles.line}>Errores: {wrongCount}</Text>
      {(saveError || retryPending) && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>No pudimos guardar tu progreso.</Text>
          <Pressable
            onPress={onRetry}
            disabled={retryPending}
            style={[styles.button, retryPending && styles.buttonDisabled]}
          >
            <Text style={styles.buttonText}>Reintentar</Text>
          </Pressable>
        </View>
      )}
      <Pressable onPress={onBack} style={styles.button}>
        <Text style={styles.buttonText}>Volver al curso</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: theme.space.lg, backgroundColor: theme.colors.background },
  title: { fontSize: 24, fontWeight: '700', color: theme.colors.text, marginBottom: theme.space.md },
  rewards: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.space.md,
    marginBottom: theme.space.md,
    gap: theme.space.xs
  },
  xp: { fontSize: 20, fontWeight: '700', color: theme.colors.primary },
  line: { color: theme.colors.text, marginBottom: theme.space.xs },
  achievement: { color: theme.colors.warning, fontWeight: '700' },
  phrase: { color: theme.colors.textMuted, marginBottom: theme.space.md },
  errorBox: { marginVertical: theme.space.md },
  errorText: { color: theme.colors.danger, marginBottom: theme.space.sm },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    alignItems: 'center',
    marginTop: theme.space.sm
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: theme.colors.surface, fontWeight: '700' }
});
