import { theme } from './theme';

describe('theme', () => {
  it('traduce los tokens de @lingoleap/tokens 1:1', () => {
    expect(theme.colors.primary).toBe('#58CC02');
    expect(theme.colors.danger).toBe('#FF4B4B');
    expect(theme.space.md).toBe(16);
    expect(theme.radius.md).toBe(12);
  });
});
