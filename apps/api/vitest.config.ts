import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: [path.resolve(__dirname, './tests/setup.ts')],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
