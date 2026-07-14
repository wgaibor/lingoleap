import type { AchievementDefinition } from './logic/achievements';

export interface StatsSummary {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  streakCount: number;
  streakFreezes: number;
  gems: number;
  hearts: number;
  maxHearts: number;
  nextHeartAt: string | null;
}

export interface LessonRewards {
  xpEarned: number;
  totalXp: number;
  level: number;
  streakCount: number;
  freezeUsed: boolean;
  hearts: number;
  gemsEarned: number;
  achievementsUnlocked: AchievementDefinition[];
}
