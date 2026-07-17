import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../../app/theme';

export interface WordBankAnswerProps {
  wordBank: string[];
  onCheck: (chosenTokens: string[]) => void;
}

/** Banco de fichas compartido: tap mueve una ficha del banco a la respuesta y viceversa. */
export function WordBankAnswer({ wordBank, onCheck }: WordBankAnswerProps) {
  const [chosen, setChosen] = useState<number[]>([]);

  const availableIndexes = wordBank
    .map((_, index) => index)
    .filter((index) => !chosen.includes(index));

  function handleCheck() {
    if (chosen.length === 0) return;
    onCheck(chosen.map((index) => wordBank[index]));
  }

  return (
    <View>
      <View style={styles.answerZone} testID="answer-zone">
        {chosen.map((index, position) => (
          <Pressable
            key={`${index}-${position}`}
            onPress={() => setChosen((prev) => prev.filter((_, i) => i !== position))}
            style={styles.token}
          >
            <Text style={styles.tokenText}>{wordBank[index]}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.bank}>
        {availableIndexes.map((index) => (
          <Pressable key={index} onPress={() => setChosen((prev) => [...prev, index])} style={styles.token}>
            <Text style={styles.tokenText}>{wordBank[index]}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={handleCheck}
        disabled={chosen.length === 0}
        style={[styles.check, chosen.length === 0 && styles.checkDisabled]}
      >
        <Text style={styles.checkText}>Comprobar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  answerZone: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.xs,
    minHeight: 44,
    padding: theme.space.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    marginBottom: theme.space.sm
  },
  bank: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.xs, marginBottom: theme.space.md },
  token: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.space.xs,
    paddingHorizontal: theme.space.sm
  },
  tokenText: { color: theme.colors.text },
  check: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    alignItems: 'center'
  },
  checkDisabled: { opacity: 0.5 },
  checkText: { color: theme.colors.surface, fontWeight: '700' }
});
