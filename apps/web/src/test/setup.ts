import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

if (typeof globalThis.SpeechSynthesisUtterance === 'undefined') {
  class FakeUtterance { text: string; lang = ''; rate = 1; constructor(text: string) { this.text = text; } }
  (globalThis as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance;
}
