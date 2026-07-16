import { describe, expect, it } from 'vitest';
import { applyLessonDay, buyStreakFreeze } from './streak';

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

describe('buyStreakFreeze', () => {
  it('compra exitosa con gemas exactas: resta el precio y suma un congelador', () => {
    expect(buyStreakFreeze({ gems: 10, streakFreezes: 0 }))
      .toEqual({ ok: true, gems: 0, streakFreezes: 1 });
  });

  it('compra exitosa con más gemas de las necesarias', () => {
    expect(buyStreakFreeze({ gems: 25, streakFreezes: 1 }))
      .toEqual({ ok: true, gems: 15, streakFreezes: 2 });
  });

  it('rechaza con gemas insuficientes (un gema menos del precio)', () => {
    expect(buyStreakFreeze({ gems: 9, streakFreezes: 0 }))
      .toEqual({ ok: false, reason: 'insufficient-gems' });
  });

  it('rechaza al llegar al tope aunque sobren gemas', () => {
    expect(buyStreakFreeze({ gems: 100, streakFreezes: 2 }))
      .toEqual({ ok: false, reason: 'max-freezes-reached' });
  });

  it('prioriza el motivo de tope sobre el de gemas si ambos fallan a la vez', () => {
    expect(buyStreakFreeze({ gems: 0, streakFreezes: 2 }))
      .toEqual({ ok: false, reason: 'max-freezes-reached' });
  });
});
