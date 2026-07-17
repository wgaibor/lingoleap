import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('../../app/supabase', () => ({
  supabase: { auth: { getSession: jest.fn(), onAuthStateChange: jest.fn(), signOut: jest.fn() } }
}));

import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';
import { supabase } from '../../app/supabase';

const mockGetSession = supabase.auth.getSession as jest.Mock;
const mockOnAuthStateChange = supabase.auth.onAuthStateChange as jest.Mock;

function Probe() {
  const { session, loading } = useAuth();
  if (loading) return <Text>cargando</Text>;
  return <Text>{session ? 'con-sesion' : 'sin-sesion'}</Text>;
}

describe('AuthProvider', () => {
  it('expone la sesión inicial de Supabase', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    // Timeout amplio: en CI (2 cores, suites en paralelo) el flush del update
    // asíncrono de getSession puede tardar más que los 5s por defecto de waitFor.
    await waitFor(() => expect(screen.getByText('con-sesion')).toBeTruthy(), { timeout: 15000 });
  });

  it('expone null cuando no hay sesión', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('sin-sesion')).toBeTruthy(), { timeout: 15000 });
  });
});
