# Fase 4A — Esqueleto móvil (Expo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Expo (`apps/mobile`) en el monorepo corriendo en Expo Go: auth Supabase con sesión
persistida, lista de cursos, camino de lecciones con desbloqueo progresivo, StatsBar con datos
reales y placeholder de lección.

**Architecture:** Workspace pnpm nuevo `@lingoleap/mobile` con Expo Router; Metro configurado
para el monorepo; reuso sin cambios de `@lingoleap/core` y `@lingoleap/api-client`; misma
organización por features que la web (`src/features/*` + `queries.ts` de TanStack Query);
theme manual traducido de `@lingoleap/tokens`.

**Tech Stack:** Expo SDK actual (la que instale `create-expo-app@latest`), Expo Router,
TypeScript strict, `@supabase/supabase-js` v2 + `@react-native-async-storage/async-storage`,
TanStack Query v5, jest-expo + `@testing-library/react-native`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-16-fase-4a-mobile-skeleton-design.md`.
- TypeScript `strict: true`; prohibido `any` explícito. Copy de UI en español, reutilizando los
  textos exactos de la web donde existan (p. ej. `mapAuthError`: 'Correo o contraseña
  incorrectos', 'Ese correo ya tiene cuenta', 'Algo salió mal, intenta de nuevo'; registro sin
  sesión → 'Cuenta creada. Revisa tu correo para confirmarla.').
- Nada de `fetch` directo en componentes: todo por `@lingoleap/api-client` envuelto en hooks de
  TanStack Query (`queries.ts` por feature).
- Colores/espaciados/radios SOLO desde `src/app/theme.ts` (traducción 1:1 de
  `packages/tokens/src/tokens.css`, comentada como tal); prohibido hex suelto en componentes.
- Sin Google OAuth en móvil (pospuesto igual que en web); sin script `build` de CI para el app
  móvil en 4A (solo `test` y lint).
- Tests: smoke de render con jest-expo + RN Testing Library; mocks a nivel de módulo con
  `jest.mock`. El resto del monorepo debe seguir en verde (`pnpm lint && pnpm build && pnpm test`).
- Los números de versión exactos de las dependencias Expo los decide `create-expo-app@latest` /
  `npx expo install` (no hardcodearlos de este plan); las versiones de supabase/query espejan
  las de `apps/web/package.json`.
- Commits convencionales en español + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Rama de trabajo nueva sobre `master`: `feature/fase-4a-mobile`.

---

### Task 1: Scaffold de `apps/mobile` integrado al monorepo

**Files:**
- Create: `apps/mobile/` (scaffold de Expo), `apps/mobile/metro.config.js`,
  `apps/mobile/jest.config.js`, `apps/mobile/jest.setup.ts`, `apps/mobile/.env.example`,
  `apps/mobile/app/_layout.tsx` (mínimo provisional), `apps/mobile/app/index.tsx` (provisional),
  `apps/mobile/src/app/theme.ts`, `apps/mobile/src/app/theme.spec.tsx`
- Modify: `apps/mobile/package.json` (nombre/scripts), `apps/mobile/.gitignore` (asegurar `.env`),
  `.gitignore` raíz solo si hiciera falta

**Interfaces:**
- Produces: workspace `@lingoleap/mobile` con scripts `dev` (`expo start`), `test` (`jest`),
  `lint` cubierto por el eslint raíz; `theme` exportado desde `src/app/theme.ts`:
```ts
export const theme = {
  colors: {
    primary: '#58CC02', primaryDark: '#58A700', danger: '#FF4B4B', info: '#1CB0F6',
    warning: '#FFC800', text: '#3C3C3C', textMuted: '#777777', border: '#E5E5E5',
    surface: '#FFFFFF', background: '#F7F7F7'
  },
  radius: { sm: 8, md: 12, lg: 16, pill: 9999 },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }
} as const;
```

- [ ] **Step 1: Scaffold** — desde la raíz del repo:

```bash
npx create-expo-app@latest apps/mobile --template blank-typescript --no-install
```

Editar `apps/mobile/package.json`: `"name": "@lingoleap/mobile"`, `"private": true`, scripts:

```json
{
  "dev": "expo start",
  "test": "jest",
  "android": "expo start --android"
}
```

Luego `pnpm install` en la raíz (incorpora el workspace) y agregar dependencias con las
versiones que resuelva expo:

```bash
pnpm --filter @lingoleap/mobile exec npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar @react-native-async-storage/async-storage
pnpm --filter @lingoleap/mobile add @lingoleap/core@workspace:* @lingoleap/api-client@workspace:* @supabase/supabase-js@^2.48.0 @tanstack/react-query@^5.62.0
pnpm --filter @lingoleap/mobile add -D jest jest-expo @testing-library/react-native @types/jest
```

Configurar Expo Router: en `package.json` `"main": "expo-router/entry"`; en `app.json` agregar
`"scheme": "lingoleap"` y el plugin `"expo-router"`.

- [ ] **Step 2: Metro para el monorepo** — crear `apps/mobile/metro.config.js`:

```js
// Metro no sigue los symlinks de pnpm por defecto: se le enseña la raíz del monorepo,
// equivalente móvil del commonjsOptions.include de Vite en apps/web.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules')
];
module.exports = config;
```

- [ ] **Step 3: Jest** — crear `apps/mobile/jest.config.js`:

```js
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  // pnpm anida los paquetes reales bajo node_modules/.pnpm: el patrón por defecto de
  // jest-expo no los alcanza, así que se amplía para transformar RN/Expo/Supabase.
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-router|expo-modules-core|react-navigation|@react-navigation/.*|react-native-svg|@supabase/.*))'
  ]
};
```

Crear `apps/mobile/jest.setup.ts`:

```ts
// AsyncStorage no existe en el entorno de test: mock oficial del paquete.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
```

Nota: si el `jest-expo` de la SDK instalada exige ajustes distintos, seguir el mensaje de
error de jest; el objetivo es que el Step 6 pase. Documentar cualquier ajuste en el reporte.

- [ ] **Step 4: Theme y test que falla (RED)** — crear `apps/mobile/src/app/theme.spec.tsx`:

```tsx
import { theme } from './theme';

