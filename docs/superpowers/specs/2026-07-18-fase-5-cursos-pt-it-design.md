# Fase 5 (mitad 1): cursos de portugués e italiano + inglés ampliado

**Fecha:** 2026-07-18
**Estado:** aprobado por el usuario (enfoque A: ingesta directa + verificación manual)

## Objetivo

Que `GET /courses` liste tres cursos A1 (`en`, `pt-BR`, `it`) de ~15 lecciones cada uno,
generados con el pipeline de ingesta existente, y validados con un spot-check en las apps.
**Cero código nuevo**: las dos apps ya listan cursos dinámicamente (`CoursesPage` /
`CoursesScreen`) y `useSpeech` ya mapea los locales `en-US` / `pt-BR` / `it-IT`.

## Decisiones tomadas (brainstorm)

| Decisión | Elección | Alternativas descartadas |
|---|---|---|
| Orden de la Fase 5 | Idiomas primero, despliegue después (sub-proyecto separado) | Despliegue primero; fases separadas |
| Tamaño por curso | `--limit 120` (~15 lecciones) | 80 (~10) y 160+ (riesgo de cuotas) |
| Inglés | Re-ingerir al mismo tamaño para paridad | Dejarlo en 5 lecciones |
| Progreso existente | Se acepta el reseteo del progreso de lecciones de inglés (XP/racha/gemas se conservan; `saveCourse` reemplaza el curso y las lecciones nuevas tienen ids nuevos) | Upsert incremental (sobre-ingeniería para una cuenta de pruebas) |
| Validación | Reporte del CLI + spot-check manual | Script de validación contra la BD (opción B); ajustes al composer (opción C) |

## Ejecución

Tres corridas **secuenciales** (para no sumar rate limits en paralelo), en este orden:

```bash
pnpm --filter @lingoleap/api ingest --lang pt-BR --level A1 --limit 120
pnpm --filter @lingoleap/api ingest --lang it    --level A1 --limit 120
pnpm --filter @lingoleap/api ingest --lang en    --level A1 --limit 120
```

- Cada corrida reemplaza el curso completo de forma atómica (delete con cascade + insert);
  si una falla a medias se re-corre sin dejar estado sucio.
- El orden deja el inglés (el único con progreso que se pierde) al final, por si las cuotas
  se agotan antes.

## Criterio de calidad

Del `IngestReport` de cada corrida: si `skippedWords` supera ~30% de `wordsRequested`,
investigar la causa (proveedor caído vs. poca cobertura del idioma en Tatoeba) antes de dar
por bueno el curso. Bajo ese umbral, las palabras saltadas son pérdida esperada del pipeline.

## Verificación

1. `GET /courses` lista 3 cursos con títulos `Inglés A1`, `Portugués (Brasil) A1`, `Italiano A1`.
2. Spot-check en el móvil: jugar una lección de portugués y una de italiano — TTS con el
   acento correcto, imágenes cargan, los 4 tipos de ejercicio aparecen.
3. Spot-check en la web: abrir el inglés nuevo, jugar una lección, camino con 🔒 en las
   lecciones posteriores a la primera no completada.

## Riesgos

- **MyMemory**: límite diario de caracteres para uso anónimo; si se agota, la corrida
  restante se hace al día siguiente (el orden de corridas minimiza el impacto).
- **Pexels**: 200 req/hora; 120 palabras por corrida entra justo — por eso las corridas son
  secuenciales.
- **Cobertura de Tatoeba** en pt-BR/it para palabras A1: esperable alguna palabra saltada;
  lo cubre el umbral del 30%.

## Cierre

Entrada en `docs/BITACORA.md` con los tres reportes de ingesta y el resultado del
spot-check. La mitad 2 de la Fase 5 (despliegue $0) se brainstormea como sub-proyecto
separado después de esta.
