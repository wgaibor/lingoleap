import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MatchPairsExercise as MatchPairsModel } from '@lingoleap/core';
import { theme } from '../../../app/theme';
import type { ExerciseComponentProps } from './types';

export function MatchPairsExercise({ exercise, onResolve }: ExerciseComponentProps<MatchPairsModel>) {
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [wrongPair, setWrongPair] = useState<{ left: string; right: string } | null>(null);
  const resolvedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rightColumn = [...exercise.pairs].sort((a, b) => a.right.localeCompare(b.right));

  useEffect(() => {
    if (!resolvedRef.current && matched.size === exercise.pairs.length && exercise.pairs.length > 0) {
      resolvedRef.current = true;
      onResolve(true);
    }
  }, [matched, exercise.pairs, onResolve]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, []);

  function evaluate(left: string, right: string) {
    const isPair = exercise.pairs.some((pair) => pair.left === left && pair.right === right);
    if (isPair) {
      setMatched((prev) => new Set(prev).add(left));
      setSelectedLeft(null);
      setSelectedRight(null);
    } else {
      setWrongPair({ left, right });
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setWrongPair(null);
        setSelectedLeft(null);
        setSelectedRight(null);
        timeoutRef.current = null;
      }, 400);
    }
  }

  function handleLeftPress(left: string) {
    if (matched.has(left) || wrongPair) return;
    setSelectedLeft(left);
    if (selectedRight) evaluate(left, selectedRight);
  }

  function handleRightPress(right: string) {
    if (wrongPair) return;
    setSelectedRight(right);
    if (selectedLeft) evaluate(selectedLeft, right);
  }

  function cardStyle(isMatched: boolean, isWrong: boolean, isSelected: boolean) {
    return [
      styles.card,
      isMatched && styles.cardMatched,
      isWrong && styles.cardWrong,
      isSelected && styles.cardSelected
    ];
  }

  return (
    <View style={styles.columns}>
      <View style={styles.column}>
        {exercise.pairs.map((pair) => {
          const isMatched = matched.has(pair.left);
          const isWrong = wrongPair?.left === pair.left;
          const isSelected = selectedLeft === pair.left;
          return (
            <Pressable
              key={pair.left}
              disabled={isMatched}
              onPress={() => handleLeftPress(pair.left)}
              style={cardStyle(isMatched, isWrong, isSelected)}
            >
              <Text style={isMatched || isWrong ? styles.cardTextInverse : styles.cardText}>{pair.left}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.column}>
        {rightColumn.map((pair) => {
          const isMatched = matched.has(pair.left);
          const isWrong = wrongPair?.right === pair.right;
          const isSelected = selectedRight === pair.right;
          return (
            <Pressable
              key={pair.right}
              disabled={isMatched}
              onPress={() => handleRightPress(pair.right)}
              style={cardStyle(isMatched, isWrong, isSelected)}
            >
              <Text style={isMatched || isWrong ? styles.cardTextInverse : styles.cardText}>{pair.right}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', gap: theme.space.md },
  column: { flex: 1, gap: theme.space.xs },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    padding: theme.space.sm,
    alignItems: 'center'
  },
  cardMatched: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  cardWrong: { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger },
  cardSelected: { borderColor: theme.colors.primary, borderWidth: 2 },
  cardText: { color: theme.colors.text },
  cardTextInverse: { color: theme.colors.surface }
});