describe('theme', () => {
  it('traduce los tokens de @lingoleap/tokens 1:1', () => {
    expect(theme.colors.primary).toBe('#58CC02');
    expect(theme.colors.danger).toBe('#FF4B4B');
    expect(theme.space.md).toBe(16);
    expect(theme.radius.md).toBe(12);
  });
});
```

Run: `pnpm --filter @lingoleap/mobile test` — Expected: FAIL (`./theme` no existe).

- [ ] **Step 5: Implementar theme** — crear `apps/mobile/src/app/theme.ts`:

```ts
// Traducción manual 1:1 de packages/tokens/src/tokens.css (fuente de verdad).
// RN no consume CSS variables; si tokens.css cambia, este archivo se actualiza a mano.
export const theme = {
  colors: {
    primary: '#58CC02',
    primaryDark: '#58A700',
    danger: '#FF4B4B',
    info: '#1CB0F6',
    warning: '#FFC800',
    text: '#3C3C3C',
    textMuted: '#777777',
    border: '#E5E5E5',
    surface: '#FFFFFF',
    background: '#F7F7F7'
  },
  radius: { sm: 8, md: 12, lg: 16, pill: 9999 },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }
} as const;
```

Y dejar `app/_layout.tsx` y `app/index.tsx` provisionales para que el Router tenga rutas:

```tsx
// apps/mobile/app/_layout.tsx (provisional; la Task 2 lo reemplaza)
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack />;
}
```

```tsx
// apps/mobile/app/index.tsx (provisional; la Task 4 lo reemplaza)
import { Text, View } from 'react-native';

export default function Home() {
  return (
    <View>
      <Text>LingoLeap</Text>
    </View>
  );
}
```

- [ ] **Step 6: Verificar** — Run: `pnpm --filter @lingoleap/mobile test` — Expected: PASS
  (1 test). Luego `pnpm lint && pnpm build && pnpm test` — Expected: PASS (el resto del
  monorepo intacto; si eslint tropieza con el scaffold, agregar overrides mínimos en la flat
  config raíz para `apps/mobile` — p. ej. ignorar `.expo/`).

- [ ] **Step 7: `.env.example` y gitignore** — crear `apps/mobile/.env.example`:

```bash
# IP LAN de la PC que corre apps/api (teléfono y PC en el mismo WiFi)
EXPO_PUBLIC_API_URL=http://192.168.0.10:3000
EXPO_PUBLIC_SUPABASE_URL=https://<proyecto>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

