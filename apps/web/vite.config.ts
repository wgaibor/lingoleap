import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Los paquetes del workspace compilan a CommonJS (NestJS los consume);
  // en dev Vite no pre-transforma dependencias enlazadas, así que hay que
  // incluirlas explícitamente para que esbuild las convierta a ESM.
  optimizeDeps: {
    include: ['@lingoleap/core', '@lingoleap/api-client']
  },
  build: {
    commonjsOptions: {
      include: [/packages\/core/, /packages\/api-client/, /node_modules/]
    }
  }
});
