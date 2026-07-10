import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CEFRLevel, Course, CourseSummary, LearningLanguage, Lesson } from '@lingoleap/core';
import { COURSE_REPOSITORY, type CourseRepository } from '../application/ports/course.repository';
import { ContentApiModule } from './content-api.module';
import { DomainExceptionFilter } from './domain-exception.filter';

const lesson: Lesson = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  title: 'Lección 1',
  position: 1,
  exercises: [{ id: 'e1', type: 'match-pairs', pairs: [{ left: 'water', right: 'agua' }] }]
};

const course: Course = {
  id: 'c1',
  language: 'en',
  level: 'A1',
  title: 'Inglés A1',
  units: [{ id: 'u1', title: 'Unidad 1', position: 1, lessons: [lesson] }]
};

class FakeRepo implements CourseRepository {
  async saveCourse(): Promise<void> {}
  async findByLanguageAndLevel(l: LearningLanguage, lv: CEFRLevel): Promise<Course | null> {
    return l === 'en' && lv === 'A1' ? course : null;
  }
  async listSummaries(): Promise<CourseSummary[]> {
    return [{ id: 'c1', language: 'en', level: 'A1', title: 'Inglés A1' }];
  }
  async findLessonById(id: string): Promise<Lesson | null> {
    return id === lesson.id ? lesson : null;
  }
}

describe('API de contenido', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
    process.env.PEXELS_API_KEY = 'stub';

    const moduleRef = await Test.createTestingModule({ imports: [ContentApiModule] })
      .overrideProvider(COURSE_REPOSITORY)
      .useValue(new FakeRepo())
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /courses lista resúmenes', async () => {
    const res = await request(app.getHttpServer()).get('/courses').expect(200);
    expect(res.body).toEqual([{ id: 'c1', language: 'en', level: 'A1', title: 'Inglés A1' }]);
  });

  it('GET /courses/:language/:level devuelve el curso', async () => {
    const res = await request(app.getHttpServer()).get('/courses/en/A1').expect(200);
    expect(res.body.title).toBe('Inglés A1');
    expect(res.body.units).toHaveLength(1);
  });

  it('GET /courses inexistente responde 404 con código semántico', async () => {
    const res = await request(app.getHttpServer()).get('/courses/it/C2').expect(404);
    expect(res.body.code).toBe('COURSE_NOT_FOUND');
  });

  it('GET /lessons/:id devuelve la lección y 404 si no existe', async () => {
    await request(app.getHttpServer()).get(`/lessons/${lesson.id}`).expect(200);
    const res = await request(app.getHttpServer())
      .get('/lessons/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
      .expect(404);
    expect(res.body.code).toBe('LESSON_NOT_FOUND');
  });
});
