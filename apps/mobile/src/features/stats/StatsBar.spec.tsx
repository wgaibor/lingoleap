import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

jest.mock('../../app/api', () => ({ api: { getStats: jest.fn(), getLeague: jest.fn() } }));

import { api } from '../../app/api';
import { StatsBar } from './StatsBar';

const getStats = api.getStats as jest.Mock;
const getLeague = api.getLeague as jest.Mock;

async function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('StatsBar', () => {
  beforeEach(() => jest.clearAllMocks());

  it('muestra racha, corazones, gemas, congeladores, liga y nivel', async () => {
    getStats.mockResolvedValue({
      xp: 120,
      level: 2,
      xpIntoLevel: 20,
      xpToNextLevel: 180,
      streakCount: 3,
      streakFreezes: 1,
      gems: 7,
      hearts: 4,
      maxHearts: 5,
      nextHeartAt: null
    });
    getLeague.mockResolvedValue({ division: 'silver', cohort: null });
    await renderWithQuery(<StatsBar />);
    expect(await screen.findByText('🔥 3')).toBeTruthy();
    expect(screen.getByText('❤️ 4')).toBeTruthy();
    expect(screen.getByText('💎 7')).toBeTruthy();
    expect(screen.getByText('🧊 1')).toBeTruthy();
    expect(await screen.findByText('🏆 Plata')).toBeTruthy();
    expect(screen.getByText('⚡ Nivel 2')).toBeTruthy();
  });
});
