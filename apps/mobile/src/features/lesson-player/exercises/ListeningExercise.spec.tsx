import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Speech from 'expo-speech';
import type { ListeningExercise as ListeningModel } from '@lingoleap/core';
import { ListeningExercise } from './ListeningExercise';

const exercise: ListeningModel = {
  id: 'e1',
  type: 'listening',
  text: 'good morning',
  wordBank: ['good', 'night', 'morning']
};

describe('ListeningExercise', () => {
  beforeEach(() => jest.clearAllMocks());

  it('el botón de audio dispara TTS con el texto del ejercicio', async () => {
    await render(<ListeningExercise exercise={exercise} language="en" onResolve={jest.fn()} />);
    await fireEvent.press(screen.getByText(/Escucha/));
    expect(Speech.speak).toHaveBeenCalledWith('good morning', { language: 'en-US', rate: 0.95 });
  });

  it('resuelve true al armar el texto correcto', async () => {
    const onResolve = jest.fn();
    await render(<ListeningExercise exercise={exercise} language="en" onResolve={onResolve} />);
    await fireEvent.press(screen.getByText('good'));
    await fireEvent.press(screen.getByText('morning'));
    await fireEvent.press(screen.getByText('Comprobar'));
    expect(onResolve).toHaveBeenCalledWith(true);
  });
});
