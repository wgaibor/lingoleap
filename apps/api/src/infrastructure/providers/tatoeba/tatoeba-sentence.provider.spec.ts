import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TatoebaSentenceProvider } from './tatoeba-sentence.provider';
import fixture from './tatoeba-fixture.json';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE = 'https://tatoeba.test';

describe('TatoebaSentenceProvider', () => {
  it('mapea la primera oración con traducción al español', async () => {
    server.use(
      http.get(`${BASE}/unstable/sentences`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('lang')).toBe('eng');
        expect(url.searchParams.get('q')).toBe('water');
        expect(url.searchParams.get('sort')).toBe('words');
        expect(url.searchParams.get('trans:lang')).toBe('spa');
        return HttpResponse.json(fixture);
      })
    );
    const provider = new TatoebaSentenceProvider(BASE);
    const sentence = await provider.findExampleSentence('water', 'en');
    expect(sentence).not.toBeNull();
    expect(sentence?.text.toLowerCase()).toContain('water');
    expect(sentence?.translationEs.length).toBeGreaterThan(0);
  });

  it('devuelve null si no hay resultados', async () => {
    server.use(
      http.get(`${BASE}/unstable/sentences`, () => HttpResponse.json({ data: [] }))
    );
    const provider = new TatoebaSentenceProvider(BASE);
    await expect(provider.findExampleSentence('zzzz', 'en')).resolves.toBeNull();
  });
});
