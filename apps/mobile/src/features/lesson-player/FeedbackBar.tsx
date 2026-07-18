import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../app/theme';
import { motivationalPhrase } from './motivationalPhrases';

export interface FeedbackBarProps {
  correct: boolean;
  correctAnswer?: string;
  exerciseIndex: number;
  onContinue: () => void;
}

export function FeedbackBar({ correct, correctAnswer, exerciseIndex, onContinue }: FeedbackBarProps) {
  return (
    <View style={[styles.bar, correct ? styles.barCorrect : styles.barIncorrect]}>
      <View style={styles.message}>
        <Text style={styles.title}>{correct ? '¡Correcto!' : 'Incorrecto'}</Text>
        {correct && <Text style={styles.detail}>{motivationalPhrase(exerciseIndex)}</Text>}
        {!correct && correctAnswer && <Text style={styles.detail}>Respuesta correcta: {correctAnswer}</Text>}
      </View>
      <Pressable onPress={onContinue} style={styles.continue}>
        <Text style={styles.continueText}>Continuar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginTop: theme.space.md
  },
  barCorrect: { backgroundColor: theme.colors.primary },
  barIncorrect: { backgroundColor: theme.colors.danger },
  message: { flex: 1 },
  title: { color: theme.colors.surface, fontWeight: '700', fontSize: 16 },
  detail: { color: theme.colors.surface, marginTop: theme.space.xs },
  continue: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.md
  },
  continueText: { color: theme.colors.text, fontWeight: '700' }
});
