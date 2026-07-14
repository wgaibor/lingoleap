import { Link } from 'react-router-dom';
import type { LearningLanguage } from '@lingoleap/core';
import { useAuth } from '../auth/useAuth';
import { StatsBar } from '../stats/StatsBar';
import { useCourses } from './queries';

const LANGUAGE_FLAG: Record<LearningLanguage, string> = {
  en: '🇺🇸',
  'pt-BR': '🇧🇷',
  it: '🇮🇹'
};

export function CoursesPage() {
  const { signOut } = useAuth();
  const coursesQuery = useCourses();

  return (
    <div className="container">
      <StatsBar />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-lg)'
        }}
      >
        <h2>Cursos</h2>
        <button type="button" className="button-secondary" onClick={() => void signOut()}>
          Salir
        </button>
      </div>

      {coursesQuery.isPending && <p>Cargando…</p>}
      {coursesQuery.isError && <p role="alert">No pudimos cargar el curso</p>}

      {coursesQuery.data && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
          {coursesQuery.data.map((course) => (
            <Link
              key={course.id}
              to={'/course/' + course.language + '/' + course.level}
              className="button-secondary"
              style={{
                display: 'block',
                width: 200,
                textDecoration: 'none',
                textAlign: 'center',
                padding: 'var(--space-md)'
              }}
            >
              <div style={{ fontSize: '2rem' }}>{LANGUAGE_FLAG[course.language]}</div>
              <div>{course.title}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
