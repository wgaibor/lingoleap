import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const getLeague = vi.hoisted(() => vi.fn());
vi.mock('../../app/api', () => ({ api: { getLeague } }));

import { LeaguePage } from './LeaguePage';
import { renderWithProviders } from '../../test/render';

describe('LeaguePage', () => {
  it('muestra la tabla con posiciones, zonas y la fila propia resaltada', async () => {
    getLeague.mockResolvedValue({
      division: 'silver',
      cohort: {
        weekStart: '2026-07-13',
        standings: [
          { position: 1, displayName: 'bo', weeklyXp: 40, isMe: false, zone: 'promotion' },
          { position: 2, displayName: 'ana', weeklyXp: 10, isMe: true, zone: 'promotion' }
        ]
      }
    });
    renderWithProviders(<LeaguePage />, { route: '/league' });
    expect(await screen.findByText('Liga Plata')).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1); // sin el header
    expect(rows[0]).toHaveTextContent('bo');
    expect(rows[0]).toHaveTextContent('40 XP');
    expect(rows[1]).toHaveTextContent('ana');
    expect(rows[1]).toHaveClass('league-row-me');
    expect(rows[0]).toHaveClass('league-row-promotion');
  });

  it('muestra el estado vacío si aún no hay cohorte esta semana', async () => {
    getLeague.mockResolvedValue({ division: 'bronze', cohort: null });
    renderWithProviders(<LeaguePage />, { route: '/league' });
    expect(await screen.findByText('Liga Bronce')).toBeInTheDocument();
    expect(screen.getByText('Completá una lección para entrar a la liga.')).toBeInTheDocument();
  });

  it('muestra un error si falla la carga', async () => {
    getLeague.mockRejectedValue(new Error('network'));
    renderWithProviders(<LeaguePage />, { route: '/league' });
    expect(await screen.findByText('No pudimos cargar tu liga.')).toBeInTheDocument();
  });
});
