import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@acm/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/playwright/**'],
    setupFiles: [path.resolve(__dirname, './src/test/setup.ts')],
  },
});
