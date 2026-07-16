import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { getStats, getLeague } = vi.hoisted(() => ({ getStats: vi.fn(), getLeague: vi.fn() }));
vi.mock('../../app/api', () => ({ api: { getStats, getLeague } }));

import { StatsBar } from './StatsBar';
import { renderWithProviders } from '../../test/render';

describe('StatsBar', () => {
  it('muestra racha, corazones, gemas, congeladores, liga y nivel con su progreso', async () => {
    getStats.mockResolvedValue({
      xp: 120, level: 2, xpIntoLevel: 20, xpToNextLevel: 180,
      streakCount: 3, streakFreezes: 1, gems: 0,
      hearts: 4, maxHearts: 5, nextHeartAt: null
    });
    getLeague.mockResolvedValue({ division: 'silver', cohort: null });
    renderWithProviders(<StatsBar />, { route: '/' });
    expect(await screen.findByText('🔥 3')).toBeInTheDocument();
    expect(screen.getByText('❤️ 4')).toBeInTheDocument();
    expect(screen.getByText('💎 0')).toBeInTheDocument();
    expect(screen.getByText('🧊 1')).toBeInTheDocument();
    expect(await screen.findByText('🏆 Plata')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /🏆 Plata/ })).toHaveAttribute('href', '/league');
    expect(screen.getByText('⚡ Nivel 2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progreso del nivel 2' })).toBeInTheDocument();
  });
});
