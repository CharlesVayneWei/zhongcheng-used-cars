import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': new URL('./', import.meta.url).pathname } },
  test: { exclude: ['node_modules/**', '.next/**', 'dist/**'] },
});
