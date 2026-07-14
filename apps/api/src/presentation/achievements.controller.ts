import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { AchievementStatus } from '@lingoleap/core';
import { GetAchievementsUseCase } from '../application/use-cases/get-achievements.use-case';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';

@Controller('me')
@UseGuards(AuthGuard)
export class AchievementsController {
  constructor(private readonly getAchievements: GetAchievementsUseCase) {}

  @Get('achievements')
  achievements(@Req() req: AuthenticatedRequest): Promise<AchievementStatus[]> {
    return this.getAchievements.execute(req.user.id);
  }
}
