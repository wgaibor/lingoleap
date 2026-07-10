import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PexelsImageProvider } from './pexels-image.provider';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE = 'https://pexels.test';

describe('PexelsImageProvider', () => {
  it('devuelve la primera imagen mediana con el header de auth', async () => {
    server.use(
      http.get(`${BASE}/v1/search`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe('my-key');
        const url = new URL(request.url);
        expect(url.searchParams.get('query')).toBe('water');
        return HttpResponse.json({
          photos: [{ src: { medium: 'https://images.pexels.test/water-medium.jpg' } }]
        });
      })
    );
    const provider = new PexelsImageProvider('my-key', BASE);
    await expect(provider.findImageUrl('water')).resolves.toBe(
      'https://images.pexels.test/water-medium.jpg'
    );
  });

  it('devuelve null sin resultados', async () => {
    server.use(http.get(`${BASE}/v1/search`, () => HttpResponse.json({ photos: [] })));
    const provider = new PexelsImageProvider('my-key', BASE);
    await expect(provider.findImageUrl('zzzz')).resolves.toBeNull();
  });
});
