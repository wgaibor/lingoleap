import { create } from 'zustand';
import { advance, startSession, submitAnswer, type Lesson, type LessonSessionState } from '@lingoleap/core';

interface SessionStore {
  state: LessonSessionState | null;
  start: (lesson: Lesson) => void;
  resolve: (correct: boolean) => void;
  next: () => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  state: null,
  start: (lesson) => set({ state: startSession(lesson) }),
  resolve: (correct) => {
    const current = get().state;
    if (!current) return;
    set({ state: submitAnswer(current, correct) });
  },
  next: () => {
    const current = get().state;
    if (!current) return;
    set({ state: advance(current) });
  },
  reset: () => set({ state: null })
}));
