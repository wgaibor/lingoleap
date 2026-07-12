import { useCallback } from 'react';
import type { LearningLanguage } from '@lingoleap/core';

const BCP47: Record<LearningLanguage, string> = { en: 'en-US', 'pt-BR': 'pt-BR', it: 'it-IT' };

export function useSpeech(language: LearningLanguage): { speak: (text: string) => void; supported: boolean } {
  const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : undefined;
  const supported = synth !== undefined;

  const speak = useCallback(
    (text: string) => {
      if (!synth) return;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = BCP47[language];
      utterance.rate = 0.95;
      synth.speak(utterance);
    },
    [synth, language]
  );

  return { speak, supported };
}
