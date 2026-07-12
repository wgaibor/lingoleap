import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedUser, AuthVerifier } from '../application/ports/auth-verifier.port';
import { AUTH_VERIFIER } from '../application/ports/auth-verifier.port';
import type { ProgressRepository } from '../application/ports/progress.repository';
import { PROGRESS_REPOSITORY } from '../application/ports/progress.repository';
import { COURSE_REPOSITORY, type CourseRepository } from '../application/ports/course.repository';
import type { Lesson } from '@lingoleap/core';
import { ContentApiModule } from './content-api.module';
import { DomainExceptionFilter } from './domain-exception.filter';

const lesson: Lesson = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', title: 'L1', position: 1, exercises: [
  { id: 'e1', type: 'match-pairs', pairs: [{ left: 'water', right: 'agua' }] }
] };

class FakeVerifier implements AuthVerifier {
  async verifyToken(token: string): Promise<AuthenticatedUser | null> {
    return token === 'valid-token' ? { id: 'user-1', email: 'a@b.com' } : null;
  }
}

class FakeProgress implements ProgressRepository {
  saved: string[] = [];
  async markLessonCompleted(_userId: string, lessonId: string): Promise<void> { this.saved.push(lessonId); }
  async listCompletedLessonIds(): Promise<string[]> { return this.saved; }
}

class FakeCourses implements CourseRepository {
  async saveCourse(): Promise<void> {}
  async findByLanguageAndLevel(): Promise<null> { return null; }
  async listSummaries(): Promise<[]> { return []; }
  async findLessonById(id: string): Promise<Lesson | null> { return id === lesson.id ? lesson : null; }
}

describe('API de progreso', () => {
  let app: INestApplication;
  const progress = new FakeProgress();

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
    process.env.PEXELS_API_KEY = 'stub';
    const moduleRef = await Test.createTestingModule({ imports: [ContentApiModule] })
      .overrideProvider(AUTH_VERIFIER).useValue(new FakeVerifier())
      .overrideProvider(PROGRESS_REPOSITORY).useValue(progress)
      .overrideProvider(COURSE_REPOSITORY).useValue(new FakeCourses())
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('rechaza sin token', async () => {
    const res = await request(app.getHttpServer())
      .post(`/progress/lessons/${lesson.id}/complete`).expect(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('completa una lección con token válido', async () => {
    await request(app.getHttpServer())
      .post(`/progress/lessons/${lesson.id}/complete`)
      .set('Authorization', 'Bearer valid-token')
      .expect(201, { completed: true });
    expect(progress.saved).toEqual([lesson.id]);
  });

  it('404 si la lección no existe', async () => {
    const res = await request(app.getHttpServer())
      .post('/progress/lessons/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/complete')
      .set('Authorization', 'Bearer valid-token')
      .expect(404);
    expect(res.body.code).toBe('LESSON_NOT_FOUND');
  });

  it('lista el progreso del usuario', async () => {
    const res = await request(app.getHttpServer())
      .get('/progress/lessons')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
    expect(res.body).toEqual({ lessonIds: [lesson.id] });
  });
});
