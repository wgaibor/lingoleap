# Fase 4A — Esqueleto andante de la app móvil (Expo) — Spec de diseño

> Primer corte de la Fase 4 (app móvil React Native + Expo). La fase se descompuso en tres
> sub-proyectos con ciclo propio: **4A** (este spec): app Expo en el monorepo + auth + cursos +
> camino + StatsBar; **4B**: reproductor de lecciones (4 ejercicios, TTS con expo-speech, stats
> al completar); **4C**: logros/tienda/liga como pantallas + offline básico. Decisiones tomadas
> en brainstorm con el usuario el 2026-07-16.

## 1. Objetivo

Una app Expo corriendo en el teléfono (Expo Go, Android) contra el backend real: login/registro
con Supabase, lista de cursos, camino de lecciones con desbloqueo progresivo y StatsBar con las
stats reales. Tocar una lección desbloqueada muestra un placeholder — el reproductor es 4B. El
valor demostrable del corte: **`packages/core` y `@lingoleap/api-client` se reusan sin cambios**.

## 2. Alcance

- `apps/mobile`: workspace pnpm nuevo con Expo (SDK actual, TypeScript strict) y **Expo Router**.
- Metro configurado para el monorepo pnpm (`watchFolders` a la raíz + `nodeModulesPaths`).
- Auth Supabase con sesión persistida en AsyncStorage; `AuthProvider`/`useAuth` + protección de
  rutas con `<Redirect href="/login">`.
- Pantallas: `/login`, `/` (cursos), `/course/[language]/[level]` (camino + StatsBar),
  placeholder de lección.
- `theme.ts` con los valores de `@lingoleap/tokens` traducidos 1:1 (RN no tiene CSS vars).
- Smoke tests de render con jest-expo + React Native Testing Library; el paquete entra en
  `pnpm lint` y `pnpm test` de Turborepo/CI.

### Fuera de alcance (4B/4C u otras fases)

- Reproductor de lecciones y los 4 tipos de ejercicio; expo-speech.
- Pantallas de logros, tienda y liga (la StatsBar sí muestra 🏆 y 🧊 como datos).
- Offline/cola de resultados; EAS builds; deep links; push; publicación en stores.

## 3. Proyecto y monorepo

- Package `@lingoleap/mobile` en `apps/mobile`, agregado a `pnpm-workspace.yaml` (ya cubre
  `apps/*`) y al grafo de Turborepo (scripts `dev`, `test`, `lint`; **sin** script `build` de CI
  en 4A — `expo export`/EAS quedan fuera).
- Expo Router con rutas por archivos bajo `apps/mobile/app/`; el resto replica la organización
  por features de la web: `apps/mobile/src/features/{auth,course-path,stats}/…`, `src/shared/`,
  `src/app/` (cliente API, cliente Supabase, theme).
- Metro (`metro.config.js`): `watchFolders: [raíz del monorepo]` y
  `resolver.nodeModulesPaths: [node_modules del app, node_modules de la raíz]` para que los
  workspaces symlinkeados por pnpm (`@lingoleap/core`, `@lingoleap/api-client`,
  `@lingoleap/tokens`) resuelvan — equivalente móvil del `commonjsOptions.include` de Vite.
