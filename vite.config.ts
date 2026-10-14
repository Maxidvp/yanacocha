import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build:single` genera un único dist-single/index.html autocontenido
// (útil para compartir el simulador como un archivo o publicarlo).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  build: mode === 'single' ? { outDir: 'dist-single' } : { outDir: 'dist' },
  test: { include: ['tests/**/*.test.ts'] },
}));
