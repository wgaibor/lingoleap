import type { Lesson } from '@lingoleap/core';
import { useSessionStore } from './sessionStore';

const lesson: Lesson = {
  id: 'l1',
  title: 'Lección 1',
  position: 1,
  exercises: [
    { id: 'e1', type: 'translate', sourceText: 'hola', correctAnswer: 'hello', wordBank: ['hello', 'bye'], audioUrl: null },
    { id: 'e2', type: 'translate', sourceText: 'adiós', correctAnswer: 'bye', wordBank: ['hello', 'bye'], audioUrl: null }
  ]
};

describe('sessionStore', () => {
  beforeEach(() => useSessionStore.getState().reset());

  it('start crea la sesión y resolve/next delegan en core', () => {
    useSessionStore.getState().start(lesson);
    expect(useSessionStore.getState().state?.phase).toBe('answering');
    useSessionStore.getState().resolve(false);
    expect(useSessionStore.getState().state?.phase).toBe('feedback');
    expect(useSessionStore.getState().state?.wrongCount).toBe(1);
    useSessionStore.getState().next();
    expect(useSessionStore.getState().state?.index).toBe(1);
  });

  it('resolve/next sin sesión no rompen; reset vuelve a null', () => {
    useSessionStore.getState().resolve(true);
    useSessionStore.getState().next();
    expect(useSessionStore.getState().state).toBeNull();
    useSessionStore.getState().start(lesson);
    useSessionStore.getState().reset();
    expect(useSessionStore.getState().state).toBeNull();
  });
});
