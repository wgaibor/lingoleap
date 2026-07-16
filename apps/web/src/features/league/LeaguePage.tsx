import type { LeagueZone } from '@lingoleap/core';
import { DIVISION_LABEL } from './divisionLabels';
import { useLeague } from './queries';

const ZONE_CLASS: Record<LeagueZone, string> = {
  promotion: 'league-row-promotion',
  demotion: 'league-row-demotion',
  none: ''
};

export function LeaguePage() {
  const { data, isPending, isError } = useLeague();

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
        <p role="alert">No pudimos cargar tu liga.</p>
      </div>
    );
  }

  return (
    <div className="container">
      <h2>
        <span aria-hidden="true">🏆</span> <span>Liga {DIVISION_LABEL[data.division]}</span>
      </h2>
      {data.cohort === null ? (
        <p>Completá una lección para entrar a la liga.</p>
      ) : (
        <table className="league-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Jugador</th>
              <th>XP semanal</th>
            </tr>
          </thead>
          <tbody>
            {data.cohort.standings.map((s) => (
              <tr
                key={s.position}
                className={`${ZONE_CLASS[s.zone]} ${s.isMe ? 'league-row-me' : ''}`.trim()}
              >
                <td>{s.position}</td>
                <td>{s.displayName}</td>
                <td>{s.weeklyXp} XP</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
