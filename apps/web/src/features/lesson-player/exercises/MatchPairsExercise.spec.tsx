import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MatchPairsExercise as MatchPairsModel } from '@lingoleap/core';
import { MatchPairsExercise } from './MatchPairsExercise';

const exercise: MatchPairsModel = {
  id: 'e1', type: 'match-pairs',
  pairs: [ { left: 'water', right: 'agua' }, { left: 'milk', right: 'leche' } ]
};

describe('MatchPairsExercise', () => {
  it('resuelve al unir todas las parejas', async () => {
    const onResolve = vi.fn();
    render(<MatchPairsExercise exercise={exercise} onResolve={onResolve} />);
    await userEvent.click(screen.getByRole('button', { name: 'water' }));
    await userEvent.click(screen.getByRole('button', { name: 'agua' }));
    expect(onResolve).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'milk' }));
    await userEvent.click(screen.getByRole('button', { name: 'leche' }));
    expect(onResolve).toHaveBeenCalledWith(true);
  });

  it('una pareja incorrecta se des-selecciona y no resuelve', async () => {
    const onResolve = vi.fn();
    render(<MatchPairsExercise exercise={exercise} onResolve={onResolve} />);
    await userEvent.click(screen.getByRole('button', { name: 'water' }));
    await userEvent.click(screen.getByRole('button', { name: 'leche' }));
    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'water' })).not.toBeDisabled();
  });
});
