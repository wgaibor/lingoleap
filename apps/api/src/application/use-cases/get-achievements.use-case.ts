import { ACHIEVEMENTS, type AchievementStatus } from '@lingoleap/core';
import type { AchievementsRepository } from '../ports/achievements.repository';

export class GetAchievementsUseCase {
  constructor(private readonly achievements: AchievementsRepository) {}

  async execute(userId: string): Promise<AchievementStatus[]> {
    const unlockedIds = await this.achievements.listUnlockedIds(userId);
    return ACHIEVEMENTS.map((a) => ({ ...a, unlocked: unlockedIds.includes(a.id) }));
  }
}
