import type { FrequencyBand, LearningLanguage } from '@lingoleap/core';

export interface VocabularyProvider {
  topWords(language: LearningLanguage, band: FrequencyBand, limit: number): Promise<string[]>;
}

export const VOCABULARY_PROVIDER = Symbol('VocabularyProvider');
