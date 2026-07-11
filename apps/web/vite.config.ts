import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    commonjsOptions: {
      include: [/packages\/core/, /packages\/api-client/, /node_modules/]
    }
  }
});
