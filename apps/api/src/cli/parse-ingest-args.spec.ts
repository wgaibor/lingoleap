import { describe, expect, it } from 'vitest';
import { parseIngestArgs } from './parse-ingest-args';

describe('parseIngestArgs', () => {
  it('parsea lang, level y limit', () => {
    expect(parseIngestArgs(['--lang', 'en', '--level', 'A1', '--limit', '15'])).toEqual({
      language: 'en',
      level: 'A1',
      wordLimit: 15
    });
  });

  it('limit es opcional', () => {
    expect(parseIngestArgs(['--lang', 'pt-BR', '--level', 'B1'])).toEqual({
      language: 'pt-BR',
      level: 'B1',
      wordLimit: undefined
    });
  });

  it('rechaza idioma o nivel inválido', () => {
    expect(() => parseIngestArgs(['--lang', 'fr', '--level', 'A1'])).toThrow(/uso/i);
    expect(() => parseIngestArgs(['--lang', 'en', '--level', 'Z9'])).toThrow(/uso/i);
  });
});
