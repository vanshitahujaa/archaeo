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
  //
  // Keep all node_modules deps external (resolved at runtime from the installed package),
  // so the published CLI stays small and optional LLM SDKs are only loaded if present.
  esbuildOptions(options) {
    options.packages = 'external';
  },
  banner: {
    js: '#!/usr/bin/env node',
  },
});
