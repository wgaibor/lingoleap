import { useEffect, useRef, useState } from 'react';
import type { MatchPairsExercise as MatchPairsModel } from '@lingoleap/core';
import type { ExerciseComponentProps } from './ImageSelectExercise';

export function MatchPairsExercise({ exercise, onResolve }: ExerciseComponentProps<MatchPairsModel>) {
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [wrongPair, setWrongPair] = useState<{ left: string; right: string } | null>(null);
  const resolvedRef = useRef(false);

  const rightColumn = [...exercise.pairs].sort((a, b) => a.right.localeCompare(b.right));

  useEffect(() => {
    if (!resolvedRef.current && matched.size === exercise.pairs.length && exercise.pairs.length > 0) {
      resolvedRef.current = true;
      onResolve(true);
    }
  }, [matched, exercise.pairs, onResolve]);

  function evaluate(left: string, right: string) {
    const isPair = exercise.pairs.some((pair) => pair.left === left && pair.right === right);
    if (isPair) {
      setMatched((prev) => new Set(prev).add(left));
      setSelectedLeft(null);
      setSelectedRight(null);
    } else {
      setWrongPair({ left, right });
      window.setTimeout(() => {
        setWrongPair(null);
        setSelectedLeft(null);
        setSelectedRight(null);
      }, 400);
    }
  }

  function handleLeftClick(left: string) {
    if (matched.has(left) || wrongPair) return;
    setSelectedLeft(left);
    if (selectedRight) evaluate(left, selectedRight);
  }

  function handleRightClick(right: string) {
    if (wrongPair) return;
    setSelectedRight(right);
    if (selectedLeft) evaluate(selectedLeft, right);
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
        {exercise.pairs.map((pair) => {
          const isMatched = matched.has(pair.left);
          const isWrong = wrongPair?.left === pair.left;
          const isSelected = selectedLeft === pair.left;
          return (
            <button
              key={pair.left}
              type="button"
              className="button-secondary"
              disabled={isMatched}
              onClick={() => handleLeftClick(pair.left)}
              style={{
                background: isMatched ? 'var(--color-primary)' : isWrong ? 'var(--color-danger)' : undefined,
                color: isMatched || isWrong ? 'var(--color-surface)' : undefined,
                borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)'
              }}
            >
              {pair.left}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
        {rightColumn.map((pair) => {
          const isMatched = matched.has(pair.left);
          const isWrong = wrongPair?.right === pair.right;
          const isSelected = selectedRight === pair.right;
          return (
            <button
              key={pair.right}
              type="button"
              className="button-secondary"
              disabled={isMatched}
              onClick={() => handleRightClick(pair.right)}
              style={{
                background: isMatched ? 'var(--color-primary)' : isWrong ? 'var(--color-danger)' : undefined,
                color: isMatched || isWrong ? 'var(--color-surface)' : undefined,
                borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)'
              }}
            >
              {pair.right}
            </button>
          );
        })}
      </div>
    </div>
  );
}
