import { fireEvent, render, screen } from '@testing-library/react-native';
import { CompletionScreen } from './CompletionScreen';

describe('CompletionScreen', () => {
  it('muestra recompensas, logros y contadores', async () => {
    await render(
      <CompletionScreen
        correctCount={5}
        wrongCount={1}
        onBack={jest.fn()}
        rewards={{
          xpEarned: 12,
          totalXp: 112,
          level: 2,
          streakCount: 3,
          freezeUsed: true,
          hearts: 4,
          gemsEarned: 5,
          achievementsUnlocked: [{ id: 'streak-3', category: 'streak', threshold: 3, gems: 5 }]
        }}
      />
    );
    expect(screen.getByText('+12 XP')).toBeTruthy();
    expect(screen.getByText(/Racha: 3 días/)).toBeTruthy();
    expect(screen.getByText(/congelador salvó tu racha/)).toBeTruthy();
    expect(screen.getByText(/Racha de 3 días/)).toBeTruthy();
    expect(screen.getByText('Aciertos: 5')).toBeTruthy();
    expect(screen.getByText('Errores: 1')).toBeTruthy();
  });

  it('con saveError muestra reintento y lo dispara', async () => {
    const onRetry = jest.fn();
    await render(<CompletionScreen correctCount={1} wrongCount={0} onBack={jest.fn()} saveError onRetry={onRetry} />);
    expect(screen.getByText('No pudimos guardar tu progreso.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Reintentar'));
    expect(onRetry).toHaveBeenCalled();
  });
});
