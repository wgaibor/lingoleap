// Copy en español por id de logro. Vive separado del catálogo puro de packages/core
// (que solo tiene id/categoría/umbral/gemas) para no mezclar texto de UI con lógica —
// la reusa también CompletionScreen (Task 6).
export const ACHIEVEMENT_LABEL: Record<string, string> = {
  'streak-3': 'Racha de 3 días',
  'streak-7': 'Racha de 7 días',
  'streak-30': 'Racha de 30 días',
  'lessons-10': '10 lecciones completadas',
  'lessons-50': '50 lecciones completadas',
  'lessons-100': '100 lecciones completadas',
  'level-5': 'Nivel 5 alcanzado',
  'level-10': 'Nivel 10 alcanzado'
};
