import { describe, expect, it } from 'vitest';
import type { LessonStatus } from '@lingoleap/core';
import { summarizeCourseProgress } from './courseProgress';

describe('summarizeCourseProgress', () => {
  it('cuenta lecciones completadas sobre el total y calcula el porcentaje redondeado', () => {
    const status: Record<string, LessonStatus> = {
      l1: 'completed',
      l2: 'unlocked'
    };

    expect(summarizeCourseProgress(status)).toEqual({ completed: 1, total: 2, percent: 50 });
  });

  it('redondea el porcentaje al entero más cercano', () => {
    const status: Record<string, LessonStatus> = {
      l1: 'completed',
      l2: 'locked',
      l3: 'locked'
    };

    expect(summarizeCourseProgress(status)).toEqual({ completed: 1, total: 3, percent: 33 });
  });

  it('devuelve 0% sin dividir por cero cuando no hay lecciones', () => {
    expect(summarizeCourseProgress({})).toEqual({ completed: 0, total: 0, percent: 0 });
  });
});
