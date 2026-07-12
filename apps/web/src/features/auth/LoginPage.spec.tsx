import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithPassword = vi.fn();
const signUp = vi.fn();
const signInWithOAuth = vi.fn();
vi.mock('../../app/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
      signUp: (...a: unknown[]) => signUp(...a),
      signInWithOAuth: (...a: unknown[]) => signInWithOAuth(...a),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    }
  }
}));

import { LoginPage } from './LoginPage';
import { AuthProvider } from './AuthProvider';
import { renderWithProviders } from '../../test/render';

async function switchToRegister() {
  await userEvent.click(screen.getByRole('tab', { name: 'Crear cuenta' }));
}

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

  it('navega a inicio si el registro crea una sesión (confirmación de email deshabilitada)', async () => {
    signUp.mockResolvedValue({
      data: { user: { id: 'u1' }, session: { access_token: 'tok' } },
      error: null
    });
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<p>Inicio</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    await switchToRegister();
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'nuevo@correo.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreta123');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText('Inicio')).toBeInTheDocument();
  });

  it('muestra mensaje de éxito y limpia el formulario si el registro requiere confirmar el correo', async () => {
    signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null });
    renderWithProviders(<LoginPage />);
    await switchToRegister();
    const emailInput = screen.getByLabelText('Correo electrónico');
    const passwordInput = screen.getByLabelText('Contraseña');
    await userEvent.type(emailInput, 'nuevo@correo.com');
    await userEvent.type(passwordInput, 'secreta123');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(
      await screen.findByText('Cuenta creada. Revisa tu correo para confirmarla.')
    ).toBeInTheDocument();
    expect(emailInput).toHaveValue('');
    expect(passwordInput).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
