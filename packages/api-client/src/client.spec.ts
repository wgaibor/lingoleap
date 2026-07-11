import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ApiError, LingoApiClient } from './client';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE = 'https://api.test';

describe('LingoApiClient', () => {
  it('lista cursos', async () => {
    server.use(http.get(`${BASE}/courses`, () =>
      HttpResponse.json([{ id: 'c1', language: 'en', level: 'A1', title: 'Inglés A1' }])
    ));
    const client = new LingoApiClient({ baseUrl: BASE });
    await expect(client.listCourses()).resolves.toHaveLength(1);
  });

  it('adjunta el Bearer token cuando hay sesión', async () => {
    server.use(http.get(`${BASE}/progress/lessons`, ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer tok-123');
      return HttpResponse.json({ lessonIds: ['l1'] });
    }));
    const client = new LingoApiClient({ baseUrl: BASE, getAccessToken: async () => 'tok-123' });
    await expect(client.getCompletedLessonIds()).resolves.toEqual(['l1']);
  });

  it('lanza ApiError con el código semántico del backend', async () => {
    server.use(http.get(`${BASE}/courses/it/C2`, () =>
      HttpResponse.json({ code: 'COURSE_NOT_FOUND', message: 'Curso no encontrado' }, { status: 404 })
    ));
    const client = new LingoApiClient({ baseUrl: BASE });
    const error = await client.getCourse('it', 'C2').catch((e: ApiError) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('COURSE_NOT_FOUND');
    expect((error as ApiError).status).toBe(404);
  });

  it('POST de completar lección envía token', async () => {
    server.use(http.post(`${BASE}/progress/lessons/l1/complete`, ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer tok-123');
      return HttpResponse.json({ completed: true }, { status: 201 });
    }));
    const client = new LingoApiClient({ baseUrl: BASE, getAccessToken: async () => 'tok-123' });
    await expect(client.completeLesson('l1')).resolves.toBeUndefined();
  });
});