Asegurar que `apps/mobile/.gitignore` (del scaffold) incluye `.env`; si no, agregarlo.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile pnpm-lock.yaml pnpm-workspace.yaml eslint.config.js
git commit -m "feat(mobile): scaffold Expo con Router, Metro monorepo, jest-expo y theme de tokens"
```

(Ajustar la lista de `git add` a lo realmente tocado.)

---

### Task 2: Infra de app — env, supabase, api, AuthProvider y guard de rutas

**Files:**
- Create: `apps/mobile/src/app/env.ts`, `apps/mobile/src/app/supabase.ts`,
  `apps/mobile/src/app/api.ts`, `apps/mobile/src/features/auth/AuthProvider.tsx`,
  `apps/mobile/src/features/auth/useAuth.ts`,
  `apps/mobile/src/features/auth/AuthProvider.spec.tsx`
- Modify: `apps/mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: `theme` (Task 1); `LingoApiClient` de `@lingoleap/api-client`.
- Produces:
```ts
export const env: { apiUrl: string; supabaseUrl: string; supabaseAnonKey: string };
export const supabase: SupabaseClient;      // storage AsyncStorage, persistSession
export const api: LingoApiClient;           // getAccessToken desde la sesión Supabase
export interface AuthContextValue { session: Session | null; loading: boolean; signOut: () => Promise<void>; }
export function AuthProvider({ children }: { children: ReactNode }): JSX.Element;
export function useAuth(): AuthContextValue; // lanza si no hay provider
```
- `app/_layout.tsx` monta QueryClientProvider + AuthProvider + `AuthGate` (redirect a `/login`
  sin sesión; a `/` si hay sesión y estás en `/login`).

- [ ] **Step 1: Test que falla (RED)** — crear `AuthProvider.spec.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

const getSession = jest.fn();
const onAuthStateChange = jest.fn();
jest.mock('../../app/supabase', () => ({
  supabase: { auth: { getSession, onAuthStateChange, signOut: jest.fn() } }
}));

import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';

function Probe() {
  const { session, loading } = useAuth();
  if (loading) return <Text>cargando</Text>;
  return <Text>{session ? 'con-sesion' : 'sin-sesion'}</Text>;
}

describe('AuthProvider', () => {
  it('expone la sesión inicial de Supabase', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('con-sesion')).toBeTruthy());
  });

  it('expone null cuando no hay sesión', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('sin-sesion')).toBeTruthy());
  });
});
```

Run: `pnpm --filter @lingoleap/mobile test -- AuthProvider` — Expected: FAIL (módulos no
existen).

- [ ] **Step 2: Implementar infra** — crear los cuatro módulos:

```ts
// apps/mobile/src/app/env.ts
export const env = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'test-anon-key'
};
```

```ts
// apps/mobile/src/app/supabase.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { env } from './env';

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // No hay URL de callback en una app nativa; el flujo email+password no la usa.
    detectSessionInUrl: false
  }
});
```

```ts
// apps/mobile/src/app/api.ts
import { LingoApiClient } from '@lingoleap/api-client';
import { env } from './env';
import { supabase } from './supabase';

export const api = new LingoApiClient({
  baseUrl: env.apiUrl,
  getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null
});
```

```tsx
// apps/mobile/src/features/auth/AuthProvider.tsx — espejo del de apps/web
import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../app/supabase';

export interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, loading, signOut: async () => { await supabase.auth.signOut(); } }),
    [session, loading]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

```ts
// apps/mobile/src/features/auth/useAuth.ts
import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './AuthProvider';

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return value;
}
```

- [ ] **Step 3: Layout con guard** — reescribir `apps/mobile/app/_layout.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { AuthProvider } from '../src/features/auth/AuthProvider';
import { useAuth } from '../src/features/auth/useAuth';

const queryClient = new QueryClient();

function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inLogin = segments[0] === 'login';
    if (!session && !inLogin) router.replace('/login');
    if (session && inLogin) router.replace('/');
  }, [session, loading, segments, router]);

  if (loading) return null;
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate>
          <Stack screenOptions={{ headerTitle: 'LingoLeap' }} />
        </AuthGate>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Verificar** — Run: `pnpm --filter @lingoleap/mobile test` — Expected: PASS
  (theme + 2 de AuthProvider).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): supabase con AsyncStorage, api client y guard de sesión en el router"
