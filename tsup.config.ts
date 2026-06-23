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
  // node:sqlite is loaded via createRequire in src/storage/sqliteStore.ts so the bundler
  // never sees it as a static import (esbuild strips the `node:` prefix off newer builtins).
  banner: {
    js: '#!/usr/bin/env node',
  },
});
