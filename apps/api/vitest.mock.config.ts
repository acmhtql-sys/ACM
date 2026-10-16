import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: [], // Zero live DB connection during mock unit testing
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
