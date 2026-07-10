# LingoLeap 🦉

Aplicación de aprendizaje de idiomas estilo Duolingo (inglés, portugués brasileño e italiano)
con contenido 100% dinámico desde APIs gratuitas. Monorepo TypeScript con arquitectura hexagonal.

## Estructura

- `apps/api` — Backend NestJS (arquitectura hexagonal: domain / application / infrastructure / presentation)
- `packages/core` — Tipos y lógica de dominio compartidos
- `supabase/migrations` — Esquema de la base de datos
- `docs/superpowers` — Specs y planes de diseño

## Fuentes de contenido (todas gratuitas)

Tatoeba (oraciones + audio) · FrequencyWords (vocabulario por frecuencia) ·
MyMemory (traducciones de palabras) · Pexels (imágenes)

## Desarrollo

```bash
pnpm install
pnpm build
pnpm test

# Backend (requiere apps/api/.env — ver apps/api/.env.example)
pnpm --filter @lingoleap/api dev

# Ingesta de contenido
pnpm --filter @lingoleap/api ingest --lang en --level A1 --limit 40
```
