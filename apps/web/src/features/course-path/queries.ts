import { useQuery } from '@tanstack/react-query';
import type { CEFRLevel, LearningLanguage } from '@lingoleap/core';
import { api } from '../../app/api';

export function useCourses() {
  return useQuery({
    queryKey: ['courses'],
    queryFn: () => api.listCourses()
  });
}

export function useCourse(language: LearningLanguage, level: CEFRLevel) {
  return useQuery({
    queryKey: ['course', language, level],
    queryFn: () => api.getCourse(language, level)
  });
}

export function useProgress() {
  return useQuery({
    queryKey: ['progress'],
    queryFn: () => api.getCompletedLessonIds()
  });
}
