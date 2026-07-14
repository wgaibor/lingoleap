import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { StatsSummary } from '@lingoleap/core';
import { GetStatsUseCase } from '../application/use-cases/get-stats.use-case';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';

@Controller('me')
@UseGuards(AuthGuard)
export class StatsController {
  constructor(private readonly getStats: GetStatsUseCase) {}

  @Get('stats')
  stats(@Req() req: AuthenticatedRequest): Promise<StatsSummary> {
    return this.getStats.execute(req.user.id);
  }
}
