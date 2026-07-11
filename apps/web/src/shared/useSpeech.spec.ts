import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSpeech } from './useSpeech';

describe('useSpeech', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pronuncia con el idioma correcto', () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak, cancel });
    const { result } = renderHook(() => useSpeech('pt-BR'));
    expect(result.current.supported).toBe(true);
    result.current.speak('Bom dia');
    expect(cancel).toHaveBeenCalled();
    const utterance = speak.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.text).toBe('Bom dia');
    expect(utterance.lang).toBe('pt-BR');
  });

  it('reporta no soportado sin speechSynthesis', () => {
    vi.stubGlobal('speechSynthesis', undefined);
    const { result } = renderHook(() => useSpeech('en'));
    expect(result.current.supported).toBe(false);
    expect(() => result.current.speak('hello')).not.toThrow();
  });
});
