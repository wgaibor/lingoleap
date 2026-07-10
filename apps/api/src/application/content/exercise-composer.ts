import { randomUUID } from 'node:crypto';
import type { Exercise, Lesson, MatchPairsExercise, Unit } from '@lingoleap/core';
import { createLesson, createUnit } from '../../domain/content.factory';

export type Random = () => number;

export interface WordMaterial {
  word: string;
  translationEs: string;
  sentence: { text: string; translationEs: string; audioUrl: string | null };
  imageUrl: string | null;
}

export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function tokenize(sentence: string): string[] {
  return sentence
    .split(/\s+/)
    .map((token) => token.replace(/[.,;:!?¿¡"()]/g, ''))
    .filter((token) => token.length > 0);
}

function distractorTokens(
  correct: string[],
  candidates: string[],
  limit: number,
  random: Random
): string[] {
  const correctSet = new Set(correct.map((t) => t.toLowerCase()));
  const unique = [...new Set(candidates.filter((t) => !correctSet.has(t.toLowerCase())))];
  return shuffle(unique, random).slice(0, limit);
}

export function composeWordExercises(
  material: WordMaterial,
  distractors: WordMaterial[],
  random: Random
): Exercise[] {
  const exercises: Exercise[] = [];
  const { sentence } = material;

  const answerTokens = tokenize(sentence.translationEs);
  exercises.push({
    id: randomUUID(),
    type: 'translate',
    sourceText: sentence.text,
    correctAnswer: sentence.translationEs,
    wordBank: shuffle(
      [
        ...answerTokens,
        ...distractorTokens(
          answerTokens,
          distractors.flatMap((d) => tokenize(d.sentence.translationEs)),
          4,
          random
        )
      ],
      random
    ),
    audioUrl: sentence.audioUrl
  });

  const textTokens = tokenize(sentence.text);
  exercises.push({
    id: randomUUID(),
    type: 'listening',
    text: sentence.text,
    audioUrl: sentence.audioUrl,
    wordBank: shuffle(
      [
        ...textTokens,
        ...distractorTokens(
          textTokens,
          distractors.flatMap((d) => tokenize(d.sentence.text)),
          4,
          random
        )
      ],
      random
    )
  });

  const imageDistractors = distractors.filter((d) => d.imageUrl !== null);
  if (material.imageUrl !== null && imageDistractors.length >= 3) {
    const options = shuffle(
      [
        { label: material.word, imageUrl: material.imageUrl, correct: true },
        ...shuffle(imageDistractors, random)
          .slice(0, 3)
          .map((d) => ({ label: d.word, imageUrl: d.imageUrl, correct: false }))
      ],
      random
    );
    exercises.push({
      id: randomUUID(),
      type: 'image-select',
      prompt: material.translationEs,
      options
    });
  }

  return exercises;
}

export function composeMatchPairs(
  materials: WordMaterial[],
  random: Random
): MatchPairsExercise[] {
  const result: MatchPairsExercise[] = [];
  for (let i = 0; i < materials.length; i += 5) {
    const group = materials.slice(i, i + 5);
    if (group.length < 3) {
      continue;
    }
    result.push({
      id: randomUUID(),
      type: 'match-pairs',
      pairs: shuffle(group, random).map((m) => ({ left: m.word, right: m.translationEs }))
    });
  }
  return result;
}

export function chunkIntoLessons(exercises: Exercise[], perLesson = 10): Lesson[] {
  const lessons: Lesson[] = [];
  for (let i = 0; i < exercises.length; i += perLesson) {
    const slice = exercises.slice(i, i + perLesson);
    lessons.push(
      createLesson({
        title: `Lección ${lessons.length + 1}`,
        position: lessons.length + 1,
        exercises: slice
      })
    );
  }
  return lessons;
}

export function groupIntoUnits(lessons: Lesson[], perUnit = 5): Unit[] {
  const units: Unit[] = [];
  for (let i = 0; i < lessons.length; i += perUnit) {
    units.push(
      createUnit({
        title: `Unidad ${units.length + 1}`,
        position: units.length + 1,
        lessons: lessons.slice(i, i + perUnit)
      })
    );
  }
  return units;
}
