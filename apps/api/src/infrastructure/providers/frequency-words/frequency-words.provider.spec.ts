import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FrequencyWordsVocabularyProvider } from './frequency-words.provider';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE = 'https://freq.test';
const SW_BASE = 'https://sw.test';
const FILE = ['the 100', 'of 90', 'x1 80', 'water 70', 'milk 60', 'a 50', 'bread 40']
  .join('\n');

describe('FrequencyWordsVocabularyProvider', () => {
  it('descarga, filtra stopwords y tokens no alfabéticos, respeta banda y límite', async () => {
    let downloads = 0;
    server.use(
      http.get(`${BASE}/en/en_50k.txt`, () => {
        downloads++;
        return HttpResponse.text(FILE);
      }),
      http.get(`${SW_BASE}/stopwords-en/master/stopwords-en.txt`, () => HttpResponse.text('the\nof\na'))
    );
    const provider = new FrequencyWordsVocabularyProvider(BASE, SW_BASE);
    // stopwords eliminan 'the' y 'of'; el filtro alfabético elimina 'x1' y 'a'
    const words = await provider.topWords('en', { start: 1, end: 4 }, 3);
    expect(words).toEqual(['water', 'milk', 'bread']);

    await provider.topWords('en', { start: 1, end: 4 }, 3);
    expect(downloads).toBe(1);
  });

  it('descarta tokens no puramente alfabéticos como \'s, don\'t y números', async () => {
    const fileWithJunk = [
      "'s 95",
      "don't 92",
      '123 91',
      'the 100',
      'of 90',
      'water 70',
      'milk 60',
      'a 50',
      'bread 40'
    ].join('\n');
    server.use(
      http.get(`${BASE}/en/en_50k.txt`, () => HttpResponse.text(fileWithJunk)),
      http.get(`${SW_BASE}/stopwords-en/master/stopwords-en.txt`, () => HttpResponse.text('the\nof\na'))
    );
    const provider = new FrequencyWordsVocabularyProvider(BASE, SW_BASE);
    const words = await provider.topWords('en', { start: 1, end: 9 }, 9);
    expect(words).toEqual(['water', 'milk', 'bread']);
  });

  it('si las stopwords no se pueden descargar, continúa sin filtro', async () => {
    server.use(
      http.get(`${BASE}/en/en_50k.txt`, () => HttpResponse.text(FILE)),
      http.get(`${SW_BASE}/stopwords-en/master/stopwords-en.txt`, () => new HttpResponse(null, { status: 404 }))
    );
    const provider = new FrequencyWordsVocabularyProvider(BASE, SW_BASE);
    const words = await provider.topWords('en', { start: 1, end: 4 }, 3);
    expect(words).toEqual(['the', 'of', 'water']);
  });

  it('lanza si el dataset no se puede descargar', async () => {
    server.use(http.get(`${BASE}/it/it_50k.txt`, () => new HttpResponse(null, { status: 404 })));
    const provider = new FrequencyWordsVocabularyProvider(BASE);
    await expect(provider.topWords('it', { start: 1, end: 10 }, 5)).rejects.toThrow(
      /vocabulario/i
    );
  });
});
