import { describe, expect, it } from 'vitest';
import { canStartLesson, loseHearts, nextHeartAt, regenerateHearts } from './hearts';

describe('regenerateHearts', () => {
  it('suma 1 corazón por cada 4 horas transcurridas, conservando el resto del tiempo', () => {
    const state = { hearts: 2, updatedAt: '2026-07-12T00:00:00.000Z' };
    expect(regenerateHearts(state, '2026-07-12T09:00:00.000Z')).toEqual({
      hearts: 4,
      updatedAt: '2026-07-12T08:00:00.000Z'
    });
  });

  it('no pasa del máximo de 5 y reancla el contador al llegar al tope', () => {
    const state = { hearts: 4, updatedAt: '2026-07-12T00:00:00.000Z' };
    expect(regenerateHearts(state, '2026-07-12T23:00:00.000Z')).toEqual({
      hearts: 5,
      updatedAt: '2026-07-12T23:00:00.000Z'
    });
  });

  it('no cambia nada si no ha pasado un ciclo completo', () => {
    const state = { hearts: 3, updatedAt: '2026-07-12T00:00:00.000Z' };
    expect(regenerateHearts(state, '2026-07-12T03:59:59.000Z')).toEqual(state);
  });
});

describe('loseHearts / canStartLesson / nextHeartAt', () => {
  it('resta errores sin bajar de 0', () => {
    expect(loseHearts(5, 2)).toBe(3);
    expect(loseHearts(1, 4)).toBe(0);
  });

  it('sin corazones solo permite repaso de lecciones completadas', () => {
    expect(canStartLesson(0, false)).toBe(false);
    expect(canStartLesson(0, true)).toBe(true);
    expect(canStartLesson(1, false)).toBe(true);
  });

  it('anuncia cuándo llega el próximo corazón, o null si está lleno', () => {
    expect(nextHeartAt({ hearts: 2, updatedAt: '2026-07-12T08:00:00.000Z' })).toBe('2026-07-12T12:00:00.000Z');
    expect(nextHeartAt({ hearts: 5, updatedAt: '2026-07-12T08:00:00.000Z' })).toBeNull();
  });
});
