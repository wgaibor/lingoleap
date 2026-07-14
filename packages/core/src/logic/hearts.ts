export const MAX_HEARTS = 5;
export const HEART_REGEN_MS = 4 * 60 * 60 * 1000;

export interface HeartsState {
  hearts: number;
  updatedAt: string;
}

export function regenerateHearts(state: HeartsState, nowIso: string): HeartsState {
  if (state.hearts >= MAX_HEARTS) {
    return { hearts: MAX_HEARTS, updatedAt: nowIso };
  }
  const elapsed = Date.parse(nowIso) - Date.parse(state.updatedAt);
  const gained = Math.floor(elapsed / HEART_REGEN_MS);
  if (gained <= 0) return state;
  const hearts = Math.min(MAX_HEARTS, state.hearts + gained);
  const updatedAt =
    hearts >= MAX_HEARTS
      ? nowIso
      : new Date(Date.parse(state.updatedAt) + gained * HEART_REGEN_MS).toISOString();
  return { hearts, updatedAt };
}

export function loseHearts(hearts: number, errorCount: number): number {
  return Math.max(0, hearts - Math.max(0, Math.floor(errorCount)));
}

export function nextHeartAt(state: HeartsState): string | null {
  if (state.hearts >= MAX_HEARTS) return null;
  return new Date(Date.parse(state.updatedAt) + HEART_REGEN_MS).toISOString();
}

export function canStartLesson(hearts: number, lessonAlreadyCompleted: boolean): boolean {
  return lessonAlreadyCompleted || hearts > 0;
}
