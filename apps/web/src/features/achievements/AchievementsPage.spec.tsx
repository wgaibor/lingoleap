import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const { getAchievements, getStats, buyStreakFreeze } = vi.hoisted(() => ({
  getAchievements: vi.fn(),
  getStats: vi.fn(),
  buyStreakFreeze: vi.fn()
}));
vi.mock('../../app/api', () => ({ api: { getAchievements, getStats, buyStreakFreeze } }));

import { AchievementsPage } from './AchievementsPage';
import { renderWithProviders } from '../../test/render';

const statsFixture = {
  xp: 0, level: 1, xpIntoLevel: 0, xpToNextLevel: 100,
  streakCount: 3, streakFreezes: 0, gems: 20,
  hearts: 5, maxHearts: 5, nextHeartAt: null
};

describe('AchievementsPage', () => {
  it('agrupa los logros por categoría y marca cuáles están desbloqueados', async () => {
    getAchievements.mockResolvedValue([
      { id: 'streak-3', category: 'streak', threshold: 3, gems: 5, unlocked: true },
      { id: 'streak-7', category: 'streak', threshold: 7, gems: 15, unlocked: false },
      { id: 'lessons-10', category: 'lessons', threshold: 10, gems: 5, unlocked: false }
    ]);
    getStats.mockResolvedValue(statsFixture);
    renderWithProviders(<AchievementsPage />, { route: '/achievements' });
    expect(await screen.findByText('Racha de 3 días')).toBeInTheDocument();
    expect(screen.getByText('Lecciones completadas')).toBeInTheDocument();
    const unlockedItem = screen.getByText('Racha de 3 días').closest('li');
    expect(unlockedItem).toHaveTextContent('✅');
    const lockedItem = screen.getByText('Racha de 7 días').closest('li');
    expect(lockedItem).toHaveTextContent('🔒');
  });

  it('muestra un error si falla la carga', async () => {
    getAchievements.mockRejectedValue(new Error('network'));
    getStats.mockResolvedValue(statsFixture);
    renderWithProviders(<AchievementsPage />, { route: '/achievements' });
    expect(await screen.findByText('No pudimos cargar tus logros.')).toBeInTheDocument();
  });

  it('muestra el precio y permite comprar un congelador con gemas suficientes', async () => {
    getAchievements.mockResolvedValue([]);
    getStats.mockResolvedValueOnce(statsFixture)
      .mockResolvedValueOnce({ ...statsFixture, gems: 10, streakFreezes: 1 });
    buyStreakFreeze.mockResolvedValue({ ...statsFixture, gems: 10, streakFreezes: 1 });
    renderWithProviders(<AchievementsPage />, { route: '/achievements' });

    expect(await screen.findByText(/🧊 0 congeladores/)).toBeInTheDocument();
    expect(screen.getByText(/💎 20 gemas/)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Comprar congelador (10💎)' });
    expect(button).toBeEnabled();

    await userEvent.click(button);
    expect(buyStreakFreeze).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText(/🧊 1 congeladores/)).toBeInTheDocument());
  });

  it('deshabilita comprar sin gemas suficientes', async () => {
    getAchievements.mockResolvedValue([]);
    getStats.mockResolvedValue({ ...statsFixture, gems: 5 });
    renderWithProviders(<AchievementsPage />, { route: '/achievements' });
    const button = await screen.findByRole('button', { name: 'Comprar congelador (10💎)' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Necesitás 10💎.')).toBeInTheDocument();
  });

  it('deshabilita comprar al llegar al tope de congeladores', async () => {
    getAchievements.mockResolvedValue([]);
    getStats.mockResolvedValue({ ...statsFixture, streakFreezes: 2 });
    renderWithProviders(<AchievementsPage />, { route: '/achievements' });
    const button = await screen.findByRole('button', { name: 'Comprar congelador (10💎)' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Ya tenés el máximo de congeladores.')).toBeInTheDocument();
  });
});
