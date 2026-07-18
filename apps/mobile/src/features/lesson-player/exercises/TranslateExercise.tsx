import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isTokenAnswerCorrect } from '@lingoleap/core';
import type { TranslateExercise as TranslateModel, LearningLanguage } from '@lingoleap/core';
import { theme } from '../../../app/theme';
import { useSpeech } from '../../../shared/useSpeech';
import type { ExerciseComponentProps } from './types';
import { WordBankAnswer } from './WordBankAnswer';

export function TranslateExercise({
  exercise,
  language,
  onResolve
}: ExerciseComponentProps<TranslateModel> & { language: LearningLanguage }) {
  const { speak } = useSpeech(language);

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.source}>{exercise.sourceText}</Text>
        <Pressable accessibilityLabel="Escuchar" onPress={() => speak(exercise.sourceText)} style={styles.speaker}>
          <Text style={styles.speakerText}>🔊</Text>
        </Pressable>
      </View>
      <WordBankAnswer
        wordBank={exercise.wordBank}
        onCheck={(chosenTokens) => onResolve(isTokenAnswerCorrect(exercise.correctAnswer, chosenTokens))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, marginBottom: theme.space.md },
  source: { fontWeight: '700', fontSize: 16, color: theme.colors.text },
  speaker: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    padding: theme.space.xs,
    backgroundColor: theme.colors.surface
  },
  speakerText: { fontSize: 16 }
});
