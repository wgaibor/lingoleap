import { describe, expect, it } from 'vitest';
import { divisionAfter, leagueZone, weekStartOf } from './league';

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
