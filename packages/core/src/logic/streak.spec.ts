import { describe, expect, it } from 'vitest';
import { applyLessonDay } from './streak';

describe('applyLessonDay', () => {
  it('inicia la racha en 1 con la primera lección', () => {
    expect(applyLessonDay({ count: 0, lastDate: null, freezes: 0 }, '2026-07-12'))
      .toEqual({ count: 1, lastDate: '2026-07-12', freezes: 0, freezeUsed: false });
  });

  it('no cambia si ya hubo lección hoy', () => {
    expect(applyLessonDay({ count: 4, lastDate: '2026-07-12', freezes: 1 }, '2026-07-12'))
      .toEqual({ count: 4, lastDate: '2026-07-12', freezes: 1, freezeUsed: false });
  });

  it('extiende la racha si la última lección fue ayer (incluye cambio de mes)', () => {
    expect(applyLessonDay({ count: 4, lastDate: '2026-06-30', freezes: 0 }, '2026-07-01'))
      .toEqual({ count: 5, lastDate: '2026-07-01', freezes: 0, freezeUsed: false });
  });

  it('cubre 1 día saltado consumiendo un congelador', () => {
    expect(applyLessonDay({ count: 4, lastDate: '2026-07-10', freezes: 2 }, '2026-07-12'))
      .toEqual({ count: 5, lastDate: '2026-07-12', freezes: 1, freezeUsed: true });
  });

  it('reinicia a 1 si se saltó un día sin congeladores', () => {
    expect(applyLessonDay({ count: 9, lastDate: '2026-07-10', freezes: 0 }, '2026-07-12'))
      .toEqual({ count: 1, lastDate: '2026-07-12', freezes: 0, freezeUsed: false });
  });

  it('reinicia a 1 si se saltaron 2+ días aunque haya congeladores', () => {
    expect(applyLessonDay({ count: 9, lastDate: '2026-07-08', freezes: 3 }, '2026-07-12'))
      .toEqual({ count: 1, lastDate: '2026-07-12', freezes: 3, freezeUsed: false });
  });
});
