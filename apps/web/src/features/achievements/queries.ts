import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../app/api';

export function useAchievements() {
  return useQuery({ queryKey: ['achievements'], queryFn: () => api.getAchievements() });
}

export function useBuyStreakFreeze() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.buyStreakFreeze(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    }
  });
}
