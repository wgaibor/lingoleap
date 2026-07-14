import { describe, expect, it } from 'vitest';
import type { AchievementsRepository } from '../ports/achievements.repository';
import { GetAchievementsUseCase } from './get-achievements.use-case';

class FakeAchievements implements AchievementsRepository {
  constructor(private readonly unlocked: string[]) {}
  async listUnlockedIds(): Promise<string[]> { return this.unlocked; }
  async unlock(): Promise<void> {}
}

describe('GetAchievementsUseCase', () => {
  it('devuelve los 8 logros marcando cuáles ya desbloqueó el usuario', async () => {
    const useCase = new GetAchievementsUseCase(new FakeAchievements(['streak-3', 'level-5']));
    const result = await useCase.execute('u1');
    expect(result).toHaveLength(8);
    expect(result.find((a) => a.id === 'streak-3')).toMatchObject({ unlocked: true });
    expect(result.find((a) => a.id === 'streak-7')).toMatchObject({ unlocked: false });
    expect(result.find((a) => a.id === 'level-5')).toMatchObject({ unlocked: true });
  });

  it('devuelve los 8 con unlocked=false si el usuario no tiene ninguno', async () => {
    const useCase = new GetAchievementsUseCase(new FakeAchievements([]));
    const result = await useCase.execute('u1');
    expect(result.every((a) => a.unlocked === false)).toBe(true);
  });
});
