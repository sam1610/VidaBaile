/**
 * handler.test.ts — vidaBaileProcessOutboundQueue
 *
 * Two-phase bugfix test suite for whatsapp-flow-immediate-delivery-failure.
 *
 * Phase 1 (Task 1 → updated in Task 5.1): Fix-verification test.
 *   Property 1: When Flow send returns 400, the handler falls back to plain-text,
 *   writes a BROADCAST_RECEIPT with deliveryStatus="SENT_FALLBACK", and the record
 *   does NOT enter batchItemFailures. PASSES on fixed code — confirms fix works.
 *
 * Phase 2 (Task 2): Preservation baselines — must pass on BOTH unfixed and fixed code.
 *   Property 2: Successful Flow send writes SENT receipt.
 *   Property 3: Non-promo records use direct plain-text path unchanged.
 *
 * Phase 3 (Tasks 5.2–5.4): Fix-checking unit tests.
 *   5.2: Fallback WAMID stored correctly in gsi1pk.
 *   5.3: Double failure (Flow 400 + fallback 400) routes record to batchItemFailures.
 *   5.4: Batch isolation — one record's fallback failure does not affect other records.
 *
 * NOTE on env vars + ESM:
 *   Because the handler captures env vars as module-level const values, we must set
 *   process.env BEFORE the handler module is evaluated. In ESM, static imports are
 *   hoisted above executable statements, so we use vi.mock + dynamic import instead.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// NOTE: Required env vars (TABLE_NAME, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_ID,
// WHATSAPP_FLOW_ID) are injected via vitest.functions.config.ts `test.env` so they
// are present before any module-level const is evaluated. Do NOT set them here —
// vi.stubEnv / process.env assignments in test files run after ESM static imports.

// ── 2. Mock @aws-sdk/client-dynamodb ─────────────────────────────────────────
// Capture PutItemCommand inputs in a module-scope array that the factory can
// safely mutate (avoids the temporal dead-zone / hoisting issue with `const`).
const capturedPutItemInputs: any[] = [];

vi.mock("@aws-sdk/client-dynamodb", () => {
  const sendFn = vi.fn().mockResolvedValue({});
  const PutItemCommandMock = vi.fn().mockImplementation((input: any) => {
    capturedPutItemInputs.push(input);
    return { input };
  });
  const DynamoDBClientMock = vi.fn().mockImplementation(() => ({ send: sendFn }));
  return {
    DynamoDBClient: DynamoDBClientMock,
    PutItemCommand: PutItemCommandMock,
  };
});

// ── 3. Import handler + mock references after mock registration ───────────────
// Using static import is safe here because vi.mock() calls are hoisted by
// Vitest's transform before any import statement executes.
import { handler }        from "./handler.js";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal SQS event with a single record */
function makeSqsEvent(overrides: Record<string, unknown> = {}, messageId = "msg-001") {
  const body = {
    adminSub:           "admin#test",
    broadcastId:        "bc-1",
    campaignId:         "bc-1",
    recipientPhone:     "+97312345678",
    recipientName:      "Dancer",
    templateName:       "promo_offer",
    promotionalContent: "Test offer",
    packageIntent:      "pkg1",
    ...overrides,
  };
  return {
    Records: [{ messageId, body: JSON.stringify(body) }],
  };
}

/** Build a minimal SQS event with multiple records */
function makeSqsEventMulti(records: Array<{ overrides?: Record<string, unknown>; messageId: string }>) {
  return {
    Records: records.map(({ overrides = {}, messageId }) => {
      const body = {
        adminSub:           "admin#test",
        broadcastId:        "bc-1",
        campaignId:         "bc-1",
        recipientPhone:     "+97312345678",
        recipientName:      "Dancer",
        templateName:       "promo_offer",
        promotionalContent: "Test offer",
        packageIntent:      "pkg1",
        ...overrides,
      };
      return { messageId, body: JSON.stringify(body) };
    }),
  };
}

// ── Reset between tests ───────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  capturedPutItemInputs.length = 0;
});

// ════════════════════════════════════════════════════════════════════════════
// TASK 5.1 — Property 1: Fix verified — fallback sends SENT_FALLBACK receipt
// (Updated from Task 1 exploration test; now asserts FIXED behaviour)
// Feature: whatsapp-flow-immediate-delivery-failure, Property 1: fix verified — fallback sends SENT_FALLBACK receipt
// ════════════════════════════════════════════════════════════════════════════

