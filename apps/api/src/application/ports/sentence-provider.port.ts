import type { LearningLanguage } from '@lingoleap/core';

export interface ExampleSentence {
  text: string;
  translationEs: string;
  audioUrl: string | null;
}

export interface SentenceProvider {
  findExampleSentence(word: string, language: LearningLanguage): Promise<ExampleSentence | null>;
}

export const SENTENCE_PROVIDER = Symbol('SentenceProvider');
