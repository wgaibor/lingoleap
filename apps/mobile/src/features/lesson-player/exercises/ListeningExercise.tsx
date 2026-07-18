import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isTokenAnswerCorrect } from '@lingoleap/core';
import type { ListeningExercise as ListeningModel, LearningLanguage } from '@lingoleap/core';
import { theme } from '../../../app/theme';
import { useSpeech } from '../../../shared/useSpeech';
import type { ExerciseComponentProps } from './types';
import { WordBankAnswer } from './WordBankAnswer';

export function ListeningExercise({
  exercise,
  language,
  onResolve
}: ExerciseComponentProps<ListeningModel> & { language: LearningLanguage }) {
  const { speak } = useSpeech(language);

  return (
    <View>
      <Pressable onPress={() => speak(exercise.text)} style={styles.play}>
        <Text style={styles.playText}>🔊 Escucha y arma lo que oíste</Text>
      </Pressable>
      <WordBankAnswer
        wordBank={exercise.wordBank}
        onCheck={(chosenTokens) => onResolve(isTokenAnswerCorrect(exercise.text, chosenTokens))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  play: {
    backgroundColor: theme.colors.info,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    alignItems: 'center',
    marginBottom: theme.space.md
  },
  playText: { color: theme.colors.surface, fontWeight: '700', fontSize: 16 }
});
