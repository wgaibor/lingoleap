import { describe, expect, it } from 'vitest';
import { closeLeagueWeek, divisionAfter, leagueZone, weekStartOf } from './league';

describe('weekStartOf', () => {
  it('devuelve el mismo día si es lunes', () => {
    expect(weekStartOf('2026-07-13')).toBe('2026-07-13');
  });

  it('retrocede al lunes desde un jueves', () => {
    expect(weekStartOf('2026-07-16')).toBe('2026-07-13');
  });

  it('retrocede al lunes desde un domingo (fin de la semana)', () => {
    expect(weekStartOf('2026-07-19')).toBe('2026-07-13');
  });

  it('cruza el cambio de mes y de año', () => {
    expect(weekStartOf('2026-01-01')).toBe('2025-12-29');
  });
});

describe('divisionAfter', () => {
  it('asciende a la siguiente división', () => {
    expect(divisionAfter('bronze', 'promoted')).toBe('silver');
  });

  it('no asciende más allá de diamante', () => {
    expect(divisionAfter('diamond', 'promoted')).toBe('diamond');
  });

  it('desciende a la división anterior', () => {
    expect(divisionAfter('gold', 'demoted')).toBe('silver');
  });

  it('no desciende por debajo de bronce', () => {
    expect(divisionAfter('bronze', 'demoted')).toBe('bronze');
  });

  it('se queda igual con stayed', () => {
    expect(divisionAfter('silver', 'stayed')).toBe('silver');
  });
});

describe('leagueZone', () => {
  it('marca zona de ascenso para el top 10', () => {
    expect(leagueZone(1, 30, 'silver')).toBe('promotion');
    expect(leagueZone(10, 30, 'silver')).toBe('promotion');
    expect(leagueZone(11, 30, 'silver')).toBe('none');
  });

  it('marca zona de descenso para los últimos 5', () => {
    expect(leagueZone(26, 30, 'silver')).toBe('demotion');
    expect(leagueZone(25, 30, 'silver')).toBe('none');
  });

  it('en diamante nadie asciende', () => {
    expect(leagueZone(1, 30, 'diamond')).toBe('none');
  });

  it('en bronce nadie desciende', () => {
    expect(leagueZone(30, 30, 'bronze')).toBe('none');
  });

  it('en cohortes chicas el ascenso gana al solaparse las zonas', () => {
    expect(leagueZone(3, 4, 'silver')).toBe('promotion');
    expect(leagueZone(4, 4, 'silver')).toBe('promotion');
  });
});

describe('closeLeagueWeek', () => {
  const member = (userId: string, weeklyXp: number, lastXpAt = '2026-07-15T10:00:00.000Z') =>
    ({ userId, weeklyXp, lastXpAt });

  it('ordena por XP, asciende al top 10, desciende a los últimos 5 y premia al podio', () => {
    const members = Array.from({ length: 30 }, (_, i) => member(`u${i + 1}`, 300 - i * 10));
    const outcomes = closeLeagueWeek(members, 'silver');
    expect(outcomes[0]).toEqual({ userId: 'u1', position: 1, result: 'promoted', gemsAwarded: 20 });
    expect(outcomes[1]).toEqual({ userId: 'u2', position: 2, result: 'promoted', gemsAwarded: 10 });
    expect(outcomes[2]).toEqual({ userId: 'u3', position: 3, result: 'promoted', gemsAwarded: 5 });
    expect(outcomes[9].result).toBe('promoted');
    expect(outcomes[10].result).toBe('stayed');
    expect(outcomes[24].result).toBe('stayed');
    expect(outcomes[25].result).toBe('demoted');
    expect(outcomes[29].result).toBe('demoted');
  });

  it('desempata por quién llegó antes a ese XP (lastXpAt ascendente)', () => {
    const outcomes = closeLeagueWeek(
      [
        member('tarde', 100, '2026-07-15T20:00:00.000Z'),
        member('temprano', 100, '2026-07-15T08:00:00.000Z')
      ],
      'bronze'
    );
    expect(outcomes[0].userId).toBe('temprano');
    expect(outcomes[1].userId).toBe('tarde');
  });

  it('en bronce nadie desciende y en diamante nadie asciende', () => {
    const members = Array.from({ length: 30 }, (_, i) => member(`u${i + 1}`, 300 - i * 10));
    expect(closeLeagueWeek(members, 'bronze').every((o) => o.result !== 'demoted')).toBe(true);
    expect(closeLeagueWeek(members, 'diamond').every((o) => o.result !== 'promoted')).toBe(true);
  });

  it('en cohortes chicas todos ascienden si caben en el top 10 (nadie desciende doble)', () => {
    const outcomes = closeLeagueWeek(
      [member('a', 30), member('b', 20), member('c', 10)],
      'silver'
    );
    expect(outcomes.map((o) => o.result)).toEqual(['promoted', 'promoted', 'promoted']);
    expect(outcomes.map((o) => o.gemsAwarded)).toEqual([20, 10, 5]);
  });
});
