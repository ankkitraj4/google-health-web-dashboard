import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vite's bundled list of recognized Node builtins predates node:sqlite
    // (a very new addition) and otherwise tries to resolve it as an npm
    // package named "sqlite" — force it through untouched.
    server: { deps: { external: [/^node:sqlite$/, /^node:/] } },
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    // Sequential, not parallel workers: several tests share the same
    // in-memory `db` module singleton (see test/setup.ts), and running them
    // in parallel worker threads would each get their own DB anyway but
    // could still race on shared module-level state like caches.
    fileParallelism: false,
  },
});
