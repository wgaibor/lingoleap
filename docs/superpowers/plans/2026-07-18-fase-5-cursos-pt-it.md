# Fase 5 (mitad 1): cursos pt-BR / it / en — Plan de ejecución

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tres cursos A1 (`pt-BR`, `it`, `en`) de ~15 lecciones en la base, validados con reporte de ingesta y spot-check en las apps.

**Architecture:** Plan **operativo, sin código nuevo**: usa el CLI de ingesta existente (`apps/api/src/cli/ingest.cli.ts`) que compone lecciones desde FrequencyWords → MyMemory → Tatoeba → Pexels y persiste en Supabase. Cada corrida reemplaza el curso completo de forma atómica. Las apps ya listan cursos dinámicamente; no se toca UI.

**Tech Stack:** pnpm, CLI de ingesta de `@lingoleap/api`, Supabase (Postgres), curl para verificación.

**Spec:** `docs/superpowers/specs/2026-07-18-fase-5-cursos-pt-it-design.md`

## Global Constraints

- Corridas **secuenciales**, nunca en paralelo (rate limits gratuitos de MyMemory/Tatoeba/Pexels).
- Orden obligatorio: `pt-BR` → `it` → `en` (el inglés, único curso con progreso que se pierde al reemplazarse, va al final por si se agotan cuotas).
- Umbral de calidad: si `skippedWords` > 30% de `wordsRequested` en una corrida, **detenerse e investigar** antes de dar por bueno ese curso (¿proveedor caído o poca cobertura del idioma?).
- Requiere `apps/api/.env` con `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PEXELS_API_KEY` (ya existe en la máquina del usuario).
- El reseteo del progreso de lecciones de inglés está aceptado por el usuario (spec, tabla de decisiones).

---

### Task 1: Ingesta de portugués (pt-BR)

**Files:** ninguno (operativo). El CLI imprime un `IngestReport` al terminar.

**Interfaces:**
- Consumes: CLI existente `pnpm --filter @lingoleap/api ingest`.
- Produces: curso `pt-BR / A1` en Supabase; reporte con `wordsRequested`, `materialsBuilt`, `skippedWords`, `lessonCount`, `unitCount` que Task 5 registra en la bitácora.

- [ ] **Step 1: Correr la ingesta**

```bash
pnpm --filter @lingoleap/api ingest --lang pt-BR --level A1 --limit 120
```

Esperado: termina sin excepción e imprime el reporte JSON. Duración estimada: varios minutos (≈120 palabras × 3 proveedores con reintentos).

- [ ] **Step 2: Aplicar el umbral de calidad**

Del reporte: calcular `skippedWords.length / wordsRequested`. Si > 0.30, DETENERSE: revisar los `console.warn` de la corrida para distinguir proveedor caído (reintentar más tarde) de poca cobertura (aceptar con el usuario). Si ≤ 0.30, continuar.

- [ ] **Step 3: Verificar en la base**

```bash
# con las vars de apps/api/.env
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/courses?select=language,level,title"
```

Esperado: aparece `{"language":"pt-BR","level":"A1","title":"Portugués (Brasil) A1"}` junto al curso `en` existente. Guardar el reporte del Step 1 (copiarlo a un archivo temporal o al ledger) para Task 5.

### Task 2: Ingesta de italiano (it)

**Files:** ninguno (operativo).

**Interfaces:**
- Consumes: CLI existente; Task 1 terminada (secuencialidad por rate limits).
- Produces: curso `it / A1` en Supabase; reporte para Task 5.

- [ ] **Step 1: Correr la ingesta**

```bash
pnpm --filter @lingoleap/api ingest --lang it --level A1 --limit 120
```

Esperado: reporte JSON sin excepción.

- [ ] **Step 2: Aplicar el umbral de calidad**

Igual que Task 1 Step 2: `skippedWords.length / wordsRequested` ≤ 0.30 para continuar; si no, detenerse e investigar.

- [ ] **Step 3: Verificar en la base**

Mismo curl de Task 1 Step 3. Esperado: 3 filas si Task 1 pasó (`en`, `pt-BR`, `it`) — el título nuevo es `Italiano A1`. Guardar el reporte para Task 5.

### Task 3: Re-ingesta de inglés (en) a 120 palabras

**Files:** ninguno (operativo).

