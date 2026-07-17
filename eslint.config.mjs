import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**', 'apps/mobile/.expo/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error'
    }
  },
  {
    // Config de Expo/Metro/Jest: CommonJS puro, corre en Node fuera del build de la app.
    files: ['apps/mobile/metro.config.js', 'apps/mobile/jest.config.js', 'apps/mobile/jest.setup.ts'],
    languageOptions: {
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' }
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  }
);
