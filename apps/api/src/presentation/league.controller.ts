import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { LeagueSummary } from '@lingoleap/core';
import { GetLeagueUseCase } from '../application/use-cases/get-league.use-case';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';

@Controller('me')
@UseGuards(AuthGuard)
export class LeagueController {
  constructor(private readonly getLeague: GetLeagueUseCase) {}

  @Get('league')
  league(@Req() req: AuthenticatedRequest): Promise<LeagueSummary> {
    return this.getLeague.execute(req.user.id);
  }
}
