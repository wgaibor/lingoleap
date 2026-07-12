import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lesson } from '@lingoleap/core';

// vi.mock is hoisted above module-level const declarations, so the fixtures
// must be created via vi.hoisted() to avoid a temporal-dead-zone error when
// the mock factory reads them (same pattern as CoursePathPage.spec.tsx).
const { lesson, getLesson, completeLesson } = vi.hoisted(() => ({
  lesson: {
    id: 'l1', title: 'Lección 1', position: 1,
    exercises: [
      { id: 'e1', type: 'match-pairs', pairs: [{ left: 'water', right: 'agua' }] },
      { id: 'e2', type: 'image-select', prompt: 'leche',
        options: [ { label: 'milk', imageUrl: null, correct: true }, { label: 'tea', imageUrl: null, correct: false } ] }
    ]
  } satisfies Lesson,
  getLesson: vi.fn(),
  completeLesson: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../app/api', () => ({
  api: {
    getLesson: (...a: unknown[]) => getLesson(...a),
    completeLesson: (...a: unknown[]) => completeLesson(...a)
  }
}));

import { LessonPlayerPage } from './LessonPlayerPage';
import { renderWithProviders } from '../../test/render';
import { useSessionStore } from './sessionStore';

describe('LessonPlayerPage', () => {
  beforeEach(() => {
    getLesson.mockReset().mockResolvedValue(lesson);
    completeLesson.mockClear();
    useSessionStore.getState().reset();
  });

  it('recorre la lección completa y registra el progreso', async () => {
    renderWithProviders(<LessonPlayerPage />, { route: '/lesson/l1?lang=en', path: '/lesson/:lessonId' });

    // Ejercicio 1: parejas
    await userEvent.click(await screen.findByRole('button', { name: 'water' }));
    await userEvent.click(screen.getByRole('button', { name: 'agua' }));
    expect(await screen.findByText('¡Correcto!')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    // Ejercicio 2: selección
    await userEvent.click(screen.getByRole('button', { name: /milk/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    // Pantalla final
    expect(await screen.findByText('¡Lección completada!')).toBeInTheDocument();
    expect(completeLesson).toHaveBeenCalledWith('l1');
    expect(completeLesson).toHaveBeenCalledTimes(1);
  });

  it('muestra un estado vacío si la lección no tiene ejercicios', async () => {
    getLesson.mockResolvedValue({ id: 'l9', title: 'Lección vacía', position: 9, exercises: [] } satisfies Lesson);

    renderWithProviders(<LessonPlayerPage />, { route: '/lesson/l9?lang=en', path: '/lesson/:lessonId' });

    expect(await screen.findByText('Esta lección no tiene ejercicios.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver al curso' })).toBeInTheDocument();
    expect(completeLesson).not.toHaveBeenCalled();
  });
});
