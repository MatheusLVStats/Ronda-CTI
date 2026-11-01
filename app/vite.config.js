import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// O app compilado vai para a raiz do repositório, que é o que o GitHub Pages publica.
// O código-fonte fica em app/.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react()],
  // O leitor de PDF roda num worker; módulo ES para funcionar nos navegadores dos PCs do hospital.
  worker: { format: 'es' },
  build: {
    outDir: repoRoot,
    emptyOutDir: false,
    assetsDir: 'assets',
    // Computadores do hospital: Chrome/Edge 86+ (requisito do CriticalEye).
    target: ['chrome86', 'edge86', 'firefox78', 'safari14'],
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
