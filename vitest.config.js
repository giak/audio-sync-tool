import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['static/**/*.test.{js,ts}'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['static/**/*.ts'],
      exclude: ['static/**/*.test.ts', 'static/**/*.js'],
      excludeAfterRemap: true,
      reporter: ['text', 'text-summary'],
    },
  },
});
