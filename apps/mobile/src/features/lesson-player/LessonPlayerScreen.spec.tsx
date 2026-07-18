import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

jest.mock('../../app/api', () => ({
  api: {
    getLesson: jest.fn(),
    getStats: jest.fn(),
    getCompletedLessonIds: jest.fn(),
    completeLesson: jest.fn()
  }
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ lessonId: 'l1', lang: 'en' })
}));

import { api } from '../../app/api';
import { useSessionStore } from './sessionStore';
import { LessonPlayerScreen } from './LessonPlayerScreen';

const getLesson = api.getLesson as jest.Mock;
const getStats = api.getStats as jest.Mock;
const getCompletedLessonIds = api.getCompletedLessonIds as jest.Mock;
const completeLesson = api.completeLesson as jest.Mock;

const statsFixture = {
  xp: 0, level: 1, xpIntoLevel: 0, xpToNextLevel: 100,
  streakCount: 0, streakFreezes: 0, gems: 0,
  hearts: 5, maxHearts: 5, nextHeartAt: null
};

const lesson = {
  id: 'l1',
  title: 'Lección 1',
  position: 1,
  exercises: [
    { id: 'e1', type: 'translate', sourceText: 'el gato', correctAnswer: 'the cat', wordBank: ['the', 'cat'], audioUrl: null }
  ]
};

const rewardsFixture = {
  xpEarned: 12, totalXp: 12, level: 1, streakCount: 1,
  freezeUsed: false, hearts: 5, gemsEarned: 0, achievementsUnlocked: []
};

async function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const WAIT = { timeout: 15000 } as const;

describe('LessonPlayerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.getState().reset();
  });

  it('flujo feliz: ejercicio → feedback → completar → recompensas', async () => {
    getLesson.mockResolvedValue(lesson);
    getStats.mockResolvedValue(statsFixture);
    getCompletedLessonIds.mockResolvedValue([]);
    completeLesson.mockResolvedValue(rewardsFixture);
    await renderWithQuery(<LessonPlayerScreen />);
    await waitFor(() => expect(screen.getByText('el gato')).toBeTruthy(), WAIT);
    await fireEvent.press(screen.getByText('the'));
    await fireEvent.press(screen.getByText('cat'));
    await fireEvent.press(screen.getByText('Comprobar'));
    expect(screen.getByText('¡Correcto!')).toBeTruthy();
    await fireEvent.press(screen.getByText('Continuar'));
    await waitFor(() => expect(screen.getByText('¡Lección completada!')).toBeTruthy(), WAIT);
    await waitFor(() => expect(screen.getByText('+12 XP')).toBeTruthy(), WAIT);
    expect(completeLesson).toHaveBeenCalledTimes(1);
    expect(completeLesson.mock.calls[0][0]).toBe('l1');
    expect(completeLesson.mock.calls[0][1].errorCount).toBe(0);
  });

  it('sin corazones y lección no completada → pantalla de bloqueo', async () => {
    getLesson.mockResolvedValue(lesson);
    getStats.mockResolvedValue({ ...statsFixture, hearts: 0, nextHeartAt: '2026-07-17T18:00:00.000Z' });
    getCompletedLessonIds.mockResolvedValue([]);
    await renderWithQuery(<LessonPlayerScreen />);
    await waitFor(() => expect(screen.getByText('Te quedaste sin corazones')).toBeTruthy(), WAIT);
  });

  it('sin corazones pero lección ya completada → se puede repasar', async () => {
    getLesson.mockResolvedValue(lesson);
    getStats.mockResolvedValue({ ...statsFixture, hearts: 0 });
    getCompletedLessonIds.mockResolvedValue(['l1']);
    await renderWithQuery(<LessonPlayerScreen />);
    await waitFor(() => expect(screen.getByText('el gato')).toBeTruthy(), WAIT);
  });

  it('error al cargar la lección (id inexistente incluido) → mensaje de error', async () => {
    getLesson.mockRejectedValue(new Error('LESSON_NOT_FOUND'));
    getStats.mockResolvedValue(statsFixture);
    getCompletedLessonIds.mockResolvedValue([]);
    await renderWithQuery(<LessonPlayerScreen />);
    await waitFor(() => expect(screen.getByText('No pudimos cargar la lección')).toBeTruthy(), WAIT);
  });

  it('fallo del guardado → error con reintento que vuelve a llamar la API', async () => {
    getLesson.mockResolvedValue(lesson);
    getStats.mockResolvedValue(statsFixture);
    getCompletedLessonIds.mockResolvedValue([]);
    completeLesson.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(rewardsFixture);
    await renderWithQuery(<LessonPlayerScreen />);
    await waitFor(() => expect(screen.getByText('el gato')).toBeTruthy(), WAIT);
    await fireEvent.press(screen.getByText('the'));
    await fireEvent.press(screen.getByText('cat'));
    await fireEvent.press(screen.getByText('Comprobar'));
    await fireEvent.press(screen.getByText('Continuar'));
    await waitFor(() => expect(screen.getByText('No pudimos guardar tu progreso.')).toBeTruthy(), WAIT);
    await fireEvent.press(screen.getByText('Reintentar'));
    await waitFor(() => expect(completeLesson).toHaveBeenCalledTimes(2), WAIT);
    await waitFor(() => expect(screen.getByText('+12 XP')).toBeTruthy(), WAIT);
  });
});
