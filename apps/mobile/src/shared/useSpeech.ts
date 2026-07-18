import { useCallback } from 'react';
import * as Speech from 'expo-speech';
import type { LearningLanguage } from '@lingoleap/core';

// Mismo mapeo que apps/web/src/shared/useSpeech.ts (mantener en sincronía).
const BCP47: Record<LearningLanguage, string> = { en: 'en-US', 'pt-BR': 'pt-BR', it: 'it-IT' };

export function useSpeech(language: LearningLanguage): { speak: (text: string) => void; supported: boolean } {
  const speak = useCallback(
    (text: string) => {
      Speech.stop();
      Speech.speak(text, { language: BCP47[language], rate: 0.95 });
    },
    [language]
  );
  return { speak, supported: true };
}
