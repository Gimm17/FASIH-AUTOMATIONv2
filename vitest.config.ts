import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@matching': resolve(__dirname, 'src/matching'),
      '@excel': resolve(__dirname, 'src/excel'),
      '@ai': resolve(__dirname, 'src/ai'),
      '@site': resolve(__dirname, 'src/site/fasih'),
      '@core': resolve(__dirname, 'src/core'),
      '@persistence': resolve(__dirname, 'src/persistence'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/matching/**', 'src/excel/**', 'src/ai/schemas.ts', 'src/shared/uuid.ts'],
    },
  },
});
