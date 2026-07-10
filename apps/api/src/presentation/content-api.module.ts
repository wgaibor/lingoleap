import { Module } from '@nestjs/common';
import { COURSE_REPOSITORY, type CourseRepository } from '../application/ports/course.repository';
import { GetCourseUseCase } from '../application/use-cases/get-course.use-case';
import { GetLessonUseCase } from '../application/use-cases/get-lesson.use-case';
import { ListCoursesUseCase } from '../application/use-cases/list-courses.use-case';
import { IngestModule } from '../infrastructure/ingest.module';
import { CoursesController } from './courses.controller';
import { LessonsController } from './lessons.controller';

@Module({
  imports: [IngestModule],
  controllers: [CoursesController, LessonsController],
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
    }
  ]
})
export class ContentApiModule {}
