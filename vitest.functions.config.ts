import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for Lambda function unit tests under amplify/functions/.
 * The root vitest.config.ts intentionally excludes amplify/** (those files target Node,
 * not jsdom). This config targets that subtree with a Node environment.
 *
 * env: These values are injected into process.env BEFORE any module code runs,
 * which is necessary because Lambda handler modules capture env vars as module-level
 * constants (e.g. `const FLOW_ID = process.env.WHATSAPP_FLOW_ID ?? ""`).
 * vi.stubEnv() inside test files runs too late (after ESM static imports are hoisted).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["amplify/functions/**/*.{test,spec}.{ts,tsx}"],
    env: {
      TABLE_NAME:             "test-table",
      WHATSAPP_ACCESS_TOKEN:  "tok",
      WHATSAPP_PHONE_ID:      "12345",
      WHATSAPP_FLOW_ID:       "flow-99",
      FLOW_PRIVATE_KEY:       "fake-key",
    },
  },
});
