import { describe, expect, it } from 'vitest';
import type { Course } from '../exercises';
import { computePathStatus } from './path-status';

const course: Course = {
  id: 'c1', language: 'en', level: 'A1', title: 'Inglés A1',
  units: [
    { id: 'u1', title: 'Unidad 1', position: 1, lessons: [
      { id: 'l1', title: 'L1', position: 1, exercises: [] },
      { id: 'l2', title: 'L2', position: 2, exercises: [] }
    ] },
    { id: 'u2', title: 'Unidad 2', position: 2, lessons: [
      { id: 'l3', title: 'L3', position: 1, exercises: [] }
    ] }
  ]
};

describe('computePathStatus', () => {
  it('sin progreso: solo la primera está desbloqueada', () => {
    expect(computePathStatus(course, [])).toEqual({ l1: 'unlocked', l2: 'locked', l3: 'locked' });
  });
  it('con l1 completada: l2 desbloqueada, l3 bloqueada', () => {
    expect(computePathStatus(course, ['l1'])).toEqual({ l1: 'completed', l2: 'unlocked', l3: 'locked' });
  });
  it('todo completado', () => {
    expect(computePathStatus(course, ['l1', 'l2', 'l3'])).toEqual({ l1: 'completed', l2: 'completed', l3: 'completed' });
  });
});
