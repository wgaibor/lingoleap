export type LearningLanguage = 'en' | 'pt-BR' | 'it';
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export const LEARNING_LANGUAGES: readonly LearningLanguage[] = ['en', 'pt-BR', 'it'];
export const CEFR_LEVELS: readonly CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export const LANGUAGE_LABEL_ES: Record<LearningLanguage, string> = {
  en: 'Inglés',
  'pt-BR': 'Portugués (Brasil)',
  it: 'Italiano'
};
