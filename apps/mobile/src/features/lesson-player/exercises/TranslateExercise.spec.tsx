import { fireEvent, render, screen } from '@testing-library/react-native';
import type { TranslateExercise as TranslateModel } from '@lingoleap/core';
import { TranslateExercise } from './TranslateExercise';

const exercise: TranslateModel = {
  id: 'e1',
  type: 'translate',
  sourceText: 'el gato',
  correctAnswer: 'the cat',
  wordBank: ['the', 'dog', 'cat'],
  audioUrl: null
};

describe('TranslateExercise', () => {
  it('arma la respuesta con fichas y resuelve true si coincide', async () => {
    const onResolve = jest.fn();
    await render(<TranslateExercise exercise={exercise} language="en" onResolve={onResolve} />);
    await fireEvent.press(screen.getByText('the'));
    await fireEvent.press(screen.getByText('cat'));
    await fireEvent.press(screen.getByText('Comprobar'));
    expect(onResolve).toHaveBeenCalledWith(true);
  });

  it('resuelve false con la respuesta incorrecta y permite devolver una ficha', async () => {
    const onResolve = jest.fn();
    await render(<TranslateExercise exercise={exercise} language="en" onResolve={onResolve} />);
    await fireEvent.press(screen.getByText('dog'));
    // Devuelve la ficha al banco (queda en la zona de respuesta → tap la saca).
    await fireEvent.press(screen.getByText('dog'));
    await fireEvent.press(screen.getByText('the'));
    await fireEvent.press(screen.getByText('dog'));
    await fireEvent.press(screen.getByText('Comprobar'));
    expect(onResolve).toHaveBeenCalledWith(false);
  });
});
