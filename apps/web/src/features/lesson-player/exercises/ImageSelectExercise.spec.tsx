import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ImageSelectExercise as ImageSelectModel } from '@lingoleap/core';
import { ImageSelectExercise } from './ImageSelectExercise';

const exercise: ImageSelectModel = {
  id: 'e1', type: 'image-select', prompt: 'agua',
  options: [
    { label: 'water', imageUrl: 'https://img/w.jpg', correct: true },
    { label: 'milk', imageUrl: 'https://img/m.jpg', correct: false },
    { label: 'tea', imageUrl: null, correct: false },
    { label: 'bread', imageUrl: 'https://img/b.jpg', correct: false }
  ]
};

describe('ImageSelectExercise', () => {
  it('resuelve correcto al elegir la opción correcta', async () => {
    const onResolve = vi.fn();
    render(<ImageSelectExercise exercise={exercise} onResolve={onResolve} />);
    expect(screen.getByText(/agua/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /water/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    expect(onResolve).toHaveBeenCalledWith(true);
  });

  it('resuelve incorrecto con una opción equivocada', async () => {
    const onResolve = vi.fn();
    render(<ImageSelectExercise exercise={exercise} onResolve={onResolve} />);
    await userEvent.click(screen.getByRole('button', { name: /milk/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    expect(onResolve).toHaveBeenCalledWith(false);
  });

  it('Comprobar está deshabilitado sin selección', () => {
    render(<ImageSelectExercise exercise={exercise} onResolve={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Comprobar' })).toBeDisabled();
  });
});
