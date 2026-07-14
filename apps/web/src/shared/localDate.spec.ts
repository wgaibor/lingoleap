import { describe, expect, it } from 'vitest';
import { localDateString } from './localDate';

describe('localDateString', () => {
  it('formatea la fecha local como YYYY-MM-DD con ceros', () => {
    expect(localDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(localDateString(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});