```

---

### Task 3: Pantalla de login

**Files:**
- Create: `apps/mobile/app/login.tsx`, `apps/mobile/src/features/auth/LoginScreen.tsx`,
  `apps/mobile/src/features/auth/LoginScreen.spec.tsx`

**Interfaces:**
- Consumes: `supabase` (Task 2), `theme` (Task 1). El redirect post-login lo hace el `AuthGate`
  (Task 2) al cambiar la sesión — la pantalla NO navega por su cuenta en login exitoso.
- Produces: `export function LoginScreen(): JSX.Element` (usada por `app/login.tsx`, que solo
  la reexporta como default).

- [ ] **Step 1: Test que falla (RED)** — crear `LoginScreen.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const signInWithPassword = jest.fn();
const signUp = jest.fn();
jest.mock('../../app/supabase', () => ({
  supabase: { auth: { signInWithPassword, signUp } }
}));

import { LoginScreen } from './LoginScreen';

describe('LoginScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('envía email y contraseña al iniciar sesión', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Correo electrónico'), 'ana@test.com');
    fireEvent.changeText(screen.getByPlaceholderText('Contraseña'), 'secreta1');
    fireEvent.press(screen.getByTestId('submit'));
    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith({ email: 'ana@test.com', password: 'secreta1' })
    );
  });

  it('muestra el error en español si las credenciales fallan', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Correo electrónico'), 'ana@test.com');
    fireEvent.changeText(screen.getByPlaceholderText('Contraseña'), 'mala');
    fireEvent.press(screen.getByTestId('submit'));
    expect(await screen.findByText('Correo o contraseña incorrectos')).toBeTruthy();
  });

  it('en modo registro sin sesión muestra el aviso de confirmación y limpia el formulario', async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    render(<LoginScreen />);
    fireEvent.press(screen.getByText('Crear cuenta'));
    fireEvent.changeText(screen.getByPlaceholderText('Correo electrónico'), 'ana@test.com');
    fireEvent.changeText(screen.getByPlaceholderText('Contraseña'), 'secreta1');
    fireEvent.press(screen.getByTestId('submit'));
    expect(await screen.findByText('Cuenta creada. Revisa tu correo para confirmarla.')).toBeTruthy();
    expect(screen.getByPlaceholderText('Correo electrónico').props.value).toBe('');
  });
});
```

Run: `pnpm --filter @lingoleap/mobile test -- LoginScreen` — Expected: FAIL.

- [ ] **Step 2: Implementar** — crear `LoginScreen.tsx`:

```tsx
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

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  async function handleSubmit() {
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
    flex: 1, padding: theme.space.sm, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface, alignItems: 'center'
  },
  tabActive: { backgroundColor: theme.colors.primary },
  tabText: { color: theme.colors.text },
  tabTextActive: { color: theme.colors.surface, fontWeight: '700' },
  input: {
    backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1,
    borderRadius: theme.radius.md, padding: theme.space.sm, marginBottom: theme.space.md
  },
  submit: {
    backgroundColor: theme.colors.primary, borderRadius: theme.radius.md,
    padding: theme.space.md, alignItems: 'center'
  },
  submitText: { color: theme.colors.surface, fontWeight: '700' },
  error: { color: theme.colors.danger, marginTop: theme.space.md },
  info: { color: theme.colors.primary, marginTop: theme.space.md }
});
```

Y `apps/mobile/app/login.tsx`:

```tsx
import { LoginScreen } from '../src/features/auth/LoginScreen';

export default LoginScreen;
```

- [ ] **Step 3: Verificar** — Run: `pnpm --filter @lingoleap/mobile test -- LoginScreen` —
  Expected: PASS (3 tests). Luego suite completa del paquete: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): pantalla de login y registro con Supabase"
```

---

### Task 4: Lista de cursos

**Files:**
- Create: `apps/mobile/src/features/course-path/queries.ts`,
  `apps/mobile/src/features/course-path/CoursesScreen.tsx`,
  `apps/mobile/src/features/course-path/CoursesScreen.spec.tsx`
- Modify: `apps/mobile/app/index.tsx` (reexporta `CoursesScreen`)

**Interfaces:**
- Consumes: `api` (Task 2); tipos de `@lingoleap/core` (`CourseSummary`, `LearningLanguage`,
  `CEFRLevel`).
