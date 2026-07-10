# LingoLeap — Diseño de la aplicación

**Fecha:** 2026-07-10
**Estado:** Aprobado por el usuario (diseño conversacional); pendiente revisión del documento escrito.

## 1. Visión general

Aplicación de aprendizaje de idiomas estilo Duolingo (camino de lecciones, ejercicios interactivos con audio e imágenes, gamificación completa), para **web y móvil**, con **contenido 100% dinámico** proveniente de APIs y datasets abiertos — nada de contenido quemado en el código.

- **Idiomas a aprender (v1):** inglés, portugués brasileño, italiano. Niveles A1 → C2 (CEFR).
- **Idioma de la interfaz:** español.
- **Propósito:** producto real con usuarios, construido a **costo $0** de infraestructura y APIs.
- **Objetivo secundario:** que el autor aprenda React y demuestre arquitectura de software fuerte (SOLID, Clean Architecture, hexagonal).

## 2. Stack y hosting (todo gratuito)

| Capa | Tecnología | Hosting |
|---|---|---|
| Web | React 18 + Vite + TypeScript + TanStack Query + Zustand | Vercel o Netlify (free) |
| Móvil | React Native + Expo (Expo Router) | Expo Go (dev) / EAS build |
| API | NestJS + TypeScript, arquitectura hexagonal | Render (free) |
| BD + Auth | Supabase: Postgres + Supabase Auth (email/password + Google) | Supabase (free) |
| Monorepo | pnpm workspaces + Turborepo | GitHub |
| CI | Lint + tests en cada push | GitHub Actions (free en repo público) |

## 3. Fuentes de datos externas

| Fuente | Uso | Costo/licencia |
|---|---|---|
| **Tatoeba API** (api.tatoeba.org) | Oraciones reales con traducción al español y audio de hablantes nativos | Gratis, CC |
| **FrequencyWords / listas CEFR abiertas** (OpenSubtitles, Oxford-CEFR datasets) | Esqueleto del currículo: qué vocabulario enseñar y en qué orden por nivel | Gratis, open data |
| **Pexels API** | Imágenes para ejercicios de vocabulario (200 req/hora) | Gratis |
| **Web Speech API** (web) / **expo-speech** (móvil) | TTS en el dispositivo para texto sin audio nativo | Gratis, on-device |

**Regla de arquitectura:** las apps cliente **nunca** llaman a las APIs externas de contenido. Un pipeline de ingesta las consume offline y persiste en Postgres; la API de NestJS sirve desde la BD. Así los rate limits no afectan a usuarios y la app sobrevive si una API externa muere.

## 4. Pipeline de contenido (ingesta)

Módulo de NestJS ejecutable como comando: `pnpm ingest --lang en --level A1`.

1. Toma las N palabras del nivel desde la lista de frecuencia/CEFR.
2. Busca en Tatoeba oraciones cortas que usen cada palabra, con traducción al español y audio si existe.
3. Busca imagen ilustrativa en Pexels (solo sustantivos concretos).
4. Compone ejercicios y los agrupa en lecciones (~10 ejercicios) y unidades (~5 lecciones).
5. Persiste en Supabase: `courses → units → lessons → exercises`.

Comportamiento ante fallos: reintentos con backoff exponencial; palabra sin oración → se marca `pending_content` y el pipeline continúa; sin imagen → el ejercicio degrada a solo texto. La ingesta nunca aborta completa. Throttling para respetar rate limits.

## 5. Tipos de ejercicio (MVP)

1. **Selección con imagen** — "¿Cuál es *la manzana*?" con 4 imágenes.
2. **Traducir con banco de palabras** — armar la oración tocando fichas.
3. **Escucha** — reproducir audio y escribir/armar lo oído.
4. **Parejas** — emparejar 5 palabras con sus traducciones.

Ejercicios de habla: **fase 2** (el reconocimiento de voz gratuito solo es confiable en Chrome).

## 6. Estructura del monorepo

```
lingoleap/
├── apps/
│   ├── api/        NestJS hexagonal
│   ├── web/        React + Vite
│   └── mobile/     React Native + Expo
├── packages/
│   ├── core/       Dominio compartido: tipos, validación de respuestas,
│   │               cálculo de XP/rachas/progreso (TS puro, sin frameworks)
│   ├── api-client/ SDK tipado (fetch) usado por web y mobile
│   └── tokens/     Design tokens temática Duolingo (verde #58CC02,
│                   rojo #FF4B4B, radios, tipografía)
└── docs/
```

## 7. Backend — arquitectura hexagonal

Dependencias apuntan hacia adentro; el dominio no conoce NestJS, Supabase ni Tatoeba.

