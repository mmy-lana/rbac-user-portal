import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@rbac/shared': path.resolve(dirname, '../../packages/shared/src/index.ts'),
      '@rbac/ui': path.resolve(dirname, '../../packages/ui/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    host: true,
    // Same-origin reverse proxy: the browser talks only to :5173, so requests
    // never cross origins (no CORS preflights) and credentials cookies ride
    // along naturally on every API call.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