- Produces:
```ts
export function useCourses(): UseQueryResult<CourseSummary[]>;
export function useCourse(language: LearningLanguage, level: CEFRLevel): UseQueryResult<Course>;
export function useProgress(): UseQueryResult<string[]>;
export function CoursesScreen(): JSX.Element;
```

- [ ] **Step 1: Test que falla (RED)** — crear `CoursesScreen.spec.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

const listCourses = jest.fn();
jest.mock('../../app/api', () => ({ api: { listCourses } }));
const push = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push }) }));

import { CoursesScreen } from './CoursesScreen';

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('CoursesScreen', () => {
  it('lista los cursos devueltos por el API', async () => {
    listCourses.mockResolvedValue([
      { language: 'en', level: 'A1', title: 'Inglés A1', lessonCount: 5 }
    ]);
    renderWithQuery(<CoursesScreen />);
    expect(await screen.findByText('Inglés A1')).toBeTruthy();
  });

  it('muestra un error si falla la carga', async () => {
    listCourses.mockRejectedValue(new Error('network'));
    renderWithQuery(<CoursesScreen />);
    expect(await screen.findByText('No pudimos cargar los cursos')).toBeTruthy();
  });
});
```

Run: `pnpm --filter @lingoleap/mobile test -- CoursesScreen` — Expected: FAIL.

- [ ] **Step 2: Implementar** — crear `queries.ts` (espejo de la web):

```ts
import { useQuery } from '@tanstack/react-query';
import type { CEFRLevel, LearningLanguage } from '@lingoleap/core';
import { api } from '../../app/api';

export function useCourses() {
  return useQuery({ queryKey: ['courses'], queryFn: () => api.listCourses() });
}

export function useCourse(language: LearningLanguage, level: CEFRLevel) {
  return useQuery({
    queryKey: ['course', language, level],
    queryFn: () => api.getCourse(language, level)
  });
}

export function useProgress() {
  return useQuery({ queryKey: ['progress'], queryFn: () => api.getCompletedLessonIds() });
}
```

Crear `CoursesScreen.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../app/theme';
import { useCourses } from './queries';

export function CoursesScreen() {
  const router = useRouter();
  const { data, isPending, isError } = useCourses();

  if (isPending) {
    return (
      <View style={styles.container}>
        <Text>Cargando…</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>No pudimos cargar los cursos</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        keyExtractor={(course) => `${course.language}-${course.level}`}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/course/${item.language}/${item.level}`)}
          >
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.subtitle}>{item.lessonCount} lecciones</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: theme.space.md, backgroundColor: theme.colors.background },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    padding: theme.space.md, marginBottom: theme.space.sm,
    borderColor: theme.colors.border, borderWidth: 1
  },
  title: { fontWeight: '700', color: theme.colors.text },
  subtitle: { color: theme.colors.textMuted, marginTop: theme.space.xs },
  error: { color: theme.colors.danger }
});
```

Reescribir `apps/mobile/app/index.tsx`:

```tsx
import { CoursesScreen } from '../src/features/course-path/CoursesScreen';

export default CoursesScreen;
```

Nota sobre `lessonCount`: verificar el shape real de `CourseSummary` en
`packages/core` — si el campo se llama distinto (p. ej. no existe `lessonCount`), ajustar la
pantalla y el test al shape real; el test debe reflejar el contrato verdadero del API.

- [ ] **Step 3: Verificar** — Run: `pnpm --filter @lingoleap/mobile test` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): lista de cursos con TanStack Query"
```

---

### Task 5: Camino de lecciones + StatsBar + placeholder de lección

**Files:**
- Create: `apps/mobile/src/features/stats/queries.ts`,
  `apps/mobile/src/features/stats/StatsBar.tsx`,
  `apps/mobile/src/features/stats/StatsBar.spec.tsx`,
  `apps/mobile/src/features/course-path/CoursePathScreen.tsx`,
  `apps/mobile/src/features/course-path/CoursePathScreen.spec.tsx`,
  `apps/mobile/app/course/[language]/[level].tsx`, `apps/mobile/app/lesson/[lessonId].tsx`

