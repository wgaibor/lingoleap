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

  it('getStats envía el token y devuelve el resumen', async () => {
    server.use(
      http.get(`${BASE}/me/stats`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer token-123');
        return HttpResponse.json({
          xp: 120, level: 2, xpIntoLevel: 20, xpToNextLevel: 180,
          streakCount: 3, streakFreezes: 0, gems: 0,
          hearts: 4, maxHearts: 5, nextHeartAt: null
        });
      })
    );
    const client = new LingoApiClient({ baseUrl: BASE, getAccessToken: async () => 'token-123' });
    const stats = await client.getStats();
    expect(stats.level).toBe(2);
  });

  it('buyStreakFreeze envía el token por POST y devuelve el resumen actualizado', async () => {
    server.use(
      http.post(`${BASE}/me/streak-freezes`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer token-123');
        return HttpResponse.json({
          xp: 50, level: 1, xpIntoLevel: 50, xpToNextLevel: 50,
          streakCount: 3, streakFreezes: 1, gems: 0,
          hearts: 5, maxHearts: 5, nextHeartAt: null
        });
      })
    );
    const client = new LingoApiClient({ baseUrl: BASE, getAccessToken: async () => 'token-123' });
    const stats = await client.buyStreakFreeze();
    expect(stats.streakFreezes).toBe(1);
    expect(stats.gems).toBe(0);
  });

  it('getLeague envía el token y devuelve el resumen de la liga', async () => {
    server.use(
      http.get(`${BASE}/me/league`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer token-123');
        return HttpResponse.json({
          division: 'silver',
          cohort: {
            weekStart: '2026-07-13',
            standings: [
              { position: 1, displayName: 'ana', weeklyXp: 40, isMe: true, zone: 'promotion' }
            ]
          }
        });
      })
    );
    const client = new LingoApiClient({ baseUrl: BASE, getAccessToken: async () => 'token-123' });
    const league = await client.getLeague();
    expect(league.division).toBe('silver');
    expect(league.cohort?.standings[0].isMe).toBe(true);
  });

  it('getAchievements envía el token y devuelve el catálogo con su estado', async () => {
    server.use(
      http.get(`${BASE}/me/achievements`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer token-123');
        return HttpResponse.json([
          { id: 'streak-3', category: 'streak', threshold: 3, gems: 5, unlocked: true },
          { id: 'streak-7', category: 'streak', threshold: 7, gems: 15, unlocked: false }
        ]);
      })
    );
    const client = new LingoApiClient({ baseUrl: BASE, getAccessToken: async () => 'token-123' });
    const achievements = await client.getAchievements();
    expect(achievements).toHaveLength(2);
    expect(achievements[0]).toMatchObject({ id: 'streak-3', unlocked: true });
  });

  it('completeLesson envía errorCount y fecha, y devuelve las recompensas', async () => {
    server.use(
      http.post(`${BASE}/progress/lessons/l1/complete`, async ({ request }) => {
        expect(await request.json()).toEqual({ errorCount: 2, date: '2026-07-12' });
        return HttpResponse.json(
          { completed: true, rewards: { xpEarned: 13, totalXp: 13, level: 1, streakCount: 1, freezeUsed: false, hearts: 3 } },
          { status: 201 }
        );
      })
    );
    const client = new LingoApiClient({ baseUrl: BASE });
    const rewards = await client.completeLesson('l1', { errorCount: 2, date: '2026-07-12' });
    expect(rewards.xpEarned).toBe(13);
  });
});
