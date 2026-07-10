import type { CEFRLevel, LearningLanguage } from '@lingoleap/core';
import { CEFR_LEVELS, LEARNING_LANGUAGES } from '@lingoleap/core';
import type { IngestCommand } from '../application/use-cases/ingest-content.use-case';

const USAGE = 'Uso: ingest --lang <en|pt-BR|it> --level <A1..C2> [--limit <n>]';

function readFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function parseIngestArgs(argv: string[]): IngestCommand {
  const lang = readFlag(argv, '--lang');
  const level = readFlag(argv, '--level');
  const limitRaw = readFlag(argv, '--limit');

  if (!lang || !(LEARNING_LANGUAGES as readonly string[]).includes(lang)) {
    throw new Error(USAGE);
  }
  if (!level || !(CEFR_LEVELS as readonly string[]).includes(level)) {
    throw new Error(USAGE);
  }
  let wordLimit: number | undefined;
  if (limitRaw !== undefined) {
    wordLimit = Number(limitRaw);
    if (!Number.isInteger(wordLimit) || wordLimit <= 0) {
      throw new Error(USAGE);
    }
  }
  return { language: lang as LearningLanguage, level: level as CEFRLevel, wordLimit };
}
