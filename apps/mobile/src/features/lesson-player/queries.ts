import { useQuery } from '@tanstack/react-query';
import { api } from '../../app/api';

export function useLesson(lessonId: string | undefined) {
  return useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: () => api.getLesson(lessonId as string),
    enabled: Boolean(lessonId)
  });
}
