import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { Lesson } from '@lingoleap/core';
import { GetLessonUseCase } from '../application/use-cases/get-lesson.use-case';

@Controller('lessons')
export class LessonsController {
  constructor(private readonly getLesson: GetLessonUseCase) {}

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Lesson> {
    return this.getLesson.execute(id);
  }
}
