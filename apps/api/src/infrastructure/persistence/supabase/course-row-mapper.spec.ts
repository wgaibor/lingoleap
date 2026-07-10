import { describe, expect, it } from 'vitest';
import type { Course } from '@lingoleap/core';
import { courseToRows, rowsToCourse } from './course-row-mapper';

const course: Course = {
  id: 'c1',
  language: 'en',
  level: 'A1',
  title: 'Inglés A1',
  units: [
    {
      id: 'u1',
      title: 'Unidad 1',
      position: 1,
      lessons: [
        {
          id: 'l1',
          title: 'Lección 1',
          position: 1,
          exercises: [
            { id: 'e1', type: 'match-pairs', pairs: [{ left: 'water', right: 'agua' }] },
            {
              id: 'e2',
              type: 'translate',
              sourceText: 'I drink water.',
              correctAnswer: 'Yo bebo agua.',
              wordBank: ['Yo', 'bebo', 'agua'],
              audioUrl: null
            }
          ]
        }
      ]
    }
  ]
};

describe('mapeo curso <-> filas', () => {
  it('courseToRows aplana el agregado', () => {
    const rows = courseToRows(course);
    expect(rows.course).toEqual({ id: 'c1', language: 'en', level: 'A1', title: 'Inglés A1' });
    expect(rows.units).toHaveLength(1);
    expect(rows.lessons[0].unit_id).toBe('u1');
    expect(rows.exercises).toHaveLength(2);
    expect(rows.exercises[0].type).toBe('match-pairs');
    expect(rows.exercises[0].payload).toEqual({ pairs: [{ left: 'water', right: 'agua' }] });
  });

  it('roundtrip: rowsToCourse(courseToRows(x)) === x', () => {
    const rows = courseToRows(course);
    const nested = {
      ...rows.course,
      units: rows.units.map((u) => ({
        ...u,
        lessons: rows.lessons
          .filter((l) => l.unit_id === u.id)
          .map((l) => ({
            ...l,
            exercises: rows.exercises.filter((e) => e.lesson_id === l.id)
          }))
      }))
    };
    expect(rowsToCourse(nested)).toEqual(course);
  });
});
