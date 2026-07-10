import { BadRequestException, Controller, Get, Param } from '@nestjs/common';
import type { CEFRLevel, Course, CourseSummary, LearningLanguage } from '@lingoleap/core';
import { CEFR_LEVELS, LEARNING_LANGUAGES } from '@lingoleap/core';
import { GetCourseUseCase } from '../application/use-cases/get-course.use-case';
import { ListCoursesUseCase } from '../application/use-cases/list-courses.use-case';

@Controller('courses')
export class CoursesController {
  constructor(
    private readonly listCourses: ListCoursesUseCase,
    private readonly getCourse: GetCourseUseCase
  ) {}

  @Get()
  list(): Promise<CourseSummary[]> {
    return this.listCourses.execute();
  }

  @Get(':language/:level')
  get(@Param('language') language: string, @Param('level') level: string): Promise<Course> {
    if (!(LEARNING_LANGUAGES as readonly string[]).includes(language)) {
      throw new BadRequestException(`Idioma no soportado: ${language}`);
    }
    if (!(CEFR_LEVELS as readonly string[]).includes(level)) {
      throw new BadRequestException(`Nivel no soportado: ${level}`);
    }
    return this.getCourse.execute(language as LearningLanguage, level as CEFRLevel);
  }
}
