import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['mcp/test/**/*.test.ts', 'web/test/**/*.test.ts'],
    testTimeout: 10_000
  }
});