describe("Task 5.1 — Property 1: Fix verified — Flow 400 triggers fallback, writes SENT_FALLBACK receipt", () => {
  it(
    // Feature: whatsapp-flow-immediate-delivery-failure, Property 1: fix verified — fallback sends SENT_FALLBACK receipt
    "WHEN promo_offer Flow send returns 400 THEN fallback plain-text is sent, batchItemFailures is empty, and BROADCAST_RECEIPT has deliveryStatus=SENT_FALLBACK",
    async () => {
      // Arrange: two sequential fetch mocks
      //   Call 1 (Flow interactive): 400 flow_is_not_published
      //   Call 2 (plain-text fallback): 200 + WAMID
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok:     false,
          status: 400,
          json:   async () => ({ error: { message: "flow_is_not_published" } }),
        })
        .mockResolvedValueOnce({
          ok:     true,
          status: 200,
          json:   async () => ({ messages: [{ id: "wamid.FALLBACK001" }] }),
        });
      vi.stubGlobal("fetch", fetchMock);

      const event = makeSqsEvent();

      // Act
      const result = await handler(event);

      // Assert 1: fallback succeeded — no SQS retry needed
      expect(result.batchItemFailures).toHaveLength(0);

      // Assert 2: BROADCAST_RECEIPT written exactly once
      expect(PutItemCommand).toHaveBeenCalledTimes(1);

      // Assert 3: receipt carries SENT_FALLBACK status and fallback WAMID
      const putInput = capturedPutItemInputs[0];
      expect(putInput?.Item?.deliveryStatus?.S).toBe("SENT_FALLBACK");
      expect(putInput?.Item?.gsi1pk?.S).toBe("MSG#wamid.FALLBACK001");

      // Assert 4: fetch called exactly twice (Flow attempt + fallback)
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  );
});

// ════════════════════════════════════════════════════════════════════════════
// TASK 2 — Property 2: Preservation — successful Flow send writes SENT receipt
// Feature: whatsapp-flow-immediate-delivery-failure, Property 2: successful Flow send writes SENT receipt
// ════════════════════════════════════════════════════════════════════════════

describe("Task 2 — Property 2: Preservation — successful Flow send writes SENT receipt", () => {
  it(
    // Feature: whatsapp-flow-immediate-delivery-failure, Property 2: successful Flow send writes SENT receipt
    "WHEN promo_offer Flow send succeeds THEN batchItemFailures is empty and BROADCAST_RECEIPT has deliveryStatus=SENT",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            promotionalContent: fc.string({ maxLength: 100 }),
            packageIntent:      fc.string({ maxLength: 20 }),
            recipientName:      fc.string({ maxLength: 50 }),
          }),
          async ({ promotionalContent, packageIntent, recipientName }) => {
            // Reset between property runs
            vi.clearAllMocks();
            capturedPutItemInputs.length = 0;

            vi.stubGlobal(
              "fetch",
              vi.fn().mockResolvedValue({
                ok:     true,
                status: 200,
                json:   async () => ({ messages: [{ id: "wamid.PRESERVE1" }] }),
              })
            );

            const event = makeSqsEvent({ promotionalContent, packageIntent, recipientName });
            const result = await handler(event);

            // batchItemFailures must be empty
            expect(result.batchItemFailures).toHaveLength(0);

            // PutItemCommand must have been called exactly once
            expect(PutItemCommand).toHaveBeenCalledTimes(1);

            // Verify deliveryStatus and gsi1pk on the receipt
            const putInput = capturedPutItemInputs[0];
            expect(putInput?.Item?.deliveryStatus?.S).toBe("SENT");
            expect(putInput?.Item?.gsi1pk?.S).toBe("MSG#wamid.PRESERVE1");
          }
        ),
        { numRuns: 50 }
      );
    }
  );
});

// ════════════════════════════════════════════════════════════════════════════
// TASK 2 — Property 3: Preservation — non-promo records use direct plain-text path
// Feature: whatsapp-flow-immediate-delivery-failure, Property 3: non-promo records use direct plain-text path
// ════════════════════════════════════════════════════════════════════════════

describe("Task 2 — Property 3: Preservation — non-promo records unchanged", () => {
  it(
    // Feature: whatsapp-flow-immediate-delivery-failure, Property 3: non-promo records use direct plain-text path
    "WHEN templateName !== promo_offer THEN batchItemFailures is empty and fetch is called exactly once with no fallback",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string().filter((s) => s !== "promo_offer"),
          async (templateName) => {
            // Reset between property runs
            vi.clearAllMocks();
            capturedPutItemInputs.length = 0;

            const fetchMock = vi.fn().mockResolvedValue({
              ok:     true,
              status: 200,
              json:   async () => ({ messages: [{ id: "wamid.PRESERVE2" }] }),
            });
            vi.stubGlobal("fetch", fetchMock);

            const event = makeSqsEvent({ templateName });
            const result = await handler(event);

            // batchItemFailures must be empty
            expect(result.batchItemFailures).toHaveLength(0);

            // PutItemCommand called exactly once
            expect(PutItemCommand).toHaveBeenCalledTimes(1);

            // deliveryStatus must be SENT (no fallback path)
            const putInput = capturedPutItemInputs[0];
            expect(putInput?.Item?.deliveryStatus?.S).toBe("SENT");

            // fetch called exactly ONCE — no fallback second call
            expect(fetchMock).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 50 }
      );
    }
  );
});

// ════════════════════════════════════════════════════════════════════════════
// TASK 5.2 — Fallback WAMID stored correctly in gsi1pk / gsi1sk
// Feature: whatsapp-flow-immediate-delivery-failure, Property: fallback WAMID stored in gsi1pk
// Requirements: 2.6, 3.2
// ════════════════════════════════════════════════════════════════════════════

