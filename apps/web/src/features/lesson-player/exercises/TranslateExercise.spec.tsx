import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TranslateExercise as TranslateModel } from '@lingoleap/core';
import { TranslateExercise } from './TranslateExercise';

const exercise: TranslateModel = {
  id: 'e1', type: 'translate', sourceText: 'You dance.',
  correctAnswer: 'Tú bailas.', wordBank: ['bailas', 'Tú', 'come'], audioUrl: null
};

describe('TranslateExercise', () => {
  it('arma la respuesta con fichas y resuelve correcto', async () => {
    const onResolve = vi.fn();
    render(<TranslateExercise exercise={exercise} language="en" onResolve={onResolve} />);
    expect(screen.getByText('You dance.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tú' }));
    await userEvent.click(screen.getByRole('button', { name: 'bailas' }));
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    expect(onResolve).toHaveBeenCalledWith(true);
  });

  it('respuesta incompleta resuelve incorrecto', async () => {
    const onResolve = vi.fn();
    render(<TranslateExercise exercise={exercise} language="en" onResolve={onResolve} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tú' }));
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    expect(onResolve).toHaveBeenCalledWith(false);
  });

  it('una ficha usada vuelve al banco al tocarla en la respuesta', async () => {
    render(<TranslateExercise exercise={exercise} language="en" onResolve={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tú' }));
    const answerZone = screen.getByTestId('answer-zone');
    expect(answerZone).toHaveTextContent('Tú');
    await userEvent.click(screen.getByTestId('answer-zone').querySelector('button')!);
    expect(answerZone).not.toHaveTextContent('Tú');
  });
});
