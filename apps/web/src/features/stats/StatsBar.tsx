import { Link } from 'react-router-dom';
import { useStats } from './queries';

export function StatsBar() {
  const { data } = useStats();
  if (!data) return null;
  const levelTotal = data.xpIntoLevel + data.xpToNextLevel;
  const percent = levelTotal === 0 ? 0 : Math.round((data.xpIntoLevel / levelTotal) * 100);
  return (
    <div className="stats-bar">
      <span className="stats-item" title="Racha de días seguidos">🔥 {data.streakCount}</span>
      <span className="stats-item" title="Corazones">❤️ {data.hearts}</span>
      <Link to="/achievements" className="stats-item stats-gems-link" title="Ver logros">💎 {data.gems}</Link>
      <span className="stats-item" title="Congeladores de racha">🧊 {data.streakFreezes}</span>
      <span className="stats-item" title="Nivel">⚡ Nivel {data.level}</span>
      <div
        className="stats-level-bar"
        role="progressbar"
        aria-label={`Progreso del nivel ${data.level}`}
        aria-valuenow={data.xpIntoLevel}
        aria-valuemin={0}
        aria-valuemax={levelTotal}
      >
        <div className="stats-level-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
