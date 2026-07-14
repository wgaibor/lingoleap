import { useQuery } from '@tanstack/react-query';
import { api } from '../../app/api';

export function useStats() {
  return useQuery({ queryKey: ['stats'], queryFn: () => api.getStats() });
}