**Interfaces:**
- Consumes: `useCourse`/`useProgress` (Task 4); `api` (Task 2); `computePathStatus`,
  `StatsSummary`, `LeagueSummary` de `@lingoleap/core`; `DIVISION_LABEL` local (copiar el
  Record de la web: bronze→Bronce, silver→Plata, gold→Oro, diamond→Diamante).
- Produces:
```ts
export function useStats(): UseQueryResult<StatsSummary>;
export function useLeague(): UseQueryResult<LeagueSummary>;
export function StatsBar(): JSX.Element | null;
export function CoursePathScreen(): JSX.Element;
```

- [ ] **Step 1: Test de StatsBar que falla (RED)** — crear `StatsBar.spec.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

const getStats = jest.fn();
const getLeague = jest.fn();
jest.mock('../../app/api', () => ({ api: { getStats, getLeague } }));

import { StatsBar } from './StatsBar';

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('StatsBar', () => {
  it('muestra racha, corazones, gemas, congeladores, liga y nivel', async () => {
    getStats.mockResolvedValue({
      xp: 120, level: 2, xpIntoLevel: 20, xpToNextLevel: 180,
      streakCount: 3, streakFreezes: 1, gems: 7,
      hearts: 4, maxHearts: 5, nextHeartAt: null
    });
    getLeague.mockResolvedValue({ division: 'silver', cohort: null });
    renderWithQuery(<StatsBar />);
    expect(await screen.findByText('🔥 3')).toBeTruthy();
    expect(screen.getByText('❤️ 4')).toBeTruthy();
    expect(screen.getByText('💎 7')).toBeTruthy();
    expect(screen.getByText('🧊 1')).toBeTruthy();
    expect(await screen.findByText('🏆 Plata')).toBeTruthy();
    expect(screen.getByText('⚡ Nivel 2')).toBeTruthy();
  });
});
```

Run: `pnpm --filter @lingoleap/mobile test -- StatsBar` — Expected: FAIL.

- [ ] **Step 2: Implementar stats** — crear `apps/mobile/src/features/stats/queries.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../../app/api';

export function useStats() {
  return useQuery({ queryKey: ['stats'], queryFn: () => api.getStats() });
}

export function useLeague() {
  return useQuery({ queryKey: ['league'], queryFn: () => api.getLeague() });
}
```

Crear `StatsBar.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import type { LeagueDivision } from '@lingoleap/core';
import { theme } from '../../app/theme';
import { useLeague, useStats } from './queries';

const DIVISION_LABEL: Record<LeagueDivision, string> = {
  bronze: 'Bronce',
  silver: 'Plata',
  gold: 'Oro',
  diamond: 'Diamante'
};

export function StatsBar() {
  const { data } = useStats();
  const { data: league } = useLeague();
  if (!data) return null;
  const levelTotal = data.xpIntoLevel + data.xpToNextLevel;
  const percent = levelTotal === 0 ? 0 : Math.round((data.xpIntoLevel / levelTotal) * 100);
  return (
    <View style={styles.bar}>
      <View style={styles.items}>
        <Text style={styles.item}>🔥 {data.streakCount}</Text>
        <Text style={styles.item}>❤️ {data.hearts}</Text>
        <Text style={styles.item}>💎 {data.gems}</Text>
        <Text style={styles.item}>🧊 {data.streakFreezes}</Text>
        {league && <Text style={styles.item}>🏆 {DIVISION_LABEL[league.division]}</Text>}
        <Text style={styles.item}>⚡ Nivel {data.level}</Text>
      </View>
      <View style={styles.levelTrack} accessibilityRole="progressbar">
        <View style={[styles.levelFill, { width: `${percent}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    padding: theme.space.sm, marginBottom: theme.space.md,
    borderColor: theme.colors.border, borderWidth: 1
  },
  items: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  item: { color: theme.colors.text },
  levelTrack: {
    height: 6, backgroundColor: theme.colors.border,
    borderRadius: theme.radius.pill, marginTop: theme.space.sm, overflow: 'hidden'
  },
  levelFill: { height: 6, backgroundColor: theme.colors.primary }
});
```

Run: `pnpm --filter @lingoleap/mobile test -- StatsBar` — Expected: PASS.

- [ ] **Step 3: Test del camino que falla (RED)** — crear `CoursePathScreen.spec.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

