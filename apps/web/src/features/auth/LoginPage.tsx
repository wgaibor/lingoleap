import { useState, type FormEvent } from 'react';
import { supabase } from '../../app/supabase';

type Mode = 'login' | 'register';

function mapAuthError(message: string | undefined): string {
  if (message === 'Invalid login credentials') return 'Correo o contraseña incorrectos';
  if (message === 'User already registered') return 'Ese correo ya tiene cuenta';
  return 'Algo salió mal, intenta de nuevo';
}

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) setError(mapAuthError(signInError.message));
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) {
          setError(mapAuthError(signUpError.message));
        } else if (!data?.session) {
          setInfo('Revisa tu correo para confirmar la cuenta');
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setInfo(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    if (oauthError) setError(mapAuthError(oauthError.message));
  }

  return (
    <div className="container" style={{ maxWidth: 360 }}>
      <div
        role="tablist"
        aria-label="Modo de acceso"
        style={{ display: 'flex', gap: 'var(--space-xs)', marginBottom: 'var(--space-md)' }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          onClick={() => switchMode('login')}
          className="button-secondary"
          style={{
            flex: 1,
            background: mode === 'login' ? 'var(--color-primary)' : 'var(--color-surface)',
            color: mode === 'login' ? 'var(--color-surface)' : 'var(--color-text)'
          }}
        >
          Entrar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          onClick={() => switchMode('register')}
          className="button-secondary"
          style={{
            flex: 1,
            background: mode === 'register' ? 'var(--color-primary)' : 'var(--color-surface)',
            color: mode === 'register' ? 'var(--color-surface)' : 'var(--color-text)'
          }}
        >
          Crear cuenta
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <label htmlFor="email" style={{ display: 'block', marginBottom: 'var(--space-xs)' }}>
            Correo electrónico
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={{
              width: '100%',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-sm)',
              fontFamily: 'inherit'
            }}
          />
        </div>
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <label htmlFor="password" style={{ display: 'block', marginBottom: 'var(--space-xs)' }}>
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={{
              width: '100%',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-sm)',
              fontFamily: 'inherit'
            }}
          />
        </div>

        <button type="submit" className="button button-primary" disabled={submitting} style={{ width: '100%' }}>
          {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>

      <button
        type="button"
        onClick={handleGoogle}
        className="button-secondary"
        style={{
          width: '100%',
          marginTop: 'var(--space-md)',
          padding: 'var(--space-sm) var(--space-md)'
        }}
      >
        Continuar con Google
      </button>

      {error && (
        <p role="alert" style={{ color: 'var(--color-danger)', marginTop: 'var(--space-md)' }}>
          {error}
        </p>
      )}
      {info && <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-md)' }}>{info}</p>}
    </div>
  );
}
