import type { LearningLanguage } from '@lingoleap/core';
import type { TranslationProvider } from '../../../application/ports/translation-provider.port';
import { fetchJson } from '../../http/fetch-json';

interface MyMemoryResponse {
  responseStatus?: number;
  responseData?: { translatedText?: string };
}

const SOURCE_LANG: Record<LearningLanguage, string> = {
  en: 'en',
  'pt-BR': 'pt-BR',
  it: 'it'
};

export class MyMemoryTranslationProvider implements TranslationProvider {
  constructor(private readonly baseUrl = 'https://api.mymemory.translated.net') {}

  async translateToSpanish(word: string, language: LearningLanguage): Promise<string | null> {
    const params = new URLSearchParams({
      q: word,
      langpair: `${SOURCE_LANG[language]}|es`
    });
    const body = (await fetchJson(`${this.baseUrl}/get?${params.toString()}`)) as
      | MyMemoryResponse
      | null;

    if (body?.responseStatus !== 200) {
      return null;
    }
    const translated = body.responseData?.translatedText?.trim().toLowerCase() ?? '';
    if (translated.length === 0 || translated === word.toLowerCase()) {
      return null;
    }
    return translated;
  }
}
