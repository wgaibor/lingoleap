import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';
import { renderWithProviders } from './test/render';

describe('App', () => {
  it('renderiza el título', () => {
    renderWithProviders(<App />);
    expect(screen.getByText('LingoLeap')).toBeInTheDocument();
  });
});
