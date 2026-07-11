import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithPassword = vi.fn();
const signInWithOAuth = vi.fn();
vi.mock('../../app/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
      signUp: vi.fn(),
      signInWithOAuth: (...a: unknown[]) => signInWithOAuth(...a),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    }
  }
}));

import { LoginPage } from './LoginPage';
import { renderWithProviders } from '../../test/render';

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('envía email y contraseña al iniciar sesión', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreta123');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secreta123' });
  });

  it('muestra el error en español si las credenciales fallan', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Correo o contraseña incorrectos')).toBeInTheDocument();
  });

  it('dispara el flujo de Google', async () => {
    signInWithOAuth.mockResolvedValue({ error: null });
    renderWithProviders(<LoginPage />);
    await userEvent.click(screen.getByRole('button', { name: /Google/ }));
    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' })
    );
  });
});
