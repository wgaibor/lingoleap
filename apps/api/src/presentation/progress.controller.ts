import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { LessonRewards } from '@lingoleap/core';
import { CompleteLessonUseCase } from '../application/use-cases/complete-lesson.use-case';
import { GetProgressUseCase } from '../application/use-cases/get-progress.use-case';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';

interface CompleteLessonBody {
  errorCount?: number;
  date?: string;
}

@Controller('progress')
@UseGuards(AuthGuard)
export class ProgressController {
  constructor(
    private readonly completeLesson: CompleteLessonUseCase,
    private readonly getProgress: GetProgressUseCase
  ) {}

  @Post('lessons/:lessonId/complete')
  async complete(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() body: CompleteLessonBody,
    @Req() req: AuthenticatedRequest
  ): Promise<{ completed: true; rewards: LessonRewards }> {
    const rewards = await this.completeLesson.execute({
      userId: req.user.id,
      lessonId,
      errorCount: typeof body?.errorCount === 'number' ? body.errorCount : 0,
      clientDate: typeof body?.date === 'string' ? body.date : null
    });
    return { completed: true, rewards };
  }

  @Get('lessons')
  async list(@Req() req: AuthenticatedRequest): Promise<{ lessonIds: string[] }> {
    return { lessonIds: await this.getProgress.execute(req.user.id) };
  }
}
