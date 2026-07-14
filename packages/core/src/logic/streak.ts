export interface StreakInput {
  count: number;
  lastDate: string | null;
  freezes: number;
}

export interface StreakResult {
  count: number;
  lastDate: string;
  freezes: number;
  freezeUsed: boolean;
}

function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function applyLessonDay(input: StreakInput, today: string): StreakResult {
  const { count, lastDate, freezes } = input;
  if (lastDate === today) {
    return { count, lastDate: today, freezes, freezeUsed: false };
  }
  if (lastDate === shiftDay(today, -1)) {
    return { count: count + 1, lastDate: today, freezes, freezeUsed: false };
  }
  if (lastDate === shiftDay(today, -2) && freezes > 0) {
    return { count: count + 1, lastDate: today, freezes: freezes - 1, freezeUsed: true };
  }
  return { count: 1, lastDate: today, freezes, freezeUsed: false };
}