const getCourse = jest.fn();
const getCompletedLessonIds = jest.fn();
const getStats = jest.fn();
const getLeague = jest.fn();
jest.mock('../../app/api', () => ({
  api: { getCourse, getCompletedLessonIds, getStats, getLeague }
}));
const push = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push }),
  useLocalSearchParams: () => ({ language: 'en', level: 'A1' })
}));

import { CoursePathScreen } from './CoursePathScreen';

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const course = {
  id: 'c1', language: 'en', level: 'A1', title: 'Inglés A1',
  units: [{
    id: 'u1', title: 'Unidad 1', position: 1,
    lessons: [
      { id: 'l1', title: 'Lección 1', position: 1 },
      { id: 'l2', title: 'Lección 2', position: 2 },
      { id: 'l3', title: 'Lección 3', position: 3 }
    ]
  }]
};

describe('CoursePathScreen', () => {
  it('marca completada, desbloqueada y bloqueada según el progreso', async () => {
    getCourse.mockResolvedValue(course);
    getCompletedLessonIds.mockResolvedValue(['l1']);
    getStats.mockResolvedValue({
      xp: 0, level: 1, xpIntoLevel: 0, xpToNextLevel: 100,
      streakCount: 0, streakFreezes: 0, gems: 0, hearts: 5, maxHearts: 5, nextHeartAt: null
    });
    getLeague.mockResolvedValue({ division: 'bronze', cohort: null });
    renderWithQuery(<CoursePathScreen />);
    expect(await screen.findByText('Inglés A1')).toBeTruthy();
    expect(screen.getByTestId('lesson-l1-completed')).toBeTruthy();
    expect(screen.getByTestId('lesson-l2-unlocked')).toBeTruthy();
    expect(screen.getByTestId('lesson-l3-locked')).toBeTruthy();
  });
});
```

Run: `pnpm --filter @lingoleap/mobile test -- CoursePathScreen` — Expected: FAIL.

- [ ] **Step 4: Implementar el camino** — crear `CoursePathScreen.tsx`:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { computePathStatus, type CEFRLevel, type LearningLanguage } from '@lingoleap/core';
import { theme } from '../../app/theme';
import { StatsBar } from '../stats/StatsBar';
import { useCourse, useProgress } from './queries';

const STATUS_EMOJI = { completed: '✅', unlocked: '⭐', locked: '🔒' } as const;

export function CoursePathScreen() {
  const router = useRouter();
  const { language, level } = useLocalSearchParams<{ language: string; level: string }>();
  const courseQuery = useCourse(language as LearningLanguage, level as CEFRLevel);
  const progressQuery = useProgress();

  if (courseQuery.isPending || progressQuery.isPending) {
    return (
      <View style={styles.container}>
        <Text>Cargando…</Text>
      </View>
    );
  }

  if (courseQuery.isError || progressQuery.isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>No pudimos cargar el curso</Text>
      </View>
    );
  }

  const course = courseQuery.data;
  const status = computePathStatus(course, progressQuery.data);
  const units = [...course.units].sort((a, b) => a.position - b.position);

  return (
    <ScrollView style={styles.container}>
      <StatsBar />
      <Text style={styles.title}>{course.title}</Text>
      {units.map((unit) => (
        <View key={unit.id} style={styles.unit}>
          <Text style={styles.unitTitle}>{unit.title}</Text>
          {[...unit.lessons]
            .sort((a, b) => a.position - b.position)
            .map((lesson) => {
              const lessonStatus = status[lesson.id];
              const locked = lessonStatus === 'locked';
              return (
                <Pressable
                  key={lesson.id}
                  testID={`lesson-${lesson.id}-${lessonStatus}`}
                  disabled={locked}
                  onPress={() => router.push(`/lesson/${lesson.id}`)}
                  style={[styles.lesson, locked && styles.lessonLocked]}
                >
                  <Text style={styles.lessonEmoji}>{STATUS_EMOJI[lessonStatus]}</Text>
                  <Text style={locked ? styles.lessonTextLocked : styles.lessonText}>
                    {lesson.title}
                  </Text>
                </Pressable>
              );
            })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: theme.space.md, backgroundColor: theme.colors.background },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: theme.space.md },
  unit: { marginBottom: theme.space.lg },
  unitTitle: { fontWeight: '700', color: theme.colors.textMuted, marginBottom: theme.space.sm },
  lesson: {
    flexDirection: 'row', alignItems: 'center', gap: theme.space.sm,
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    padding: theme.space.md, marginBottom: theme.space.sm,
    borderColor: theme.colors.border, borderWidth: 1
  },
  lessonLocked: { opacity: 0.5 },
  lessonEmoji: { fontSize: 16 },
  lessonText: { color: theme.colors.text },
  lessonTextLocked: { color: theme.colors.textMuted },
  error: { color: theme.colors.danger }
});
```

