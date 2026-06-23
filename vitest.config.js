import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['static/**/*.test.{js,ts}'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['static/**/*.{js,ts}'],
      exclude: ['static/**/*.test.{js,ts}'],
      reporter: ['text', 'text-summary'],
    },
  },

});