- Env (dev): `apps/mobile/.env` con `EXPO_PUBLIC_API_URL` (IP LAN de la PC, p. ej.
  `http://192.168.x.x:3000`, teléfono y PC en el mismo WiFi), `EXPO_PUBLIC_SUPABASE_URL` y
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`. `.env.example` documentado; `.env` git-ignorado. La anon key
  es pública por diseño (RLS es la seguridad real), igual que en la web.

## 4. Reuso (la tesis de la fase)

- `@lingoleap/core`: tipos, `computePathStatus`, y todo lo demás — **sin cambios**.
- `@lingoleap/api-client`: `LingoApiClient` usa `fetch`/`Headers`, disponibles en React Native —
  **sin cambios**. Instancia única en `src/app/api.ts` con `getAccessToken` leyendo la sesión de
  Supabase (mismo patrón que `apps/web/src/app/api.ts`).
- Supabase JS v2 con `auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken:
  true, detectSessionInUrl: false }` (`@react-native-async-storage/async-storage`).
- TanStack Query como en la web: hooks `queries.ts` por feature (`useCourses`, `useCourse`,
  `useProgress`, `useStats`, `useLeague`); nunca `fetch` directo en componentes; sin estado
  local de servidor.

## 5. Pantallas (Expo Router)

- `app/login.tsx`: email + contraseña con modo login/registro, mismos mensajes en español de la
  web (incluido el flujo de "confirmá tu correo" si el registro no crea sesión).
- `app/_layout.tsx`: providers (QueryClient, Auth) + guard de sesión: sin sesión → `<Redirect
  href="/login">`; con sesión en `/login` → redirect a `/`.
- `app/index.tsx`: lista de cursos (`GET /courses`), cada uno navega al camino.
- `app/course/[language]/[level].tsx`: StatsBar arriba + camino de lecciones con estados
  completada/desbloqueada/bloqueada vía `computePathStatus` (reusado tal cual). Lección
  desbloqueada → `app/lesson/[lessonId].tsx` con el placeholder "Próximamente" (y el título de
  la lección), que 4B reemplaza por el reproductor.
- StatsBar móvil (`src/features/stats/StatsBar.tsx`): 🔥 ❤️ 💎 🧊 🏆 ⚡ + barra de progreso del
  nivel, mismos datos de `GET /me/stats` y `GET /me/league` que la web (sin navegación a
  logros/liga en 4A: son datos, no links).
- Estilos: `StyleSheet.create` + `src/app/theme.ts` con colores/espaciados/radios copiados 1:1
  de `packages/tokens/src/tokens.css` (con comentario de que tokens.css es la fuente de verdad
  y el theme su traducción manual documentada). Prohibido hex suelto en componentes: siempre
  `theme.*`.

## 6. Testing

- **Smoke tests de render** (decisión del spec original: la lógica ya está testeada en
  core/api-client/backend): jest-expo + `@testing-library/react-native`.
  - Login: renderiza campos y botón; submit llama a `signInWithPassword` con lo tecleado;
    error → mensaje en español.
  - Camino: con progreso mockeado, marca completada/desbloqueada/bloqueada correctamente.
  - StatsBar: muestra los valores del resumen mockeado.
  - Cursos: lista lo que devuelve el API mockeado.
- Mocks a nivel de módulo (`src/app/api`, cliente Supabase), como hace la web con
  `vi.mock('../../app/api')` — acá con `jest.mock`.
- `pnpm --filter @lingoleap/mobile test` corre en CI junto al resto; lint con la flat config
  raíz (agregando overrides RN si hacen falta).

## 7. Smoke real (cierre del corte)

Con `pnpm --filter @lingoleap/api dev` corriendo y el teléfono en el mismo WiFi:
registro/login desde el teléfono → lista de cursos → camino con candados correctos → StatsBar
con datos reales → tocar lección desbloqueada muestra el placeholder. La sesión sobrevive a
cerrar y reabrir la app (AsyncStorage).

## 8. Decisiones y porqués

1. **App dentro del monorepo** (no proyecto Expo separado): el reuso directo de los workspaces
   es la tesis de la fase; publicar paquetes para consumirlos fuera sería infra extra sin valor.
   El costo es configurar Metro para pnpm — puntual y documentable.
2. **Expo Go + IP LAN para dev**: cero fricción y $0; el trade-off (actualizar la IP si cambia)
   se documenta en el README del app. Túneles agregan dependencia y latencia sin necesidad.
3. **Placeholder de lección en 4A**: el walking skeleton demuestra monorepo+auth+datos reales
   end-to-end en el teléfono sin mezclar las incógnitas del reproductor (gestos, TTS), que 4B
   aborda juntas.
4. **Theme manual desde tokens**: RN no consume CSS vars; una traducción explícita y comentada
   mantiene la regla "colores solo desde tokens" con el mínimo mecanismo (nada de styled-systems
   ni theming libraries).
5. **Smoke tests de render, no e2e móvil**: fija el nivel de inversión del spec original; el e2e
   real es el smoke manual en Expo Go con el usuario.
