import type { LearningLanguage } from '@lingoleap/core';

export interface TranslationProvider {
  translateToSpanish(word: string, language: LearningLanguage): Promise<string | null>;
}

export const TRANSLATION_PROVIDER = Symbol('TranslationProvider');
