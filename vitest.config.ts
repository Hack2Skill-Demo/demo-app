import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['{shared,functions,web}/**/*.test.{ts,tsx}'], environment: 'node' },
});
