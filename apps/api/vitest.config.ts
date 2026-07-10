import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/*.spec.ts'],
    environment: 'node'
  },
  plugins: [swc.vite({ module: { type: 'es6' } })]
});
