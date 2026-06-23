import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['static/**/*.test.js'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['static/**/*.js'],
      exclude: ['static/**/*.test.js'],
      reporter: ['text', 'text-summary'],
    },
  },
});
