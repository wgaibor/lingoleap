import { Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { CompleteLessonUseCase } from '../application/use-cases/complete-lesson.use-case';
import { GetProgressUseCase } from '../application/use-cases/get-progress.use-case';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';

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
    @Req() req: AuthenticatedRequest
  ): Promise<{ completed: true }> {
    await this.completeLesson.execute(req.user.id, lessonId);
    return { completed: true };
  }

  @Get('lessons')
  async list(@Req() req: AuthenticatedRequest): Promise<{ lessonIds: string[] }> {
    return { lessonIds: await this.getProgress.execute(req.user.id) };
  }
}
