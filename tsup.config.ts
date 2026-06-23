import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  dts: false,
  // node:sqlite is a built-in; never bundle it.
  external: ['node:sqlite'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
