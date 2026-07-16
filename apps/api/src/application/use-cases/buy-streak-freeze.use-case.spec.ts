import { describe, expect, it } from 'vitest';
import type { StatsRepository } from '../ports/stats.repository';
import type { UserStats } from '../../domain/user-stats';
import { InsufficientGemsError, StreakFreezeLimitReachedError } from '../../domain/errors';
import { BuyStreakFreezeUseCase } from './buy-streak-freeze.use-case';

class FakeStats implements StatsRepository {
  constructor(private readonly stored: UserStats | null) {}
  saved: UserStats[] = [];
  async findByUser(): Promise<UserStats | null> { return this.stored; }
  async save(stats: UserStats): Promise<void> { this.saved.push(stats); }
}

const NOW = '2026-07-15T12:00:00.000Z';

describe('BuyStreakFreezeUseCase', () => {
  it('compra exitosa: resta 10 gemas, suma 1 congelador, no toca el resto de campos', async () => {
    const stats = new FakeStats({
      userId: 'u1', xp: 50, streakCount: 3, lastLessonDate: '2026-07-14',
      hearts: 5, heartsUpdatedAt: NOW, gems: 15, streakFreezes: 0
    });
    const useCase = new BuyStreakFreezeUseCase({ stats, now: () => NOW });
    const summary = await useCase.execute('u1');
    expect(summary.gems).toBe(5);
    expect(summary.streakFreezes).toBe(1);
    expect(stats.saved).toEqual([{
      userId: 'u1', xp: 50, streakCount: 3, lastLessonDate: '2026-07-14',
      hearts: 5, heartsUpdatedAt: NOW, gems: 5, streakFreezes: 1
    }]);
  });

  it('lanza InsufficientGemsError sin guardar si no alcanzan las gemas', async () => {
    const stats = new FakeStats({
      userId: 'u1', xp: 0, streakCount: 0, lastLessonDate: null,
      hearts: 5, heartsUpdatedAt: NOW, gems: 9, streakFreezes: 0
    });
    const useCase = new BuyStreakFreezeUseCase({ stats, now: () => NOW });
    await expect(useCase.execute('u1')).rejects.toThrow(InsufficientGemsError);
    expect(stats.saved).toEqual([]);
  });

  it('lanza StreakFreezeLimitReachedError sin guardar si ya está en el tope', async () => {
    const stats = new FakeStats({
      userId: 'u1', xp: 0, streakCount: 0, lastLessonDate: null,
      hearts: 5, heartsUpdatedAt: NOW, gems: 100, streakFreezes: 2
    });
    const useCase = new BuyStreakFreezeUseCase({ stats, now: () => NOW });
    await expect(useCase.execute('u1')).rejects.toThrow(StreakFreezeLimitReachedError);
    expect(stats.saved).toEqual([]);
  });

  it('usa stats por defecto (0 gemas) si el usuario no tiene fila y rechaza la compra', async () => {
    const stats = new FakeStats(null);
    const useCase = new BuyStreakFreezeUseCase({ stats, now: () => NOW });
    await expect(useCase.execute('u1')).rejects.toThrow(InsufficientGemsError);
  });
});
