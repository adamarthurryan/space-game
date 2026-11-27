import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.ts'],
    // UI tests opt in to the DOM with a `// @vitest-environment jsdom` comment.
    environment: 'node',
  },
});
