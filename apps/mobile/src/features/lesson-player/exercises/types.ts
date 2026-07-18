/** Contrato común de todos los componentes de ejercicio (idéntico al de apps/web). */
export interface ExerciseComponentProps<E> {
  exercise: E;
  /** Se llama UNA vez cuando el usuario resuelve el ejercicio. */
  onResolve: (correct: boolean) => void;
}