```
apps/api/src/
├── domain/           entities (User, Course, Unit, Lesson, Exercise, Progress,
│                     Streak, League, Achievement), value-objects (XP, CEFRLevel,
│                     LanguagePair, Hearts), errors (DomainError y derivados)
├── application/
│   ├── use-cases/    complete-lesson, get-course-path, submit-answer,
│   │                 update-league, ingest-content
│   └── ports/        CourseRepository, ProgressRepository, SentenceProvider,
│                     ImageProvider, AuthVerifier (interfaces)
├── infrastructure/   persistence/supabase, providers/tatoeba, providers/pexels,
│                     auth (SupabaseAuthVerifier — valida JWT)
└── presentation/     controllers REST, DTOs (class-validator), guards
```

SOLID: casos de uso de responsabilidad única (S); nuevos idiomas/proveedores sin tocar el dominio (O); implementaciones de puertos intercambiables, incl. fakes de test (L); puertos pequeños y específicos (I); casos de uso reciben interfaces por constructor, NestJS inyecta (D).

## 8. Frontends

Organización **por features** (idiomática en React): `auth`, `course-path`, `lesson-player`, `gamification`, `league` + `shared` + `app`. Misma estructura de features en web y mobile.

- **Estado del servidor:** TanStack Query. **Estado local efímero:** Zustand.
- **Audio:** hook `useSpeech()` con implementación por plataforma (speechSynthesis / expo-speech) — puertos y adaptadores aplicado al frontend donde aporta.
- La UI no se comparte entre plataformas (div vs View); se comparten `core`, `api-client` y `tokens`.
- **Offline básico (móvil):** lección descargada se completa en memoria; resultados se encolan (Zustand persistido) y se envían al recuperar conexión.

## 9. Gamificación

Reglas en `packages/core` (la UI muestra sin esperar al servidor) y **validadas siempre en el backend**.

- **XP y niveles:** 10–15 XP por lección según errores; curva de nivel exponencial.
- **Racha:** ≥1 lección/día (zona horaria del usuario) la extiende; congelador de racha comprable con gemas obtenidas por logros.
- **Corazones:** máx. 5; −1 por error; regeneran 1 cada 4 h; sin corazones → solo lecciones de repaso.
- **Liga semanal:** cohortes de hasta 30 usuarios (Bronce → Plata → Oro → Diamante). Cron (`@nestjs/schedule`) cierra la semana el domingo: top 10 sube, últimos 5 bajan.
- **Logros:** tablas `achievements` + `user_achievements`; se evalúan al completar lecciones.

## 10. Manejo de errores

- **Backend:** el dominio lanza errores semánticos (`InsufficientHeartsError`, `LessonLockedError`, `InvalidAnswerError`); un exception filter global los mapea a HTTP (409, 403, 422…) con cuerpo uniforme `{ code, message }`. Los casos de uso no conocen HTTP.
- **Frontend:** TanStack Query maneja reintentos/estados; los `code` de la API se mapean a mensajes en español con acciones. Error boundary global con pantalla de la mascota.
- **Pipeline:** ver sección 4.

## 11. Testing (con TDD)

| Qué | Cómo | Herramienta |
|---|---|---|
| Dominio + casos de uso (API) | Unit tests con fakes de puertos, sin BD/red | Vitest |
| Adaptadores externos | Integración con respuestas HTTP grabadas | Vitest + msw |
| API completa | e2e contra Supabase local (`supabase start`) | Vitest + supertest |
| packages/core | Unit tests de lógica compartida | Vitest |
| Web | Tests de componentes (lesson-player prioritario) | Vitest + Testing Library |
| Mobile | Smoke tests de render (la lógica ya está testeada en core) | Jest + RN Testing Library |

## 12. Despliegue y limitaciones conocidas

- Render free duerme tras 15 min: la web muestra splash "despertando" con reintento; opcional ping de UptimeRobot.
- Supabase free (500 MB) suficiente: solo texto y URLs (imágenes en Pexels, audio en Tatoeba).
- Variables de entorno con claves de APIs solo en el backend/CI, nunca en clientes.

## 13. Fases de construcción

1. Monorepo + backend hexagonal + pipeline de ingesta (inglés A1) + BD.
2. Web: auth, camino del curso, lesson-player con 4 ejercicios + audio.
3. Gamificación completa (XP, rachas, corazones, ligas, logros).
4. Mobile con Expo (reusa core + api-client).
5. Portugués e italiano (correr pipeline) + despliegue completo.

Cada fase termina con algo funcionando de punta a punta.

## 14. Fuera de alcance (v1)

- Ejercicios de habla / reconocimiento de voz.
- Generación de contenido con IA (posible mejora futura si aparecen tiers gratuitos estables).
- Notificaciones push, compras, modo social más allá de la liga.
- Más idiomas que los 3 iniciales (la arquitectura los soporta con solo correr el pipeline).
