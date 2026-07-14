import { describe, expect, it } from 'vitest';
import type { StatsRepository } from '../ports/stats.repository';
import type { UserStats } from '../../domain/user-stats';
import { GetStatsUseCase } from './get-stats.use-case';

class FakeStats implements StatsRepository {
  constructor(private readonly stored: UserStats | null) {}
  saved: UserStats[] = [];
  async findByUser(): Promise<UserStats | null> { return this.stored; }
  async save(stats: UserStats): Promise<void> { this.saved.push(stats); }
}

const NOW = '2026-07-12T12:00:00.000Z';

describe('GetStatsUseCase', () => {
  it('devuelve stats por defecto (5 corazones, nivel 1) para un usuario sin fila', async () => {
    const useCase = new GetStatsUseCase({ stats: new FakeStats(null), now: () => NOW });
    const summary = await useCase.execute('u1');
    expect(summary).toEqual({
      xp: 0, level: 1, xpIntoLevel: 0, xpToNextLevel: 100,
      streakCount: 0, streakFreezes: 0, gems: 0,
      hearts: 5, maxHearts: 5, nextHeartAt: null
    });
  });

  it('regenera corazones al leer sin persistir', async () => {
    const repo = new FakeStats({
      userId: 'u1', xp: 120, streakCount: 3, lastLessonDate: '2026-07-11',
      hearts: 2, heartsUpdatedAt: '2026-07-12T03:00:00.000Z', gems: 0, streakFreezes: 1
    });
    const useCase = new GetStatsUseCase({ stats: repo, now: () => NOW });
    const summary = await useCase.execute('u1');
    expect(summary.hearts).toBe(4); // 9h transcurridas = +2
    expect(summary.nextHeartAt).toBe('2026-07-12T15:00:00.000Z');
    expect(summary.level).toBe(2);
    expect(summary.xpIntoLevel).toBe(20);
    expect(repo.saved).toEqual([]); // el GET no escribe
  });
});
