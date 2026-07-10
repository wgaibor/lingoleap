import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fetchJson } from './fetch-json';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('fetchJson', () => {
  it('devuelve el JSON en éxito', async () => {
    server.use(http.get('https://x.test/ok', () => HttpResponse.json({ hello: 'world' })));
    await expect(fetchJson('https://x.test/ok')).resolves.toEqual({ hello: 'world' });
  });

  it('reintenta ante 500 y termina en éxito', async () => {
    let calls = 0;
    server.use(
      http.get('https://x.test/flaky', () => {
        calls++;
        return calls < 3 ? new HttpResponse(null, { status: 500 }) : HttpResponse.json({ ok: true });
      })
    );
    await expect(fetchJson('https://x.test/flaky', undefined, 3)).resolves.toEqual({ ok: true });
    expect(calls).toBe(3);
  });

  it('devuelve null en 404 sin reintentar', async () => {
    let calls = 0;
    server.use(
      http.get('https://x.test/missing', () => {
        calls++;
        return new HttpResponse(null, { status: 404 });
      })
    );
    await expect(fetchJson('https://x.test/missing')).resolves.toBeNull();
    expect(calls).toBe(1);
  });
});
