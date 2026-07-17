import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

jest.mock('../../app/api', () => ({
  api: {
    getCourse: jest.fn(),
    getCompletedLessonIds: jest.fn(),
    getStats: jest.fn(),
    getLeague: jest.fn()
  }
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({ language: 'en', level: 'A1' })
}));

import { api } from '../../app/api';
import { CoursePathScreen } from './CoursePathScreen';

const getCourse = api.getCourse as jest.Mock;
const getCompletedLessonIds = api.getCompletedLessonIds as jest.Mock;
const getStats = api.getStats as jest.Mock;
const getLeague = api.getLeague as jest.Mock;

async function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const course = {
  id: 'c1',
  language: 'en',
  level: 'A1',
  title: 'Inglés A1',
  units: [
    {
      id: 'u1',
      title: 'Unidad 1',
      position: 1,
      lessons: [
        { id: 'l1', title: 'Lección 1', position: 1, exercises: [] },
        { id: 'l2', title: 'Lección 2', position: 2, exercises: [] },
        { id: 'l3', title: 'Lección 3', position: 3, exercises: [] }
      ]
    }
  ]
};

describe('CoursePathScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marca completada, desbloqueada y bloqueada según el progreso', async () => {
    getCourse.mockResolvedValue(course);
    getCompletedLessonIds.mockResolvedValue(['l1']);
    getStats.mockResolvedValue({
      xp: 0,
      level: 1,
      xpIntoLevel: 0,
      xpToNextLevel: 100,
      streakCount: 0,
      streakFreezes: 0,
      gems: 0,
      hearts: 5,
      maxHearts: 5,
      nextHeartAt: null
    });
    getLeague.mockResolvedValue({ division: 'bronze', cohort: null });
    await renderWithQuery(<CoursePathScreen />);
    expect(await screen.findByText('Inglés A1')).toBeTruthy();
    expect(screen.getByTestId('lesson-l1-completed')).toBeTruthy();
    expect(screen.getByTestId('lesson-l2-unlocked')).toBeTruthy();
    expect(screen.getByTestId('lesson-l3-locked')).toBeTruthy();
  });
});
