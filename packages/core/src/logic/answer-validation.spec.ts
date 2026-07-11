import { describe, expect, it } from 'vitest';
import { isTokenAnswerCorrect, normalizeAnswer } from './answer-validation';

describe('normalizeAnswer', () => {
  it('ignora mayúsculas, puntuación y espacios extra, conserva tildes', () => {
    expect(normalizeAnswer('  Yo  bebo agua, ¡cada día! ')).toBe('yo bebo agua cada día');
  });
});

describe('isTokenAnswerCorrect', () => {
  it('acepta los tokens correctos en orden', () => {
    expect(isTokenAnswerCorrect('Yo bebo agua.', ['Yo', 'bebo', 'agua'])).toBe(true);
  });
  it('rechaza orden incorrecto y tokens faltantes', () => {
    expect(isTokenAnswerCorrect('Yo bebo agua.', ['bebo', 'Yo', 'agua'])).toBe(false);
    expect(isTokenAnswerCorrect('Yo bebo agua.', ['Yo', 'bebo'])).toBe(false);
  });
});
