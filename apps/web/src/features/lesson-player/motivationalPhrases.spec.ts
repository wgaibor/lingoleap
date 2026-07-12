import { describe, expect, it } from 'vitest';
import { motivationalPhrase } from './motivationalPhrases';

describe('motivationalPhrase', () => {
  it('devuelve una frase para el primer ejercicio', () => {
    expect(motivationalPhrase(0)).toBe('¡Sigue así!');
  });

  it('devuelve una frase distinta para el segundo ejercicio', () => {
    expect(motivationalPhrase(1)).toBe('¡Vas muy bien!');
  });

  it('rota de forma determinista al superar la cantidad de frases', () => {
    expect(motivationalPhrase(4)).toBe(motivationalPhrase(0));
  });
});
