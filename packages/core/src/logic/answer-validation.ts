export function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,;:!?¿¡"()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTokenAnswerCorrect(correctText: string, chosenTokens: string[]): boolean {
  return normalizeAnswer(chosenTokens.join(' ')) === normalizeAnswer(correctText);
}
