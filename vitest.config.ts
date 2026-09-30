import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Vitest configuration for VidaBaile test suite.
 *
 * Environment:
 *  - Backend Lambda tests run in 'node' (no DOM needed, full Node APIs).
 *  - Frontend React component tests run in 'jsdom'.
 *
 * The environment is selected per-file via the `@vitest-environment` docblock
 * at the top of each test file, so a single config handles both.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    // Default environment — Lambda tests use Node.
    environment: 'node',

    // Globals: true lets tests use describe/it/expect without importing them.
    globals: true,

    // Run the setup file after the framework is loaded but before each test file.
    setupFiles: ['./src/__tests__/setup.ts'],

    // Pattern — pick up test files anywhere under src/__tests__ or co-located *.test.ts(x).
    include: [
      'src/__tests__/**/*.test.ts',
      'src/__tests__/**/*.test.tsx',
    ],

    // Inline coverage (optional — run with --coverage to activate).
    coverage: {
      provider: 'v8',
      include: [
        'amplify/functions/**/*.ts',
        'amplify/data/resource.ts',
        'src/components/**/*.tsx',
      ],
      exclude: ['**/*.test.*', '**/__tests__/**'],
    },
  },
});
