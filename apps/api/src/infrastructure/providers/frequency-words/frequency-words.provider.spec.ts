import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FrequencyWordsVocabularyProvider } from './frequency-words.provider';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE = 'https://freq.test';
const FILE = ['the 100', 'of 90', 'x1 80', 'water 70', 'milk 60', 'a 50', 'bread 40']
  .join('\n');

describe('FrequencyWordsVocabularyProvider', () => {
  it('descarga, filtra tokens no alfabéticos y respeta banda y límite', async () => {
    let downloads = 0;
    server.use(
      http.get(`${BASE}/en/en_50k.txt`, () => {
        downloads++;
        return HttpResponse.text(FILE);
      })
    );
    const provider = new FrequencyWordsVocabularyProvider(BASE);
    // El filtro elimina 'x1' y 'a' (token de 1 letra queda excluido por el {2,})
    const words = await provider.topWords('en', { start: 1, end: 4 }, 3);
    expect(words).toEqual(['the', 'of', 'water']);

    // segunda llamada usa caché
    await provider.topWords('en', { start: 1, end: 4 }, 3);
    expect(downloads).toBe(1);
  });

  it('lanza si el dataset no se puede descargar', async () => {
    server.use(http.get(`${BASE}/it/it_50k.txt`, () => new HttpResponse(null, { status: 404 })));
    const provider = new FrequencyWordsVocabularyProvider(BASE);
    await expect(provider.topWords('it', { start: 1, end: 10 }, 5)).rejects.toThrow(
      /vocabulario/i
    );
  });
});
