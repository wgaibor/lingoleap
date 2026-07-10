import { describe, expect, it } from 'vitest';
import type { Exercise } from '@lingoleap/core';
import { createCourse, createLesson, createUnit } from './content.factory';
import { InvalidContentError } from './errors';

const exercise: Exercise = {
  id: 'e1',
  type: 'match-pairs',
  pairs: [{ left: 'water', right: 'agua' }]
};

describe('factorías de contenido', () => {
  it('crea una lección válida con id generado', () => {
    const lesson = createLesson({ title: 'Lección 1', position: 1, exercises: [exercise] });
    expect(lesson.id).toMatch(/[0-9a-f-]{36}/);
    expect(lesson.exercises).toHaveLength(1);
  });

  it('rechaza lección sin ejercicios', () => {
    expect(() => createLesson({ title: 'Vacía', position: 1, exercises: [] })).toThrow(
      InvalidContentError
    );
  });

  it('crea un curso con título autogenerado en español', () => {
    const lesson = createLesson({ title: 'Lección 1', position: 1, exercises: [exercise] });
    const unit = createUnit({ title: 'Unidad 1', position: 1, lessons: [lesson] });
    const course = createCourse({ language: 'en', level: 'A1', units: [unit] });
    expect(course.title).toBe('Inglés A1');
  });

  it('rechaza unidad sin lecciones y curso sin unidades', () => {
    expect(() => createUnit({ title: 'U', position: 1, lessons: [] })).toThrow(InvalidContentError);
    expect(() => createCourse({ language: 'en', level: 'A1', units: [] })).toThrow(
      InvalidContentError
    );
  });
});
