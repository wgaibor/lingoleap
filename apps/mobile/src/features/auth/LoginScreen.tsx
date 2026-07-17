import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../../app/supabase';
import { theme } from '../../app/theme';

type Mode = 'login' | 'register';

function mapAuthError(message: string | undefined): string {
  if (message === 'Invalid login credentials') return 'Correo o contraseña incorrectos';
  if (message === 'User already registered') return 'Ese correo ya tiene cuenta';
  return 'Algo salió mal, intenta de nuevo';
}

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function switchMode(next: Mode): void {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  async function handleSubmit(): Promise<void> {
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) setError(mapAuthError(signInError.message));
        // Login OK: el AuthGate del layout redirige al detectar la sesión.
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) {
          setError(mapAuthError(signUpError.message));
        } else if (!data?.session) {
          setInfo('Cuenta creada. Revisa tu correo para confirmarla.');
          setEmail('');
          setPassword('');
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <Pressable
          onPress={() => switchMode('login')}
          style={[styles.tab, mode === 'login' && styles.tabActive]}
        >
          <Text style={mode === 'login' ? styles.tabTextActive : styles.tabText}>Entrar</Text>
        </Pressable>
        <Pressable
          onPress={() => switchMode('register')}
          style={[styles.tab, mode === 'register' && styles.tabActive]}
        >
          <Text style={mode === 'register' ? styles.tabTextActive : styles.tabText}>Crear cuenta</Text>
        </Pressable>
      </View>

      <TextInput
        placeholder="Correo electrónico"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />
      <TextInput
        placeholder="Contraseña"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={styles.input}
      />

      <Pressable testID="submit" onPress={handleSubmit} disabled={submitting} style={styles.submit}>
        <Text style={styles.submitText}>{mode === 'login' ? 'Entrar' : 'Crear cuenta'}</Text>
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}
      {info && <Text style={styles.info}>{info}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: theme.space.lg, backgroundColor: theme.colors.background, justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: theme.space.xs, marginBottom: theme.space.md },
  tab: {
    flex: 1,
    padding: theme.space.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    alignItems: 'center'
  },
  tabActive: { backgroundColor: theme.colors.primary },
  tabText: { color: theme.colors.text },
  tabTextActive: { color: theme.colors.surface, fontWeight: '700' },
  input: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    marginBottom: theme.space.md
  },
  submit: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    alignItems: 'center'
  },
  submitText: { color: theme.colors.surface, fontWeight: '700' },
  error: { color: theme.colors.danger, marginTop: theme.space.md },
  info: { color: theme.colors.primary, marginTop: theme.space.md }
});
