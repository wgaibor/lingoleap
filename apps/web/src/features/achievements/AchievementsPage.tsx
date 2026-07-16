import {
  MAX_STREAK_FREEZES, STREAK_FREEZE_PRICE, type AchievementCategory, type AchievementStatus
} from '@lingoleap/core';
import { ACHIEVEMENT_LABEL } from './achievementLabels';
import { useAchievements, useBuyStreakFreeze } from './queries';
import { useStats } from '../stats/queries';

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

function StoreSection() {
  const { data: stats } = useStats();
  const buyStreakFreeze = useBuyStreakFreeze();

  if (!stats) {
    return null;
  }

  const atMax = stats.streakFreezes >= MAX_STREAK_FREEZES;
  const notEnoughGems = stats.gems < STREAK_FREEZE_PRICE;
  const disabled = atMax || notEnoughGems || buyStreakFreeze.isPending;

  let reason: string | null = null;
  if (atMax) {
    reason = 'Ya tenés el máximo de congeladores.';
  } else if (notEnoughGems) {
    reason = `Necesitás ${STREAK_FREEZE_PRICE}💎.`;
  }

  return (
    <section className="store-section">
      <h3>Tienda</h3>
      <p className="store-status">
        🧊 {stats.streakFreezes} congeladores · 💎 {stats.gems} gemas
      </p>
      <button
        type="button"
        className="button button-primary"
        disabled={disabled}
        onClick={() => buyStreakFreeze.mutate()}
      >
        Comprar congelador ({STREAK_FREEZE_PRICE}💎)
      </button>
      {reason && <p className="store-reason">{reason}</p>}
      {buyStreakFreeze.isError && <p role="alert">No pudimos completar la compra.</p>}
    </section>
  );
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
      <StoreSection />
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
