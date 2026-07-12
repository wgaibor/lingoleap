import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Course } from '@lingoleap/core';

// vi.mock is hoisted above module-level const declarations, so the fixture
// must be created via vi.hoisted() to avoid a temporal-dead-zone error when
// the mock factory reads it.
const { course } = vi.hoisted(() => ({
  course: {
    id: 'c1', language: 'en', level: 'A1', title: 'Inglés A1',
    units: [{ id: 'u1', title: 'Unidad 1', position: 1, lessons: [
      { id: 'l1', title: 'Lección 1', position: 1, exercises: [] },
      { id: 'l2', title: 'Lección 2', position: 2, exercises: [] }
    ] }]
  } satisfies Course
}));

vi.mock('../../app/api', () => ({
  api: {
    getCourse: vi.fn().mockResolvedValue(course),
    getCompletedLessonIds: vi.fn().mockResolvedValue(['l1'])
  }
}));

import { CoursePathPage } from './CoursePathPage';
import { renderWithProviders } from '../../test/render';

describe('CoursePathPage', () => {
  it('muestra completadas, desbloqueadas y bloqueadas según el progreso', async () => {
    renderWithProviders(<CoursePathPage />, { route: '/course/en/A1', path: '/course/:language/:level' });
    expect(await screen.findByText('Unidad 1')).toBeInTheDocument();

    const l1 = screen.getByTestId('lesson-l1');
    const l2 = screen.getByTestId('lesson-l2');
    expect(l1).toHaveAttribute('data-status', 'completed');
    expect(l2).toHaveAttribute('data-status', 'unlocked');
    expect(screen.getByRole('link', { name: /Lección 2/ })).toHaveAttribute('href', '/lesson/l2?lang=en');
  });

  it('muestra el resumen de progreso del curso con porcentaje redondeado', async () => {
    renderWithProviders(<CoursePathPage />, { route: '/course/en/A1', path: '/course/:language/:level' });

    expect(await screen.findByText('1 de 2 lecciones completadas · 50%')).toBeInTheDocument();
  });
});
