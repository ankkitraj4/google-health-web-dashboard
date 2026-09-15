import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    css: false,
    // This is a separate workspace from server/ (its own package.json,
    // its own vitest) — without scoping, Vitest's default glob picks up
    // server/test/*.test.ts too and runs backend tests in a jsdom
    // environment with none of the backend's env vars set.
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
