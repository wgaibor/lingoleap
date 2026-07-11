/** Contrato común de todos los componentes de ejercicio (reutilizado por Translate/Listening). */
export interface ExerciseComponentProps<E> {
  exercise: E;
  /** Se llama UNA vez cuando el usuario resuelve el ejercicio. */
  onResolve: (correct: boolean) => void;
}
