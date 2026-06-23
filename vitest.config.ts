import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

/**
 * Vite 5 / Node 26: `node:sqlite` is a Node 22.5+ built-in that is NOT in Node's
 * `builtinModules` list (which only covers stable, non-prefixed names), so Vite 5's
 * `isBuiltin()` check misses it and tries to resolve it as a package file.
 *
 * Fix: intercept in `resolveId` (return the canonical id) and in `load` (return the
 * live module via `require()` so Vite's SSR load pipeline gets real code instead of
 * hitting the filesystem for a file that does not exist).
 */
const nodeSqliteExternalPlugin: Plugin = {
  name: 'externalize-node-sqlite',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'node:sqlite' || id === 'sqlite') {
      return '\0virtual:node-sqlite';
    }
  },
  load(id) {
    if (id === '\0virtual:node-sqlite') {
      // Re-export everything from the real built-in using CJS require so this
      // virtual module provides the live bindings to the test runner.
      return `
        import { createRequire } from 'module';
        const _req = createRequire(import.meta.url);
        const _m = _req('node:sqlite');
        export const DatabaseSync = _m.DatabaseSync;
        export const StatementSync = _m.StatementSync;
        export default _m;
      `;
    }
  },
};

export default defineConfig({
  plugins: [nodeSqliteExternalPlugin],
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Fixture-repo creation and git plumbing make some tests slower than the default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
