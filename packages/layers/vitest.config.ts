import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'layers', include: ['test/**/*.test.ts'] },
});
