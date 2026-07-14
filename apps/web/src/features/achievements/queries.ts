import { useQuery } from '@tanstack/react-query';
import { api } from '../../app/api';

export function useAchievements() {
  return useQuery({ queryKey: ['achievements'], queryFn: () => api.getAchievements() });
}
