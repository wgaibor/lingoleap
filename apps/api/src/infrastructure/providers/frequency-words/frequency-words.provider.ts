import type { FrequencyBand, LearningLanguage } from '@lingoleap/core';
import type { VocabularyProvider } from '../../../application/ports/vocabulary-provider.port';
import { fetchText } from '../../http/fetch-json';

const FILE_PATH: Record<LearningLanguage, string> = {
  en: 'en/en_50k.txt',
  'pt-BR': 'pt_br/pt_br_50k.txt',
  it: 'it/it_50k.txt'
};

const STOPWORDS_PATH: Record<LearningLanguage, string> = {
  en: 'stopwords-en/master/stopwords-en.txt',
  'pt-BR': 'stopwords-pt/master/stopwords-pt.txt',
  it: 'stopwords-it/master/stopwords-it.txt'
};

const WORD_PATTERN = /^[a-záéíóúàèìòùâêôãõçñüæœ']{2,}$/i;

export class FrequencyWordsVocabularyProvider implements VocabularyProvider {
  private readonly cache = new Map<LearningLanguage, string[]>();
  private readonly stopwordsCache = new Map<LearningLanguage, Set<string>>();

  constructor(
    private readonly baseUrl = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018',
    private readonly stopwordsBaseUrl = 'https://raw.githubusercontent.com/stopwords-iso'
  ) {}

  async topWords(
    language: LearningLanguage,
    band: FrequencyBand,
    limit: number
  ): Promise<string[]> {
    const all = await this.wordList(language);
    const sw = await this.stopwords(language);
    const filtered = all.filter((w) => !sw.has(w));
    return filtered.slice(band.start - 1, band.end).slice(0, limit);
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

  private async stopwords(language: LearningLanguage): Promise<Set<string>> {
    const cached = this.stopwordsCache.get(language);
    if (cached) return cached;
    const text = await fetchText(`${this.stopwordsBaseUrl}/${STOPWORDS_PATH[language]}`);
    if (text === null) {
      console.warn(`No se pudieron descargar stopwords para ${language}; se continúa sin filtro`);
      const empty = new Set<string>();
      this.stopwordsCache.set(language, empty);
      return empty;
    }
    const set = new Set(text.split('\n').map((l) => l.trim().toLowerCase()).filter((w) => w.length > 0));
    this.stopwordsCache.set(language, set);
    return set;
  }
}
