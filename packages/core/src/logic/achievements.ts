// packages/core/src/logic/achievements.ts
export type AchievementCategory = 'streak' | 'lessons' | 'level';

export interface AchievementDefinition {
  id: string;
  category: AchievementCategory;
  threshold: number;
  gems: number;
}

export interface AchievementStatus extends AchievementDefinition {
  unlocked: boolean;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'streak-3', category: 'streak', threshold: 3, gems: 5 },
  { id: 'streak-7', category: 'streak', threshold: 7, gems: 15 },
  { id: 'streak-30', category: 'streak', threshold: 30, gems: 30 },
  { id: 'lessons-10', category: 'lessons', threshold: 10, gems: 5 },
  { id: 'lessons-50', category: 'lessons', threshold: 50, gems: 15 },
  { id: 'lessons-100', category: 'lessons', threshold: 100, gems: 30 },
  { id: 'level-5', category: 'level', threshold: 5, gems: 5 },
  { id: 'level-10', category: 'level', threshold: 10, gems: 15 }
];

export interface AchievementProgress {
  streakCount: number;
  lessonsCompleted: number;
  level: number;
}

function valueFor(progress: AchievementProgress, category: AchievementCategory): number {
  switch (category) {
    case 'streak':
      return progress.streakCount;
    case 'lessons':
      return progress.lessonsCompleted;
    case 'level':
      return progress.level;
  }
}

export function unlockedAchievements(
  progress: AchievementProgress,
  alreadyUnlockedIds: string[]
): AchievementDefinition[] {
  return ACHIEVEMENTS.filter(
    (a) => !alreadyUnlockedIds.includes(a.id) && valueFor(progress, a.category) >= a.threshold
  );
}
