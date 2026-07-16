import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CloseLeagueWeekUseCase } from '../application/use-cases/close-league-week.use-case';

@Injectable()
export class LeagueSchedulerService {
  constructor(private readonly closeWeek: CloseLeagueWeekUseCase) {}

  // Lunes 00:05 UTC — la semana de liga corre de lunes a domingo en UTC.
  @Cron('5 0 * * 1', { timeZone: 'UTC' })
  async closeExpiredWeeks(): Promise<void> {
    await this.closeWeek.execute();
  }
}
