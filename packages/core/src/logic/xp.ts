export const XP_MIN_PER_LESSON = 10;
export const XP_MAX_PER_LESSON = 15;

export function lessonXp(errorCount: number): number {
  const errors = Math.max(0, Math.floor(errorCount));
  return Math.max(XP_MIN_PER_LESSON, XP_MAX_PER_LESSON - errors);
}

export function xpRequiredForLevel(level: number): number {
  return 100 * (2 ** (level - 1) - 1);
}

export interface LevelProgress {
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
}

export function levelProgress(totalXp: number): LevelProgress {
  let level = 1;
  while (xpRequiredForLevel(level + 1) <= totalXp) {
    level += 1;
  }
  const base = xpRequiredForLevel(level);
  return { level, xpIntoLevel: totalXp - base, xpToNextLevel: xpRequiredForLevel(level + 1) - totalXp };
}
