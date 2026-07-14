import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, unlockedAchievements } from './achievements';

describe('unlockedAchievements', () => {
  it('el catálogo tiene exactamente 8 logros', () => {
    expect(ACHIEVEMENTS).toHaveLength(8);
  });

  it('no desbloquea nada si no se cruzó ningún umbral', () => {
    expect(unlockedAchievements({ streakCount: 1, lessonsCompleted: 1, level: 1 }, [])).toEqual([]);
  });

  it('desbloquea el primer hito de racha al llegar a 3 días', () => {
    const result = unlockedAchievements({ streakCount: 3, lessonsCompleted: 0, level: 1 }, []);
    expect(result).toEqual([{ id: 'streak-3', category: 'streak', threshold: 3, gems: 5 }]);
  });

  it('no repite un logro que ya está en alreadyUnlockedIds', () => {
    expect(
      unlockedAchievements({ streakCount: 3, lessonsCompleted: 0, level: 1 }, ['streak-3'])
    ).toEqual([]);
  });

  it('no desbloquea "50 lecciones" con 49', () => {
    expect(
      unlockedAchievements({ streakCount: 0, lessonsCompleted: 49, level: 1 }, ['lessons-10'])
    ).toEqual([]);
  });

  it('desbloquea varios a la vez si el progreso saltó de golpe (nivel 4 a 10)', () => {
    const result = unlockedAchievements({ streakCount: 0, lessonsCompleted: 0, level: 10 }, []);
    expect(result.map((a) => a.id)).toEqual(['level-5', 'level-10']);
  });
});
