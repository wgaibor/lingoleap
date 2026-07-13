import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const getStats = vi.hoisted(() => vi.fn());
vi.mock('../../app/api', () => ({ api: { getStats } }));

import { StatsBar } from './StatsBar';
import { renderWithProviders } from '../../test/render';

describe('StatsBar', () => {
  it('muestra racha, corazones, gemas y nivel con su progreso', async () => {
    getStats.mockResolvedValue({
      xp: 120, level: 2, xpIntoLevel: 20, xpToNextLevel: 180,
      streakCount: 3, streakFreezes: 0, gems: 0,
      hearts: 4, maxHearts: 5, nextHeartAt: null
    });
    renderWithProviders(<StatsBar />, { route: '/' });
    expect(await screen.findByText('🔥 3')).toBeInTheDocument();
    expect(screen.getByText('❤️ 4')).toBeInTheDocument();
    expect(screen.getByText('💎 0')).toBeInTheDocument();
    expect(screen.getByText('⚡ Nivel 2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progreso del nivel 2' })).toBeInTheDocument();
  });
});
