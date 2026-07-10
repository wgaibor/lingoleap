import type { CEFRLevel, LearningLanguage } from './types';

export interface ImageOption {
  label: string;
  imageUrl: string | null;
  correct: boolean;
}

export interface ImageSelectExercise {
  id: string;
  type: 'image-select';
  /** Palabra en español que el usuario debe identificar */
  prompt: string;
  options: ImageOption[];
}

export interface TranslateExercise {
  id: string;
  type: 'translate';
  /** Oración en el idioma que se aprende */
  sourceText: string;
  /** Traducción correcta al español */
  correctAnswer: string;
  /** Fichas desordenadas: tokens de la respuesta + distractores en español */
  wordBank: string[];
  /** Audio nativo de Tatoeba; null => el cliente usa TTS sobre sourceText */
  audioUrl: string | null;
}

export interface ListeningExercise {
  id: string;
  type: 'listening';
  /** Texto que suena (en el idioma que se aprende) */
  text: string;
  audioUrl: string | null;
  /** Tokens del texto + distractores en el idioma que se aprende */
  wordBank: string[];
}

export interface MatchPairsExercise {
  id: string;
  type: 'match-pairs';
  /** left: palabra en el idioma que se aprende; right: traducción al español */
  pairs: { left: string; right: string }[];
}

export type Exercise =
  | ImageSelectExercise
  | TranslateExercise
  | ListeningExercise
  | MatchPairsExercise;

export interface Lesson {
  id: string;
  title: string;
  position: number;
  exercises: Exercise[];
}

export interface Unit {
  id: string;
  title: string;
  position: number;
  lessons: Lesson[];
}

export interface CourseSummary {
  id: string;
  language: LearningLanguage;
  level: CEFRLevel;
  title: string;
}

export interface Course extends CourseSummary {
  units: Unit[];
}
