import { describe, expect, it } from 'vitest';
import { frequencyBandFor } from './cefr';

describe('frequencyBandFor', () => {
  it('devuelve la banda de frecuencia de A1', () => {
    expect(frequencyBandFor('A1')).toEqual({ start: 1, end: 800 });
  });

  it('las bandas son contiguas y crecientes de A1 a C2', () => {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
    let previousEnd = 0;
    for (const level of levels) {
      const band = frequencyBandFor(level);
      expect(band.start).toBe(previousEnd + 1);
      expect(band.end).toBeGreaterThan(band.start);
      previousEnd = band.end;
    }
  });
});
