import { randomUUID } from 'node:crypto';
import type { CEFRLevel, Course, Exercise, LearningLanguage, Lesson, Unit } from '@lingoleap/core';
import { LANGUAGE_LABEL_ES } from '@lingoleap/core';
import { InvalidContentError } from './errors';

export function createLesson(input: {
  title: string;
  position: number;
  exercises: Exercise[];
}): Lesson {
  if (input.exercises.length === 0) {
    throw new InvalidContentError(`La lección "${input.title}" no tiene ejercicios`);
  }
  return { id: randomUUID(), ...input };
}

export function createUnit(input: { title: string; position: number; lessons: Lesson[] }): Unit {
  if (input.lessons.length === 0) {
    throw new InvalidContentError(`La unidad "${input.title}" no tiene lecciones`);
  }
  return { id: randomUUID(), ...input };
}

export function createCourse(input: {
  language: LearningLanguage;
  level: CEFRLevel;
  units: Unit[];
}): Course {
  if (input.units.length === 0) {
    throw new InvalidContentError('El curso no tiene unidades');
  }
  return {
    id: randomUUID(),
    language: input.language,
    level: input.level,
    title: `${LANGUAGE_LABEL_ES[input.language]} ${input.level}`,
    units: input.units
  };
}