**Interfaces:**
- Consumes: CLI existente; Tasks 1-2 terminadas.
- Produces: curso `en / A1` reemplazado (~15 lecciones, ids de lección nuevos); reporte para Task 5.

**ADVERTENCIA:** esta corrida borra el curso de inglés actual y con él el progreso de lecciones del usuario (aceptado en el spec). XP/racha/gemas en `user_stats` no se tocan.

- [ ] **Step 1: Correr la ingesta**

```bash
pnpm --filter @lingoleap/api ingest --lang en --level A1 --limit 120
```

Esperado: reporte JSON sin excepción.

- [ ] **Step 2: Aplicar el umbral de calidad**

Igual que Task 1 Step 2.

- [ ] **Step 3: Verificar reemplazo y progreso huérfano**

```bash
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/lessons?select=id&limit=100" | # contar: ~45 lecciones entre los 3 cursos
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/user_progress?select=lesson_id"
```

Esperado: el curso `en` tiene ~15 lecciones nuevas; `user_progress` quedó vacío o solo con filas de lecciones borradas por el cascade (si la FK es ON DELETE CASCADE quedará vacío — ambas cosas son aceptables). Anotar lo observado para la bitácora.

### Task 4: Verificación por API y spot-check en las apps

**Files:** ninguno (manual, con el usuario en el dispositivo).

**Interfaces:**
- Consumes: los 3 cursos en la base; API local (`pnpm --filter @lingoleap/api dev`) y Metro (`npx expo start` en `apps/mobile`) con `adb reverse tcp:8081 tcp:8081` y `tcp:3000 tcp:3000`.
- Produces: veredicto del spot-check para la bitácora (Task 5).

- [ ] **Step 1: Verificar el endpoint público**

```bash
curl -s http://localhost:3000/courses
```

Esperado: array con 3 cursos (`Inglés A1`, `Portugués (Brasil) A1`, `Italiano A1`), cada uno con sus unidades/lecciones.

- [ ] **Step 2: Spot-check móvil (manual, con el usuario)**

Recorrido: en la lista de cursos aparecen los 3 → jugar una lección de portugués (TTS suena con acento brasileño, imágenes cargan, los 4 tipos de ejercicio aparecen) → jugar una de italiano (TTS `it-IT`) → en inglés, camino con `Lección 1` ⭐ y el resto 🔒 (progreso reseteado).

- [ ] **Step 3: Spot-check web (manual, con el usuario)**

`pnpm --filter @lingoleap/web dev` → los 3 cursos en la home → jugar una lección del inglés nuevo → verificar desbloqueo progresivo.

### Task 5: Bitácora y cierre

**Files:**
- Modify: `docs/BITACORA.md` (nueva sección al final, antes de la línea "*Próxima entrada…*")
- Modify: `README.md` (solo si menciona "1 curso" o similar — actualizar a 3 cursos)

**Interfaces:**
- Consumes: los 3 reportes de ingesta (Tasks 1-3) y el veredicto del spot-check (Task 4).

- [ ] **Step 1: Escribir la entrada de bitácora**

Sección `## Fase 5 (mitad 1) — Cursos de portugués e italiano + inglés ampliado (2026-07-18)` con: los 3 reportes de ingesta (tabla: idioma, palabras pedidas, materiales, saltadas, lecciones, unidades), qué pasó con `user_progress` tras el reemplazo de inglés (lo observado en Task 3 Step 3), resultado del spot-check, y actualizar la línea final "*Próxima entrada:*" apuntando a la mitad 2 (despliegue $0).

- [ ] **Step 2: Verificar la suite**

```bash
pnpm lint && pnpm test
```

Esperado: verde (no se tocó código; es un smoke de sanidad).

- [ ] **Step 3: Commit**

```bash
git add docs/BITACORA.md README.md
git commit -m "docs: bitácora de Fase 5 mitad 1 (cursos pt-BR, it y en ampliado)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

---

## Self-review

- Cobertura del spec: ejecución (Tasks 1-3, orden pt-BR→it→en ✓), umbral 30% (Steps 2 ✓), verificación (Task 4 = sección Verificación del spec ✓), cierre en bitácora (Task 5 ✓).
- Sin placeholders; comandos exactos con salidas esperadas.
- Nota: las corridas van directo en master (no hay rama) porque no hay cambios de código — solo docs al final.
