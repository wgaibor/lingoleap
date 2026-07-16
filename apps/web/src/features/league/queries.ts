import { useQuery } from '@tanstack/react-query';
import { api } from '../../app/api';

export function useLeague() {
  return useQuery({ queryKey: ['league'], queryFn: () => api.getLeague() });
}
