import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

jest.mock('../../app/api', () => ({ api: { listCourses: jest.fn() } }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

import { CoursesScreen } from './CoursesScreen';
import { api } from '../../app/api';

const listCourses = api.listCourses as jest.Mock;

async function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('CoursesScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lista los cursos devueltos por el API', async () => {
    listCourses.mockResolvedValue([
      { id: 'en-A1', language: 'en', level: 'A1', title: 'Inglés A1' }
    ]);
    await renderWithQuery(<CoursesScreen />);
    expect(await screen.findByText('Inglés A1')).toBeTruthy();
  });

  it('muestra un error si falla la carga', async () => {
    listCourses.mockRejectedValue(new Error('network'));
    await renderWithQuery(<CoursesScreen />);
    expect(await screen.findByText('No pudimos cargar los cursos')).toBeTruthy();
  });
});
