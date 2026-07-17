import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ImageSelectExercise as ImageSelectModel } from '@lingoleap/core';
import { theme } from '../../../app/theme';
import type { ExerciseComponentProps } from './types';

export function ImageSelectExercise({ exercise, onResolve }: ExerciseComponentProps<ImageSelectModel>) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  function handleCheck() {
    if (selectedIndex === null) return;
    onResolve(exercise.options[selectedIndex].correct);
  }

  return (
    <View>
      <Text style={styles.prompt}>¿Cuál es «{exercise.prompt}»?</Text>
      <View style={styles.options}>
        {exercise.options.map((option, index) => {
          const isSelected = selectedIndex === index;
          return (
            <Pressable
              key={option.label}
              onPress={() => setSelectedIndex(index)}
              style={[styles.option, isSelected && styles.optionSelected]}
              testID={`option-${index}`}
              accessibilityRole="button"
            >
              {option.imageUrl && (
                <Image source={{ uri: option.imageUrl }} style={styles.image} resizeMode="cover" />
              )}
              <Text style={styles.optionLabel}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={handleCheck}
        disabled={selectedIndex === null}
        style={[styles.check, selectedIndex === null && styles.checkDisabled]}
        testID="check-button"
        accessibilityRole="button"
      >
        <Text style={styles.checkText}>Comprobar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: { fontWeight: '700', color: theme.colors.text, marginBottom: theme.space.md, fontSize: 16 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, marginBottom: theme.space.md },
  option: {
    alignItems: 'center',
    gap: theme.space.xs,
    padding: theme.space.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    width: '47%'
  },
  optionSelected: { borderColor: theme.colors.primary, borderWidth: 2 },
  image: { width: '100%', aspectRatio: 1, borderRadius: theme.radius.sm, backgroundColor: theme.colors.border },
  optionLabel: { color: theme.colors.text },
  check: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    alignItems: 'center'
  },
  checkDisabled: { opacity: 0.5 },
  checkText: { color: theme.colors.surface, fontWeight: '700' }
});
