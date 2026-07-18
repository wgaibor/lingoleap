const FRASES = ['¡Sigue así!', '¡Vas muy bien!', '¡Excelente!', '¡Un paso más cerca!'];

/** Rota las frases motivacionales de forma determinista según el índice del ejercicio. */
export function motivationalPhrase(exerciseIndex: number): string {
  return FRASES[exerciseIndex % FRASES.length];
}
