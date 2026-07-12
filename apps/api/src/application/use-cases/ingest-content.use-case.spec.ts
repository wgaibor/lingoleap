import { describe, expect, it } from 'vitest';
import type { Course, CourseSummary, LearningLanguage, Lesson } from '@lingoleap/core';
import type { CourseRepository } from '../ports/course.repository';
import type { ExampleSentence } from '../ports/sentence-provider.port';
import { IngestContentUseCase } from './ingest-content.use-case';
import { InvalidContentError } from '../../domain/errors';

class FakeCourseRepository implements CourseRepository {
  saved: Course[] = [];
  async saveCourse(course: Course): Promise<void> {
    this.saved.push(course);
  }
  async findByLanguageAndLevel(): Promise<Course | null> {
    return null;
  }
  async listSummaries(): Promise<CourseSummary[]> {
    return [];
  }
  async findLessonById(): Promise<Lesson | null> {
    return null;
  }
}

const WORDS = ['water', 'milk', 'coffee', 'tea', 'bread', 'apple'];

function makeUseCase(overrides?: {
  translate?: (word: string) => Promise<string | null>;
  sentence?: (word: string) => Promise<ExampleSentence | null>;
}) {
  const repo = new FakeCourseRepository();
  const useCase = new IngestContentUseCase({
    vocabulary: {
      topWords: async (_l: LearningLanguage, _b, limit: number) => WORDS.slice(0, limit)
    },
    translations: {
      translateToSpanish: overrides?.translate ?? (async (word) => `es-${word}`)
    },
    sentences: {
      findExampleSentence:
        overrides?.sentence ??
        (async (word) => ({
          text: `I like ${word}.`,
          translationEs: `Me gusta es-${word}.`,
          audioUrl: null
        }))
    },
    images: { findImageUrl: async (term) => `https://img/${term}.jpg` },
    courses: repo,
    random: () => 0.42
  });
  return { useCase, repo };
}

describe('IngestContentUseCase', () => {
  it('ingesta un curso completo y devuelve el reporte', async () => {
    const { useCase, repo } = makeUseCase();
    const report = await useCase.execute({ language: 'en', level: 'A1', wordLimit: 6 });

    expect(report.wordsRequested).toBe(6);
    expect(report.materialsBuilt).toBe(6);
    expect(report.skippedWords).toEqual([]);
    expect(report.exerciseCount).toBeGreaterThan(6);
    expect(report.unitCount).toBeGreaterThanOrEqual(1);
    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0].title).toBe('Inglés A1');
  });

  it('salta palabras sin traducción o sin oración y sigue', async () => {
    const { useCase, repo } = makeUseCase({
      translate: async (word) => (word === 'milk' ? null : `es-${word}`),
      sentence: async (word) =>
        word === 'tea'
          ? null
          : { text: `I like ${word}.`, translationEs: `Me gusta es-${word}.`, audioUrl: null }
    });
    const report = await useCase.execute({ language: 'en', level: 'A1', wordLimit: 6 });
    expect(report.skippedWords.sort()).toEqual(['milk', 'tea']);
    expect(report.materialsBuilt).toBe(4);
    expect(repo.saved).toHaveLength(1);
  });

  it('salta la palabra si el provider lanza un error (ej. HTTP 500) y sigue con las demás', async () => {
    const { useCase, repo } = makeUseCase({
      sentence: async (word) => {
        if (word === 'coffee') {
          throw new Error('HTTP 500 en https://api.tatoeba.org/... tras 4 intentos');
        }
        return { text: `I like ${word}.`, translationEs: `Me gusta es-${word}.`, audioUrl: null };
      }
    });
    const report = await useCase.execute({ language: 'en', level: 'A1', wordLimit: 6 });
    expect(report.skippedWords).toEqual(['coffee']);
    expect(report.materialsBuilt).toBe(5);
    expect(repo.saved).toHaveLength(1);
  });

  it('lanza InvalidContentError si no se pudo construir ningún material', async () => {
    const { useCase } = makeUseCase({ translate: async () => null });
    await expect(useCase.execute({ language: 'en', level: 'A1', wordLimit: 6 })).rejects.toThrow(
      InvalidContentError
    );
  });
});
