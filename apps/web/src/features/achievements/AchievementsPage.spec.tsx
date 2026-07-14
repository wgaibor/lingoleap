import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const getAchievements = vi.hoisted(() => vi.fn());
vi.mock('../../app/api', () => ({ api: { getAchievements } }));

import { AchievementsPage } from './AchievementsPage';
import { renderWithProviders } from '../../test/render';

describe('AchievementsPage', () => {
  it('agrupa los logros por categoría y marca cuáles están desbloqueados', async () => {
    getAchievements.mockResolvedValue([
      { id: 'streak-3', category: 'streak', threshold: 3, gems: 5, unlocked: true },
      { id: 'streak-7', category: 'streak', threshold: 7, gems: 15, unlocked: false },
      { id: 'lessons-10', category: 'lessons', threshold: 10, gems: 5, unlocked: false }
    ]);
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
    renderWithProviders(<AchievementsPage />, { route: '/achievements' });
    expect(await screen.findByText('No pudimos cargar tus logros.')).toBeInTheDocument();
  });
});
