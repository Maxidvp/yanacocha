import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build:single` genera un único dist-single/index.html autocontenido
// (útil para compartir el simulador como un archivo o publicarlo).
// El build normal usa base '/' para que /en (versión en inglés) cargue los assets desde la raíz.
export default defineConfig(({ mode }) => ({
  base: mode === 'single' ? './' : '/',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  build: mode === 'single' ? { outDir: 'dist-single' } : { outDir: 'dist' },
  test: { include: ['tests/**/*.test.ts'] },
}));
