export interface UserStats {
  userId: string;
  xp: number;
  streakCount: number;
  lastLessonDate: string | null; // YYYY-MM-DD
  hearts: number;
  heartsUpdatedAt: string; // ISO timestamp desde el que se cuenta la regeneración
  gems: number;
  streakFreezes: number;
}

export function defaultUserStats(userId: string, nowIso: string): UserStats {
  return {
    userId, xp: 0, streakCount: 0, lastLessonDate: null,
    hearts: 5, heartsUpdatedAt: nowIso, gems: 0, streakFreezes: 0
  };
}
