import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MyMemoryTranslationProvider } from './mymemory-translation.provider';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE = 'https://mymemory.test';

function respond(translatedText: string, status = 200) {
  return HttpResponse.json({ responseStatus: status, responseData: { translatedText } });
}

describe('MyMemoryTranslationProvider', () => {
  it('traduce una palabra al español', async () => {
    server.use(
      http.get(`${BASE}/get`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('q')).toBe('water');
        expect(url.searchParams.get('langpair')).toBe('en|es');
        return respond('Agua ');
      })
    );
    const provider = new MyMemoryTranslationProvider(BASE);
    await expect(provider.translateToSpanish('water', 'en')).resolves.toBe('agua');
  });

  it('devuelve null si la "traducción" es la misma palabra', async () => {
    server.use(http.get(`${BASE}/get`, () => respond('WATER')));
    const provider = new MyMemoryTranslationProvider(BASE);
    await expect(provider.translateToSpanish('water', 'en')).resolves.toBeNull();
  });

  it('devuelve null si responseStatus no es 200', async () => {
    server.use(http.get(`${BASE}/get`, () => respond('agua', 403)));
    const provider = new MyMemoryTranslationProvider(BASE);
    await expect(provider.translateToSpanish('water', 'en')).resolves.toBeNull();
  });
});
