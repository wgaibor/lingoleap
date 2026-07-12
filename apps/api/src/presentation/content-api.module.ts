import { Module } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AUTH_VERIFIER } from '../application/ports/auth-verifier.port';
import { COURSE_REPOSITORY, type CourseRepository } from '../application/ports/course.repository';
import { PROGRESS_REPOSITORY, type ProgressRepository } from '../application/ports/progress.repository';
import { CompleteLessonUseCase } from '../application/use-cases/complete-lesson.use-case';
import { GetCourseUseCase } from '../application/use-cases/get-course.use-case';
import { GetLessonUseCase } from '../application/use-cases/get-lesson.use-case';
import { GetProgressUseCase } from '../application/use-cases/get-progress.use-case';
import { ListCoursesUseCase } from '../application/use-cases/list-courses.use-case';
import { SupabaseAuthVerifier } from '../infrastructure/auth/supabase-auth.verifier';
import { IngestModule } from '../infrastructure/ingest.module';
import { SupabaseProgressRepository } from '../infrastructure/persistence/supabase/supabase-progress.repository';
import { SUPABASE_CLIENT } from '../infrastructure/persistence/supabase/supabase-client.factory';
import { AuthGuard } from './auth.guard';
import { CoursesController } from './courses.controller';
import { LessonsController } from './lessons.controller';
import { ProgressController } from './progress.controller';

@Module({
  imports: [IngestModule],
  controllers: [CoursesController, LessonsController, ProgressController],
  providers: [
    {
      provide: ListCoursesUseCase,
      useFactory: (repo: CourseRepository) => new ListCoursesUseCase(repo),
      inject: [COURSE_REPOSITORY]
    },
    {
      provide: GetCourseUseCase,
      useFactory: (repo: CourseRepository) => new GetCourseUseCase(repo),
      inject: [COURSE_REPOSITORY]
    },
    {
      provide: GetLessonUseCase,
      useFactory: (repo: CourseRepository) => new GetLessonUseCase(repo),
      inject: [COURSE_REPOSITORY]
    },
    {
      provide: AUTH_VERIFIER,
      useFactory: (c: SupabaseClient) => new SupabaseAuthVerifier(c),
      inject: [SUPABASE_CLIENT]
    },
    {
      provide: PROGRESS_REPOSITORY,
      useFactory: (c: SupabaseClient) => new SupabaseProgressRepository(c),
      inject: [SUPABASE_CLIENT]
    },
    {
      provide: CompleteLessonUseCase,
      useFactory: (courses: CourseRepository, progress: ProgressRepository) =>
        new CompleteLessonUseCase({ courses, progress }),
      inject: [COURSE_REPOSITORY, PROGRESS_REPOSITORY]
    },
    {
      provide: GetProgressUseCase,
      useFactory: (p: ProgressRepository) => new GetProgressUseCase(p),
      inject: [PROGRESS_REPOSITORY]
    },
    AuthGuard
  ]
})
export class ContentApiModule {}
