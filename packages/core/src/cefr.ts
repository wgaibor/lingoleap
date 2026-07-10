import type { CEFRLevel } from './types';

export interface FrequencyBand {
  start: number;
  end: number;
}

const BANDS: Record<CEFRLevel, FrequencyBand> = {
  A1: { start: 1, end: 800 },
  A2: { start: 801, end: 1800 },
  B1: { start: 1801, end: 3200 },
  B2: { start: 3201, end: 5000 },
  C1: { start: 5001, end: 8000 },
  C2: { start: 8001, end: 12000 }
};

export function frequencyBandFor(level: CEFRLevel): FrequencyBand {
  return BANDS[level];
}
