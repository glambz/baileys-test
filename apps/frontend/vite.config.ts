import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5176,
    proxy: {
      '/api': {
        // Env-driven so the same config works on the host (default) and in
        // Docker, where the backend is a service name rather than localhost.
        // globalThis.process rather than a bare `process`: this file is
        // linted with the browser globals, where `process` is undefined.
        target: globalThis.process?.env?.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});