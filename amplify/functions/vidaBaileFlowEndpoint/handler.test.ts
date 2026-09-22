/**
 * handler.test.ts — vidaBaileFlowEndpoint
 *
 * Tasks 5.5 and 5.6 of the whatsapp-flow-immediate-delivery-failure bugfix spec.
 *
 * Task 5.5: Structured error log on decryption failure
 *   Asserts that when decryption fails (malformed body), console.error is called
 *   with a structured object containing a `likelyCause` key, and the outer catch
 *   logs action: "UNKNOWN (decryption failed)".
 *
 * Task 5.6: RSA key mismatch detected and logged
 *   Asserts that when crypto.privateDecrypt throws an RSA-specific error, the
 *   structured log contains likelyCause indicating "RSA key mismatch".
 *
 * NOTE on env vars:
 *   FLOW_PRIVATE_KEY and other env vars are injected via vitest.functions.config.ts
 *   `test.env` so they are present before any module-level const is evaluated.
 *
 * NOTE on crypto mocking:
 *   crypto.privateDecrypt is non-configurable in Node's built-in module, so
 *   vi.spyOn cannot redefine it. We use vi.mock("crypto") with a factory.
 *   The mock variable is declared with vi.hoisted() so it is available when the
 *   hoisted vi.mock factory runs (before any import statement executes).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoist the mock variable so it is accessible inside the vi.mock factory ───
// vi.hoisted() callbacks execute at the same time as vi.mock() factories —
// before any import statement, before module evaluation.
const { privateDecryptMock } = vi.hoisted(() => {
  const privateDecryptMock = vi.fn();
  return { privateDecryptMock };
});

// ── Mock crypto — wrap privateDecrypt in a vi.fn() so it can be overridden ───
vi.mock("crypto", async () => {
  const actual = await vi.importActual<typeof import("crypto")>("crypto");
  // Default implementation: call through to real crypto so Task 5.5 gets
  // a genuine crypto error from garbage input without special setup.
  privateDecryptMock.mockImplementation(
    (...args: Parameters<typeof actual.privateDecrypt>) => actual.privateDecrypt(...args)
  );
  return {
    ...actual,
    privateDecrypt: privateDecryptMock,
  };
});

// ── Mock @aws-sdk/client-dynamodb to prevent real DynamoDB calls ─────────────
vi.mock("@aws-sdk/client-dynamodb", () => {
  const sendFn = vi.fn().mockResolvedValue({});
  const DynamoDBClientMock    = vi.fn().mockImplementation(() => ({ send: sendFn }));
  const QueryCommandMock      = vi.fn().mockImplementation((input: any) => ({ input }));
  const GetItemCommandMock    = vi.fn().mockImplementation((input: any) => ({ input }));
  const UpdateItemCommandMock = vi.fn().mockImplementation((input: any) => ({ input }));
  return {
    DynamoDBClient:    DynamoDBClientMock,
    QueryCommand:      QueryCommandMock,
    GetItemCommand:    GetItemCommandMock,
    UpdateItemCommand: UpdateItemCommandMock,
  };
});

// ── Mock @smithy/node-http-handler to avoid real HTTP transport setup ─────────
vi.mock("@smithy/node-http-handler", () => ({
  NodeHttpHandler: vi.fn().mockImplementation(() => ({})),
}));

// Import handler after mocks are registered (vi.mock calls are hoisted by Vitest)
import { handler } from "./handler.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal API Gateway proxy event */
function makeEvent(body: Record<string, unknown>) {
  return {
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

// ── Reset between tests ───────────────────────────────────────────────────────
beforeEach(async () => {
  vi.clearAllMocks();
  // Restore the default call-through so Task 5.5 gets real crypto errors
  const actual = await vi.importActual<typeof import("crypto")>("crypto");
  privateDecryptMock.mockImplementation(
    (...args: Parameters<typeof actual.privateDecrypt>) => actual.privateDecrypt(...args)
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ════════════════════════════════════════════════════════════════════════════
// TASK 5.5 — Structured error log on decryption failure
// Feature: whatsapp-flow-immediate-delivery-failure, Property: decryption error logs likelyCause
// ════════════════════════════════════════════════════════════════════════════

describe("Task 5.5 — Structured error log on malformed-body decryption failure", () => {
  it(
    // Feature: whatsapp-flow-immediate-delivery-failure, Property: decryption error logs likelyCause
    "WHEN the body has bad base64 fields THEN console.error is called with likelyCause and outer catch logs UNKNOWN action",
    async () => {
      // Arrange — body passes JSON.parse but fields are not valid RSA/AES ciphertext.
      // The real crypto.privateDecrypt (called via the pass-through mock) throws a
      // crypto error when trying to decrypt garbage bytes.
      const event = makeEvent({
        encrypted_aes_key:   "bad",
        encrypted_flow_data: "bad",
        initial_vector:      "bad",
      });

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Act
      const result = await handler(event as any);

      // Assert — handler must return HTTP 500
      expect(result.statusCode).toBe(500);

      // Assert — decryption-specific structured log was emitted
      const decryptionCall = errorSpy.mock.calls.find(
        (call) => call[0] === "❌ Decryption failed:"
      );
      expect(decryptionCall).toBeDefined();
      const decryptionDetails = decryptionCall?.[1];
      expect(decryptionDetails).toBeDefined();
      expect(decryptionDetails).toHaveProperty("likelyCause");

      // Assert — outer catch log contains action = "UNKNOWN (decryption failed)"
      const outerCatchCall = errorSpy.mock.calls.find(
        (call) => call[0] === "❌ Flow execution error:"
      );
      expect(outerCatchCall).toBeDefined();
      const outerDetails = outerCatchCall?.[1];
      expect(outerDetails).toBeDefined();
      expect(outerDetails).toHaveProperty("action", "UNKNOWN (decryption failed)");
    }
  );
});

// ════════════════════════════════════════════════════════════════════════════
// TASK 5.6 — RSA key mismatch detected and logged
// Feature: whatsapp-flow-immediate-delivery-failure, Property: RSA key mismatch logged as likelyCause
// ════════════════════════════════════════════════════════════════════════════

describe("Task 5.6 — RSA key mismatch detected and logged with correct likelyCause", () => {
  it(
    // Feature: whatsapp-flow-immediate-delivery-failure, Property: RSA key mismatch logged as likelyCause
    "WHEN crypto.privateDecrypt throws ERR_OSSL_RSA_PKCS_DECRYPTION_ERROR THEN likelyCause describes key mismatch",
    async () => {
      // Arrange — override the mock to throw an RSA-specific error
      const rsaError: any = new Error("RSA_PKCS_DECRYPTION_ERROR");
      rsaError.code = "ERR_OSSL_RSA_PKCS_DECRYPTION_ERROR";

      privateDecryptMock.mockImplementation(() => {
        throw rsaError;
      });

      // Body passes JSON.parse and has all required fields; values are valid base64
      // (zeroed buffers) so Buffer.from() succeeds and we reach crypto.privateDecrypt.
      const event = makeEvent({
        encrypted_aes_key:   Buffer.alloc(32).toString("base64"),
        encrypted_flow_data: Buffer.alloc(32).toString("base64"),
        initial_vector:      Buffer.alloc(16).toString("base64"),
      });

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Act
      const result = await handler(event as any);

      // Assert — HTTP 500
      expect(result.statusCode).toBe(500);

      // Assert — decryption-specific log contains RSA key mismatch likelyCause
      const decryptionCall = errorSpy.mock.calls.find(
        (call) => call[0] === "❌ Decryption failed:"
      );
      expect(decryptionCall).toBeDefined();
      const decryptionDetails = decryptionCall?.[1];
      expect(decryptionDetails).toHaveProperty(
        "likelyCause",
        "RSA key mismatch — check FLOW_PRIVATE_KEY secret matches Meta Flow public key"
      );
    }
  );
});
