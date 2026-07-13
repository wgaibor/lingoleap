import { describe, expect, it } from 'vitest';
import { lessonXp, levelProgress, xpRequiredForLevel } from './xp';

describe('lessonXp', () => {
  it('da 15 XP sin errores y resta 1 por error hasta el piso de 10', () => {
    expect(lessonXp(0)).toBe(15);
    expect(lessonXp(3)).toBe(12);
    expect(lessonXp(5)).toBe(10);
    expect(lessonXp(20)).toBe(10);
  });

  it('trata entradas inválidas como 0 errores hacia abajo', () => {
    expect(lessonXp(-4)).toBe(15);
  });
});

describe('niveles', () => {
  it('la curva es exponencial: 0, 100, 300, 700', () => {
    expect(xpRequiredForLevel(1)).toBe(0);
    expect(xpRequiredForLevel(2)).toBe(100);
    expect(xpRequiredForLevel(3)).toBe(300);
    expect(xpRequiredForLevel(4)).toBe(700);
  });

  it('calcula nivel actual, XP dentro del nivel y XP restante', () => {
    expect(levelProgress(0)).toEqual({ level: 1, xpIntoLevel: 0, xpToNextLevel: 100 });
    expect(levelProgress(120)).toEqual({ level: 2, xpIntoLevel: 20, xpToNextLevel: 180 });
    expect(levelProgress(300)).toEqual({ level: 3, xpIntoLevel: 0, xpToNextLevel: 400 });
  });
});
