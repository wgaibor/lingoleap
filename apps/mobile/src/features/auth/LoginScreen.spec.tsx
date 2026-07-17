import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('../../app/supabase', () => ({
  supabase: { auth: { signInWithPassword: jest.fn(), signUp: jest.fn() } }
}));

import { LoginScreen } from './LoginScreen';
import { supabase } from '../../app/supabase';

const signInWithPassword = supabase.auth.signInWithPassword as jest.Mock;
const signUp = supabase.auth.signUp as jest.Mock;

describe('LoginScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('envía email y contraseña al iniciar sesión', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    render(<LoginScreen />);
    await waitFor(() => expect(screen.getByPlaceholderText('Correo electrónico')).toBeTruthy());
    fireEvent.changeText(screen.getByPlaceholderText('Correo electrónico'), 'ana@test.com');
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Correo electrónico').props.value).toBe('ana@test.com')
    );
    fireEvent.changeText(screen.getByPlaceholderText('Contraseña'), 'secreta1');
    await waitFor(() => expect(screen.getByPlaceholderText('Contraseña').props.value).toBe('secreta1'));
    fireEvent.press(screen.getByTestId('submit'));
    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith({ email: 'ana@test.com', password: 'secreta1' })
    );
  });

  it('muestra el error en español si las credenciales fallan', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    render(<LoginScreen />);
    await waitFor(() => expect(screen.getByPlaceholderText('Correo electrónico')).toBeTruthy());
    fireEvent.changeText(screen.getByPlaceholderText('Correo electrónico'), 'ana@test.com');
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Correo electrónico').props.value).toBe('ana@test.com')
    );
    fireEvent.changeText(screen.getByPlaceholderText('Contraseña'), 'mala');
    await waitFor(() => expect(screen.getByPlaceholderText('Contraseña').props.value).toBe('mala'));
    fireEvent.press(screen.getByTestId('submit'));
    await waitFor(() => expect(screen.getByText('Correo o contraseña incorrectos')).toBeTruthy());
  });

  it('en modo registro sin sesión muestra el aviso de confirmación y limpia el formulario', async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    render(<LoginScreen />);
    await waitFor(() => expect(screen.getByText('Crear cuenta')).toBeTruthy());
    fireEvent.press(screen.getByText('Crear cuenta'));
    await waitFor(() => expect(screen.getByPlaceholderText('Correo electrónico')).toBeTruthy());
    fireEvent.changeText(screen.getByPlaceholderText('Correo electrónico'), 'ana@test.com');
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Correo electrónico').props.value).toBe('ana@test.com')
    );
    fireEvent.changeText(screen.getByPlaceholderText('Contraseña'), 'secreta1');
    await waitFor(() => expect(screen.getByPlaceholderText('Contraseña').props.value).toBe('secreta1'));
    fireEvent.press(screen.getByTestId('submit'));
    await waitFor(() =>
      expect(screen.getByText('Cuenta creada. Revisa tu correo para confirmarla.')).toBeTruthy()
    );
    expect(screen.getByPlaceholderText('Correo electrónico').props.value).toBe('');
  });
});