describe("Task 5.2 — Fallback WAMID is stored correctly in BROADCAST_RECEIPT", () => {
  it(
    "WHEN Flow returns 400 and fallback succeeds with wamid.FB42 THEN gsi1pk=MSG#wamid.FB42, gsi1sk=WEBHOOK, deliveryStatus=SENT_FALLBACK",
    async () => {
      // Arrange
      vi.stubGlobal(
        "fetch",
        vi.fn()
          .mockResolvedValueOnce({
            ok:     false,
            status: 400,
            json:   async () => ({ error: { message: "flow_is_not_published" } }),
          })
          .mockResolvedValueOnce({
            ok:     true,
            status: 200,
            json:   async () => ({ messages: [{ id: "wamid.FB42" }] }),
          })
      );

      // Act
      await handler(makeSqsEvent());

      // Assert
      expect(PutItemCommand).toHaveBeenCalledTimes(1);
      const item = capturedPutItemInputs[0]?.Item;
      expect(item?.gsi1pk?.S).toBe("MSG#wamid.FB42");
      expect(item?.gsi1sk?.S).toBe("WEBHOOK");
      expect(item?.deliveryStatus?.S).toBe("SENT_FALLBACK");
    }
  );
});

// ════════════════════════════════════════════════════════════════════════════
// TASK 5.3 — Double failure (Flow 400 + fallback 400) routes to batchItemFailures
// Feature: whatsapp-flow-immediate-delivery-failure, Property: double failure routes to batchItemFailures
// Requirements: 3.7
// ════════════════════════════════════════════════════════════════════════════

describe("Task 5.3 — Double failure routes record to batchItemFailures with no receipt written", () => {
  it(
    "WHEN Flow returns 400 AND fallback also returns 400 THEN record is in batchItemFailures and PutItemCommand is never called",
    async () => {
      // Arrange: both calls fail
      vi.stubGlobal(
        "fetch",
        vi.fn()
          .mockResolvedValueOnce({
            ok:     false,
            status: 400,
            json:   async () => ({ error: { message: "flow_is_not_published" } }),
          })
          .mockResolvedValueOnce({
            ok:     false,
            status: 400,
            json:   async () => ({ error: { message: "unable to deliver message" } }),
          })
      );

      const event = makeSqsEvent();

      // Act
      const result = await handler(event);

      // Assert 1: record enters batchItemFailures for SQS retry
      expect(result.batchItemFailures).toContainEqual({ itemIdentifier: "msg-001" });

      // Assert 2: no BROADCAST_RECEIPT written since neither send succeeded
      expect(PutItemCommand).not.toHaveBeenCalled();
    }
  );
});

// ════════════════════════════════════════════════════════════════════════════
// TASK 5.4 — Batch isolation: fallback failure on one record does not affect others
// Feature: whatsapp-flow-immediate-delivery-failure, Property: batch isolation
// Requirements: 3.7
// ════════════════════════════════════════════════════════════════════════════

describe("Task 5.4 — Batch isolation: failed record does not poison successful sibling", () => {
  it(
    "WHEN record A (promo_offer) has Flow+fallback both fail AND record B (plain_text) succeeds THEN only msg-A is in batchItemFailures and PutItemCommand called once for B with deliveryStatus=SENT",
    async () => {
      // Arrange: 3 fetch calls in order
      //   Call 1: msg-A Flow attempt    → 400
      //   Call 2: msg-A fallback attempt → 400
      //   Call 3: msg-B plain-text send  → 200 + WAMID
      vi.stubGlobal(
        "fetch",
        vi.fn()
          .mockResolvedValueOnce({
            // msg-A: Flow fails
            ok:     false,
            status: 400,
            json:   async () => ({ error: { message: "flow_is_not_published" } }),
          })
          .mockResolvedValueOnce({
            // msg-A: fallback also fails
            ok:     false,
            status: 400,
            json:   async () => ({ error: { message: "unable to deliver message" } }),
          })
          .mockResolvedValueOnce({
            // msg-B: plain-text succeeds
            ok:     true,
            status: 200,
            json:   async () => ({ messages: [{ id: "wamid.B001" }] }),
          })
      );

      const event = makeSqsEventMulti([
        { messageId: "msg-A", overrides: { templateName: "promo_offer" } },
        { messageId: "msg-B", overrides: { templateName: "plain_text" } },
      ]);

      // Act
      const result = await handler(event);

      // Assert 1: only msg-A failed
      expect(result.batchItemFailures).toContainEqual({ itemIdentifier: "msg-A" });
      expect(result.batchItemFailures).not.toContainEqual({ itemIdentifier: "msg-B" });
      expect(result.batchItemFailures).toHaveLength(1);

      // Assert 2: exactly one receipt written (for record B)
      expect(PutItemCommand).toHaveBeenCalledTimes(1);

      // Assert 3: that receipt belongs to msg-B with SENT status
      const item = capturedPutItemInputs[0]?.Item;
      expect(item?.deliveryStatus?.S).toBe("SENT");
      expect(item?.gsi1pk?.S).toBe("MSG#wamid.B001");
    }
  );
});
