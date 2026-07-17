import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ImageSelectExercise as ImageSelectModel } from '@lingoleap/core';
import { ImageSelectExercise } from './ImageSelectExercise';

const exercise: ImageSelectModel = {
  id: 'e1',
  type: 'image-select',
  prompt: 'cat',
  options: [
    { label: 'gato', imageUrl: 'https://img/cat.jpg', correct: true },
    { label: 'perro', imageUrl: 'https://img/dog.jpg', correct: false }
  ]
};

describe('ImageSelectExercise', () => {
  it('Comprobar está deshabilitado sin selección y resuelve true con la opción correcta', async () => {
    const onResolve = jest.fn();
    await render(<ImageSelectExercise exercise={exercise} onResolve={onResolve} />);
    fireEvent.press(screen.getByText('Comprobar'));
    expect(onResolve).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('gato'));
    fireEvent.press(screen.getByText('Comprobar'));
    expect(onResolve).toHaveBeenCalledWith(true);
  });

  it('resuelve false con la opción incorrecta', async () => {
    const onResolve = jest.fn();
    await render(<ImageSelectExercise exercise={exercise} onResolve={onResolve} />);
    fireEvent.press(screen.getByText('perro'));
    fireEvent.press(screen.getByText('Comprobar'));
    expect(onResolve).toHaveBeenCalledWith(false);
  });
});
