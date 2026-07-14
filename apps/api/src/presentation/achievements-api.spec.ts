import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedUser, AuthVerifier } from '../application/ports/auth-verifier.port';
import { AUTH_VERIFIER } from '../application/ports/auth-verifier.port';
import type { AchievementsRepository } from '../application/ports/achievements.repository';
import { ACHIEVEMENTS_REPOSITORY } from '../application/ports/achievements.repository';
import { ContentApiModule } from './content-api.module';
import { DomainExceptionFilter } from './domain-exception.filter';

class FakeVerifier implements AuthVerifier {
  async verifyToken(token: string): Promise<AuthenticatedUser | null> {
    return token === 'valid-token' ? { id: 'user-1', email: 'a@b.com' } : null;
  }
}

class FakeAchievements implements AchievementsRepository {
  unlocked: string[] = ['streak-3'];
  async listUnlockedIds(): Promise<string[]> { return this.unlocked; }
  async unlock(_userId: string, achievementId: string): Promise<void> { this.unlocked.push(achievementId); }
}

describe('API de logros', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
    process.env.PEXELS_API_KEY = 'stub';
    const moduleRef = await Test.createTestingModule({ imports: [ContentApiModule] })
      .overrideProvider(AUTH_VERIFIER).useValue(new FakeVerifier())
      .overrideProvider(ACHIEVEMENTS_REPOSITORY).useValue(new FakeAchievements())
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('rechaza sin token', async () => {
    await request(app.getHttpServer()).get('/me/achievements').expect(401);
  });

  it('devuelve los 8 logros con el estado de desbloqueo del usuario', async () => {
    const res = await request(app.getHttpServer())
      .get('/me/achievements')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
    expect(res.body).toHaveLength(8);
    expect(res.body.find((a: { id: string }) => a.id === 'streak-3')).toMatchObject({ unlocked: true });
    expect(res.body.find((a: { id: string }) => a.id === 'streak-7')).toMatchObject({ unlocked: false });
  });
});
