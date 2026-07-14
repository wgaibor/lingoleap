import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedUser, AuthVerifier } from '../application/ports/auth-verifier.port';
import { AUTH_VERIFIER } from '../application/ports/auth-verifier.port';
import { STATS_REPOSITORY, type StatsRepository } from '../application/ports/stats.repository';
import type { UserStats } from '../domain/user-stats';
import { ContentApiModule } from './content-api.module';
import { DomainExceptionFilter } from './domain-exception.filter';

class FakeVerifier implements AuthVerifier {
  async verifyToken(token: string): Promise<AuthenticatedUser | null> {
    return token === 'valid-token' ? { id: 'user-1', email: 'a@b.com' } : null;
  }
}

class FakeStats implements StatsRepository {
  stored: UserStats | null = null;
  async findByUser(): Promise<UserStats | null> { return this.stored; }
  async save(stats: UserStats): Promise<void> { this.stored = stats; }
}

describe('API de stats', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
    process.env.PEXELS_API_KEY = 'stub';
    const moduleRef = await Test.createTestingModule({ imports: [ContentApiModule] })
      .overrideProvider(AUTH_VERIFIER).useValue(new FakeVerifier())
      .overrideProvider(STATS_REPOSITORY).useValue(new FakeStats())
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('rechaza sin token', async () => {
    await request(app.getHttpServer()).get('/me/stats').expect(401);
  });

  it('devuelve el resumen por defecto para un usuario nuevo', async () => {
    const res = await request(app.getHttpServer())
      .get('/me/stats')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
    expect(res.body).toMatchObject({ xp: 0, level: 1, hearts: 5, maxHearts: 5, streakCount: 0 });
  });
});
