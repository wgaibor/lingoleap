import { describe, expect, it } from 'vitest';
import type { Lesson } from '../exercises';
import { advance, progressRatio, startSession, submitAnswer } from './lesson-session';

const lesson: Lesson = {
  id: 'l1', title: 'L1', position: 1,
  exercises: [
    { id: 'e1', type: 'match-pairs', pairs: [{ left: 'a', right: 'b' }] },
    { id: 'e2', type: 'match-pairs', pairs: [{ left: 'c', right: 'd' }] }
  ]
};

describe('sesión de lección', () => {
  it('flujo completo: responder, feedback, avanzar, terminar', () => {
    let s = startSession(lesson);
    expect(s.phase).toBe('answering');
    expect(progressRatio(s)).toBe(0);

    s = submitAnswer(s, true);
    expect(s.phase).toBe('feedback');
    expect(s.correctCount).toBe(1);
    expect(s.lastAnswerCorrect).toBe(true);
    expect(progressRatio(s)).toBe(0.5);

    s = advance(s);
    expect(s.phase).toBe('answering');
    expect(s.index).toBe(1);

    s = submitAnswer(s, false);
    expect(s.wrongCount).toBe(1);
    s = advance(s);
    expect(s.phase).toBe('finished');
    expect(progressRatio(s)).toBe(1);
  });

  it('no muta el estado anterior', () => {
    const s0 = startSession(lesson);
    const s1 = submitAnswer(s0, true);
    expect(s0.phase).toBe('answering');
    expect(s1).not.toBe(s0);
  });
});
