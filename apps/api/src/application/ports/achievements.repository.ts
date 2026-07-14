export const ACHIEVEMENTS_REPOSITORY = Symbol('AchievementsRepository');

export interface AchievementsRepository {
  listUnlockedIds(userId: string): Promise<string[]>;
  unlock(userId: string, achievementId: string, unlockedAt: string): Promise<void>;
}
