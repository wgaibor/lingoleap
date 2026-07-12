import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <p>Cargando…</p>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
