import { useState } from 'react';

export interface WordBankAnswerProps {
  wordBank: string[];
  onCheck: (chosenTokens: string[]) => void;
}

/** Banco de fichas compartido: clic mueve una ficha del banco a la respuesta y viceversa. */
export function WordBankAnswer({ wordBank, onCheck }: WordBankAnswerProps) {
  const [chosen, setChosen] = useState<number[]>([]);

  const availableIndexes = wordBank
    .map((_, index) => index)
    .filter((index) => !chosen.includes(index));

  function handlePick(index: number) {
    setChosen((prev) => [...prev, index]);
  }

  function handleUnpick(position: number) {
    setChosen((prev) => prev.filter((_, i) => i !== position));
  }

  function handleCheck() {
    if (chosen.length === 0) return;
    onCheck(chosen.map((index) => wordBank[index]));
  }

  return (
    <div>
      <div
        data-testid="answer-zone"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-xs)',
          minHeight: 44,
          padding: 'var(--space-sm)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: 'var(--space-sm)'
        }}
      >
        {chosen.map((index, position) => (
          <button
            key={`${index}-${position}`}
            type="button"
            className="button-secondary"
            onClick={() => handleUnpick(position)}
          >
            {wordBank[index]}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)', marginBottom: 'var(--space-md)' }}>
        {availableIndexes.map((index) => (
          <button key={index} type="button" className="button-secondary" onClick={() => handlePick(index)}>
            {wordBank[index]}
          </button>
        ))}
      </div>
      <button type="button" className="button button-primary" disabled={chosen.length === 0} onClick={handleCheck}>
        Comprobar
      </button>
    </div>
  );
}
