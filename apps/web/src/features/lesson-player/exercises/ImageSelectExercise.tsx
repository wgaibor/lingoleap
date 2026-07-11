import { useState } from 'react';
import type { ImageSelectExercise as ImageSelectModel } from '@lingoleap/core';

/** Contrato común de todos los componentes de ejercicio (reutilizado por Translate/Listening). */
export interface ExerciseComponentProps<E> {
  exercise: E;
  /** Se llama UNA vez cuando el usuario resuelve el ejercicio. */
  onResolve: (correct: boolean) => void;
}

export function ImageSelectExercise({ exercise, onResolve }: ExerciseComponentProps<ImageSelectModel>) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  function handleCheck() {
    if (selectedIndex === null) return;
    onResolve(exercise.options[selectedIndex].correct);
  }

  return (
    <div>
      <p style={{ fontWeight: 700, marginBottom: 'var(--space-md)' }}>¿Cuál es «{exercise.prompt}»?</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-md)'
        }}
      >
        {exercise.options.map((option, index) => {
          const isSelected = selectedIndex === index;
          return (
            <button
              key={option.label}
              type="button"
              className="button-secondary"
              aria-pressed={isSelected}
              onClick={() => setSelectedIndex(index)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 'var(--space-xs)',
                borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                borderWidth: isSelected ? 2 : 1
              }}
            >
              {option.imageUrl && (
                <img
                  src={option.imageUrl}
                  alt={option.label}
                  style={{ width: '100%', height: 96, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
                />
              )}
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="button button-primary"
        disabled={selectedIndex === null}
        onClick={handleCheck}
      >
        Comprobar
      </button>
    </div>
  );
}
