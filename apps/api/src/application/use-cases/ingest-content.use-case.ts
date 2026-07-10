import type { CEFRLevel, LearningLanguage } from '@lingoleap/core';
import { frequencyBandFor } from '@lingoleap/core';
import { createCourse } from '../../domain/content.factory';
import { InvalidContentError } from '../../domain/errors';
import {
  chunkIntoLessons,
  composeMatchPairs,
  composeWordExercises,
  groupIntoUnits,
  type Random,
  type WordMaterial
} from '../content/exercise-composer';
import type { CourseRepository } from '../ports/course.repository';
import type { ImageProvider } from '../ports/image-provider.port';
import type { SentenceProvider } from '../ports/sentence-provider.port';
import type { TranslationProvider } from '../ports/translation-provider.port';
import type { VocabularyProvider } from '../ports/vocabulary-provider.port';

export interface IngestCommand {
  language: LearningLanguage;
  level: CEFRLevel;
  wordLimit?: number;
}

export interface IngestReport {
  language: LearningLanguage;
  level: CEFRLevel;
  wordsRequested: number;
  materialsBuilt: number;
  skippedWords: string[];
  exerciseCount: number;
  lessonCount: number;
  unitCount: number;
}

export interface IngestDependencies {
  vocabulary: VocabularyProvider;
  translations: TranslationProvider;
  sentences: SentenceProvider;
  images: ImageProvider;
  courses: CourseRepository;
  random?: Random;
}

const DEFAULT_WORD_LIMIT = 40;

export class IngestContentUseCase {
  constructor(private readonly deps: IngestDependencies) {}

  async execute(command: IngestCommand): Promise<IngestReport> {
    const { language, level } = command;
    const wordLimit = command.wordLimit ?? DEFAULT_WORD_LIMIT;
    const random = this.deps.random ?? Math.random;

    const band = frequencyBandFor(level);
    const words = await this.deps.vocabulary.topWords(language, band, wordLimit);

    const materials: WordMaterial[] = [];
    const skippedWords: string[] = [];

    for (const word of words) {
      const translationEs = await this.deps.translations.translateToSpanish(word, language);
      if (translationEs === null) {
        skippedWords.push(word);
        continue;
      }
      const sentence = await this.deps.sentences.findExampleSentence(word, language);
      if (sentence === null) {
        skippedWords.push(word);
        continue;
      }
      const imageUrl = await this.deps.images.findImageUrl(word);
      materials.push({ word, translationEs, sentence, imageUrl });
    }

    if (materials.length === 0) {
      throw new InvalidContentError(
        `No se pudo construir contenido para ${language} ${level}: todas las palabras fueron saltadas`
      );
    }

    const exercises = [
      ...materials.flatMap((material) =>
        composeWordExercises(
          material,
          materials.filter((other) => other !== material),
          random
        )
      ),
      ...composeMatchPairs(materials, random)
    ];

    const lessons = chunkIntoLessons(exercises);
    const units = groupIntoUnits(lessons);
    const course = createCourse({ language, level, units });
    await this.deps.courses.saveCourse(course);

    return {
      language,
      level,
      wordsRequested: words.length,
      materialsBuilt: materials.length,
      skippedWords,
      exerciseCount: exercises.length,
      lessonCount: lessons.length,
      unitCount: units.length
    };
  }
}
