import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['{shared,functions,web,pdf-renderer}/**/*.test.{ts,tsx}'], environment: 'node' },
});
