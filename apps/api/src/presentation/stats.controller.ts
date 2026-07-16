import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { StatsSummary } from '@lingoleap/core';
import { BuyStreakFreezeUseCase } from '../application/use-cases/buy-streak-freeze.use-case';
import { GetStatsUseCase } from '../application/use-cases/get-stats.use-case';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';

@Controller('me')
@UseGuards(AuthGuard)
export class StatsController {
  constructor(
    private readonly getStats: GetStatsUseCase,
    private readonly buyStreakFreezeUseCase: BuyStreakFreezeUseCase
  ) {}

  @Get('stats')
  stats(@Req() req: AuthenticatedRequest): Promise<StatsSummary> {
    return this.getStats.execute(req.user.id);
  }

  @Post('streak-freezes')
  buyStreakFreeze(@Req() req: AuthenticatedRequest): Promise<StatsSummary> {
    return this.buyStreakFreezeUseCase.execute(req.user.id);
  }
}
