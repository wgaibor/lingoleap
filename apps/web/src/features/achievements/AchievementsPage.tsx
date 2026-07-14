import type { AchievementCategory, AchievementStatus } from '@lingoleap/core';
import { ACHIEVEMENT_LABEL } from './achievementLabels';
import { useAchievements } from './queries';

const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  streak: 'Racha',
  lessons: 'Lecciones completadas',
  level: 'Nivel'
};

const CATEGORY_ORDER: AchievementCategory[] = ['streak', 'lessons', 'level'];

function groupByCategory(items: AchievementStatus[]): Record<AchievementCategory, AchievementStatus[]> {
  const groups: Record<AchievementCategory, AchievementStatus[]> = { streak: [], lessons: [], level: [] };
  for (const item of items) {
    groups[item.category].push(item);
  }
  return groups;
}

export function AchievementsPage() {
  const { data, isPending, isError } = useAchievements();

  if (isPending) {
    return (
      <div className="container">
        <p>Cargando…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container">
        <p role="alert">No pudimos cargar tus logros.</p>
      </div>
    );
  }

  const groups = groupByCategory(data);

  return (
    <div className="container">
      <h2>Logros</h2>
      {CATEGORY_ORDER.map((category) => (
        <section key={category} className="achievements-group">
          <h3>{CATEGORY_LABEL[category]}</h3>
          <ul className="achievements-list">
            {groups[category].map((item) => (
              <li key={item.id} className="achievements-item">
                <span aria-hidden="true">{item.unlocked ? '✅' : '🔒'}</span>
                <span>{ACHIEVEMENT_LABEL[item.id]}</span>
                <span className="achievements-gems">+{item.gems}💎</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
