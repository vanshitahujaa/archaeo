import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Fixture-repo creation and git plumbing make some tests slower than the default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
