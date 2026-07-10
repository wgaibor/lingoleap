import { describe, expect, it } from 'vitest';
import type { ImageSelectExercise, TranslateExercise } from '@lingoleap/core';
import {
  chunkIntoLessons,
  composeMatchPairs,
  composeWordExercises,
  groupIntoUnits,
  shuffle,
  tokenize,
  type Random,
  type WordMaterial
} from './exercise-composer';

function seeded(seed = 42): Random {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function material(word: string, translationEs: string, imageUrl: string | null): WordMaterial {
  return {
    word,
    translationEs,
    sentence: {
      text: `I drink ${word} every day.`,
      translationEs: `Yo bebo ${translationEs} cada día.`,
      audioUrl: null
    },
    imageUrl
  };
}

const withImages = [
  material('water', 'agua', 'https://img/water.jpg'),
  material('milk', 'leche', 'https://img/milk.jpg'),
  material('coffee', 'café', 'https://img/coffee.jpg'),
  material('tea', 'té', 'https://img/tea.jpg')
];

describe('tokenize', () => {
  it('separa palabras y quita puntuación', () => {
    expect(tokenize('Yo bebo agua, ¿cada día!')).toEqual(['Yo', 'bebo', 'agua', 'cada', 'día']);
  });
});

describe('shuffle', () => {
  it('devuelve una permutación sin mutar el original', () => {
    const original = [1, 2, 3, 4, 5];
    const result = shuffle(original, seeded());
    expect(result).not.toBe(original);
    expect([...result].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('composeWordExercises', () => {
  it('genera translate, listening e image-select cuando hay imágenes', () => {
    const [target, ...distractors] = withImages;
    const exercises = composeWordExercises(target, distractors, seeded());
    const types = exercises.map((e) => e.type).sort();
    expect(types).toEqual(['image-select', 'listening', 'translate']);

    const translate = exercises.find((e) => e.type === 'translate') as TranslateExercise;
    expect(translate.correctAnswer).toBe('Yo bebo agua cada día.');
    for (const token of tokenize(translate.correctAnswer)) {
      expect(translate.wordBank).toContain(token);
    }

    const imageSelect = exercises.find((e) => e.type === 'image-select') as ImageSelectExercise;
    expect(imageSelect.prompt).toBe('agua');
    expect(imageSelect.options).toHaveLength(4);
    expect(imageSelect.options.filter((o) => o.correct)).toHaveLength(1);
  });

  it('omite image-select si el material no tiene imagen', () => {
    const target = material('idea', 'idea', null);
    const exercises = composeWordExercises(target, withImages, seeded());
    expect(exercises.map((e) => e.type).sort()).toEqual(['listening', 'translate']);
  });
});

describe('composeMatchPairs', () => {
  it('agrupa de 5 en 5 y descarta restos menores a 3', () => {
    const materials = Array.from({ length: 12 }, (_, i) => material(`w${i}`, `t${i}`, null));
    const result = composeMatchPairs(materials, seeded());
    expect(result).toHaveLength(2);
    expect(result[0].pairs).toHaveLength(5);
  });
});

describe('chunkIntoLessons y groupIntoUnits', () => {
  it('parte 23 ejercicios en 3 lecciones y las agrupa en 1 unidad', () => {
    const materials = withImages;
    const exercises = materials.flatMap((m) =>
      composeWordExercises(m, materials.filter((x) => x !== m), seeded())
    );
    const many = [...exercises, ...exercises].slice(0, 23);
    const lessons = chunkIntoLessons(many);
    expect(lessons).toHaveLength(3);
    expect(lessons[0].title).toBe('Lección 1');
    expect(lessons[0].exercises).toHaveLength(10);

    const units = groupIntoUnits(lessons);
    expect(units).toHaveLength(1);
    expect(units[0].title).toBe('Unidad 1');
  });
});
