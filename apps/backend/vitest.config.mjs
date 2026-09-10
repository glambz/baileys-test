import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs', 'tests/**/*.spec.mjs', 'src/**/*.test.mjs'],
    environment: 'node',
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
    testTimeout: 30000,
  },
});
