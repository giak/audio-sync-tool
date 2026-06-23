import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['static/src/**/*.test.{js,ts}'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['static/src/**/*.ts'],
      exclude: ['static/src/**/*.test.ts', 'static/dist/**'],
      excludeAfterRemap: true,
      reporter: ['text', 'text-summary'],
    },
  },
});
