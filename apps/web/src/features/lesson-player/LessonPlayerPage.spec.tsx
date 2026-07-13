import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lesson } from '@lingoleap/core';

// vi.mock is hoisted above module-level const declarations, so the fixtures
// must be created via vi.hoisted() to avoid a temporal-dead-zone error when
// the mock factory reads them (same pattern as CoursePathPage.spec.tsx).
const { lesson, rewards, getLesson, completeLesson } = vi.hoisted(() => ({
  lesson: {
    id: 'l1', title: 'Lección 1', position: 1,
    exercises: [
      { id: 'e1', type: 'match-pairs', pairs: [{ left: 'water', right: 'agua' }] },
      { id: 'e2', type: 'image-select', prompt: 'leche',
        options: [ { label: 'milk', imageUrl: null, correct: true }, { label: 'tea', imageUrl: null, correct: false } ] }
    ]
  } satisfies Lesson,
  rewards: { xpEarned: 15, totalXp: 15, level: 1, streakCount: 1, freezeUsed: false, hearts: 5 },
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
    completeLesson.mockReset().mockResolvedValue(rewards);
    useSessionStore.getState().reset();
  });

  it('recorre la lección completa y registra el progreso', async () => {
    renderWithProviders(<LessonPlayerPage />, { route: '/lesson/l1?lang=en', path: '/lesson/:lessonId' });

    // Ejercicio 1: parejas
    expect(await screen.findByText('Ejercicio 1 de 2')).toBeInTheDocument();
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
    expect(completeLesson).toHaveBeenCalledWith('l1', {
      errorCount: 0,
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
    });
    expect(completeLesson).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('+15 XP')).toBeInTheDocument();
    expect(screen.getByText(/Racha: 1/)).toBeInTheDocument();
  });

  it('muestra un estado vacío si la lección no tiene ejercicios', async () => {
    getLesson.mockResolvedValue({ id: 'l9', title: 'Lección vacía', position: 9, exercises: [] } satisfies Lesson);

    renderWithProviders(<LessonPlayerPage />, { route: '/lesson/l9?lang=en', path: '/lesson/:lessonId' });

    expect(await screen.findByText('Esta lección no tiene ejercicios.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver al curso' })).toBeInTheDocument();
    expect(completeLesson).not.toHaveBeenCalled();
  });

  it('no arrastra el estado de la lección anterior al abrir una lección nueva', async () => {
    // Regresión: el store de sesión es un singleton global de zustand. Sin un
    // reset explícito al desmontar la página y sin una comprobación de que el
    // estado 'finished' pertenece a la lección actual, abrir la lección B justo
    // después de terminar la lección A completaba B en el servidor sin que el
    // usuario respondiera nada, y mostraba fugazmente la pantalla final de A.
    // Deliberadamente NO se llama a useSessionStore.getState().reset() entre
    // los dos montajes: eso es justo lo que enmascaraba el bug.
    const lessonB = {
      id: 'l2',
      title: 'Lección 2',
      position: 2,
      exercises: [{ id: 'e3', type: 'match-pairs', pairs: [{ left: 'sun', right: 'sol' }] }]
    } satisfies Lesson;

    getLesson.mockImplementation((id: unknown) => Promise.resolve(id === 'l2' ? lessonB : lesson));

    const first = renderWithProviders(<LessonPlayerPage />, { route: '/lesson/l1?lang=en', path: '/lesson/:lessonId' });

    // Termina la lección A por completo.
    await userEvent.click(await screen.findByRole('button', { name: 'water' }));
    await userEvent.click(screen.getByRole('button', { name: 'agua' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await userEvent.click(screen.getByRole('button', { name: /milk/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('¡Lección completada!')).toBeInTheDocument();
    expect(completeLesson).toHaveBeenCalledWith('l1', expect.anything());

    completeLesson.mockClear();
    first.unmount();

    // Navega (nuevo montaje) a una lección distinta.
    renderWithProviders(<LessonPlayerPage />, { route: '/lesson/l2?lang=en', path: '/lesson/:lessonId' });

    expect(await screen.findByRole('button', { name: 'sun' })).toBeInTheDocument();
    expect(screen.queryByText('¡Lección completada!')).not.toBeInTheDocument();
    expect(completeLesson).not.toHaveBeenCalledWith('l2', expect.anything());
  });

  it('muestra un error y permite reintentar si falla el guardado del progreso', async () => {
    completeLesson.mockReset().mockRejectedValueOnce(new Error('network'));

    renderWithProviders(<LessonPlayerPage />, { route: '/lesson/l1?lang=en', path: '/lesson/:lessonId' });

    await userEvent.click(await screen.findByRole('button', { name: 'water' }));
    await userEvent.click(screen.getByRole('button', { name: 'agua' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await userEvent.click(screen.getByRole('button', { name: /milk/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByText('¡Lección completada!')).toBeInTheDocument();
    expect(await screen.findByText('No pudimos guardar tu progreso.')).toBeInTheDocument();
    expect(completeLesson).toHaveBeenCalledTimes(1);

    // Regresión: el botón "Reintentar" no se deshabilitaba mientras la mutación
    // de reintento estaba en curso, así que un doble clic rápido disparaba dos
    // POST (el upsert del servidor es idempotente, pero es un comportamiento de
    // cliente descuidado). Se controla manualmente cuándo resuelve la promesa
    // para poder observar el estado "en curso" del botón antes de que termine.
    let resolveRetry!: () => void;
    completeLesson.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveRetry = resolve; })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeDisabled();
    });

    resolveRetry();

    await waitFor(() => {
      expect(screen.queryByText('No pudimos guardar tu progreso.')).not.toBeInTheDocument();
    });
    expect(completeLesson).toHaveBeenCalledTimes(2);
  });
});