Crear las rutas:

```tsx
// apps/mobile/app/course/[language]/[level].tsx
import { CoursePathScreen } from '../../../src/features/course-path/CoursePathScreen';

export default CoursePathScreen;
```

```tsx
// apps/mobile/app/lesson/[lessonId].tsx — placeholder que 4B reemplaza por el reproductor
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../src/app/theme';

export default function LessonPlaceholder() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Próximamente</Text>
      <Text style={styles.subtitle}>El reproductor de lecciones llega en la Fase 4B.</Text>
      <Text style={styles.lessonId}>Lección: {lessonId}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: theme.space.lg, backgroundColor: theme.colors.background
  },
  title: { fontSize: 24, fontWeight: '700', color: theme.colors.text },
  subtitle: { color: theme.colors.textMuted, marginTop: theme.space.sm, textAlign: 'center' },
  lessonId: { color: theme.colors.textMuted, marginTop: theme.space.md, fontSize: 12 }
});
```

Nota: verificar el shape real de `Course`/`Unit`/`Lesson` en `packages/core` (campos
`units[].lessons[].position`, `title`, etc.) y ajustar el fixture del test al contrato real si
difiere.

- [ ] **Step 5: Verificar todo** — Run: `pnpm --filter @lingoleap/mobile test` y después
  `pnpm lint && pnpm build && pnpm test` — Expected: PASS completo.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): camino de lecciones con desbloqueo progresivo, StatsBar y placeholder"
```

---

### Task 6: Documentación

**Files:**
- Modify: `README.md` (roadmap: Fase 4A completa; sección breve "App móvil (Fase 4A)" con cómo
  correrla: `.env` con IP LAN + `pnpm --filter @lingoleap/mobile dev` + Expo Go),
  `docs/BITACORA.md` (entrada de cierre: decisiones+porqués del spec §8, problemas reales de
  las Tareas 1-5 — especialmente cualquier pelea real con Metro/pnpm o jest-expo —, deuda
  técnica, números)

- [ ] **Step 1: Actualizar ambos documentos** con los problemas REALES de la ejecución (revisar
  los reportes de `.superpowers/sdd/` y los commits). Documentar explícitamente: (1) Metro +
  pnpm workspaces (watchFolders/nodeModulesPaths) y cualquier ajuste real que hiciera falta;
  (2) theme manual como traducción documentada de tokens.css; (3) jest-expo +
  transformIgnorePatterns con `.pnpm`; (4) el guard de sesión en `_layout` con Expo Router
  (equivalente móvil de RequireAuth).

- [ ] **Step 2: Verificar y commitear**

Run: `pnpm lint && pnpm build && pnpm test` — Expected: PASS.

```bash
git add README.md docs/BITACORA.md
git commit -m "docs: bitácora y README del esqueleto móvil (Fase 4A)"
```

---

### Task 7: Smoke real en el teléfono (manual, con el usuario)

**Prerrequisito:** `apps/mobile/.env` con la IP LAN real de la PC y las credenciales de
Supabase; teléfono Android con Expo Go instalado, en el mismo WiFi.

- [ ] **Step 1: Levantar API y app**: `pnpm --filter @lingoleap/api dev` y
  `pnpm --filter @lingoleap/mobile dev` → escanear el QR con Expo Go.
- [ ] **Step 2: Recorrido**: registro o login → lista de cursos → camino con candados correctos
  y StatsBar con datos reales → tocar lección desbloqueada → placeholder "Próximamente" →
  cerrar la app del todo y reabrir → la sesión persiste (AsyncStorage, sin volver a login).
- [ ] **Step 3: Registrar resultado** en `.superpowers/sdd/progress.md` y BITACORA si hubo
  hallazgos.

---

## Verificación final

- [ ] `pnpm lint && pnpm build && pnpm test` en verde (mobile incluido).
- [ ] Smoke del Task 7 completado en Expo Go.
- [ ] Merge a master + push + CI verde.
