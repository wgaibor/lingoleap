import type { FrequencyBand, LearningLanguage } from '@lingoleap/core';
import type { VocabularyProvider } from '../../../application/ports/vocabulary-provider.port';
import { fetchText } from '../../http/fetch-json';

const FILE_PATH: Record<LearningLanguage, string> = {
  en: 'en/en_50k.txt',
  'pt-BR': 'pt_br/pt_br_50k.txt',
  it: 'it/it_50k.txt'
};

const WORD_PATTERN = /^[a-záéíóúàèìòùâêôãõçñüæœ']{2,}$/i;

export class FrequencyWordsVocabularyProvider implements VocabularyProvider {
  private readonly cache = new Map<LearningLanguage, string[]>();

  constructor(
    private readonly baseUrl = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018'
  ) {}

  async topWords(
    language: LearningLanguage,
    band: FrequencyBand,
    limit: number
  ): Promise<string[]> {
    const all = await this.wordList(language);
    return all.slice(band.start - 1, band.end).slice(0, limit);
  }

  private async wordList(language: LearningLanguage): Promise<string[]> {
    const cached = this.cache.get(language);
    if (cached) {
      return cached;
    }
    const text = await fetchText(`${this.baseUrl}/${FILE_PATH[language]}`);
    if (text === null) {
      throw new Error(`No se pudo descargar la lista de vocabulario para ${language}`);
    }
    const words = text
      .split('\n')
      .map((line) => line.split(' ')[0]?.trim().toLowerCase() ?? '')
      .filter((word) => WORD_PATTERN.test(word));
    this.cache.set(language, words);
    return words;
  }
}
