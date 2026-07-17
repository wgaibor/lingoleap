import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { MatchPairsExercise as MatchPairsModel } from '@lingoleap/core';
import { MatchPairsExercise } from './MatchPairsExercise';

const exercise: MatchPairsModel = {
  id: 'e1',
  type: 'match-pairs',
  pairs: [
    { left: 'gato', right: 'cat' },
    { left: 'perro', right: 'dog' }
  ]
};

describe('MatchPairsExercise', () => {
  it('resuelve true al emparejar todos los pares', async () => {
    const onResolve = jest.fn();
    await render(<MatchPairsExercise exercise={exercise} onResolve={onResolve} />);
    await fireEvent.press(screen.getByText('gato'));
    await fireEvent.press(screen.getByText('cat'));
    expect(onResolve).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('perro'));
    await fireEvent.press(screen.getByText('dog'));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith(true);
  });

  it('un par incorrecto no resuelve y se des-selecciona tras el flash', async () => {
    jest.useFakeTimers();
    const onResolve = jest.fn();
    await render(<MatchPairsExercise exercise={exercise} onResolve={onResolve} />);
    await fireEvent.press(screen.getByText('gato'));
    await fireEvent.press(screen.getByText('dog'));
    expect(onResolve).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    // Tras el flash se puede emparejar bien.
    await fireEvent.press(screen.getByText('gato'));
    await fireEvent.press(screen.getByText('cat'));
    await fireEvent.press(screen.getByText('perro'));
    await fireEvent.press(screen.getByText('dog'));
    expect(onResolve).toHaveBeenCalledWith(true);
    jest.useRealTimers();
  });
});
