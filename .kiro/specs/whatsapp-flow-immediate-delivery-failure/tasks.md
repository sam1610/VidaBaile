# Implementation Plan

- [x] 1. Write bug condition exploration test (Property 1 — BEFORE fix)
  - **Property 1: Bug Condition** — Flow send failure causes zero delivery (EXPECTED TO FAIL on unfixed code — failure confirms the bug)
  - **CRITICAL**: Run this test on UNFIXED code first. When it fails, that is SUCCESS — it confirms the bug exists. Do NOT fix the code yet.
  - Create test file `amplify/functions/vidaBaileProcessOutboundQueue/handler.test.ts`
  - Install `vitest` as a devDependency if not already present: `npm install --save-dev vitest`
  - Mock `fetch` using `vi.fn()`: first call (interactive Flow send) returns `{ ok: false, status: 400, json: async () => ({ error: { message: "flow_is_not_published" } }) }`
  - Mock `@aws-sdk/client-dynamodb` `PutItemCommand` send to record calls
  - Create a minimal SQS event with one record: `templateName: "promo_offer"`, `adminSub: "admin#test"`, `broadcastId: "bc#1"`, `recipientPhone: "+97312345678"`, `promotionalContent: "Test offer"`, `packageIntent: "pkg1"`, `messageId: "msg-001"`
  - Set required env vars: `TABLE_NAME=test-table`, `WHATSAPP_ACCESS_TOKEN=tok`, `WHATSAPP_PHONE_ID=12345`, `WHATSAPP_FLOW_ID=flow-99`
  - Call `handler(event)` and assert: `result.batchItemFailures` contains `{ itemIdentifier: "msg-001" }`, AND `PutItemCommand` was never called (no BROADCAST_RECEIPT written)
  - Tag: `// Feature: whatsapp-flow-immediate-delivery-failure, Property 1: Flow send failure causes zero delivery`
  - Run `npx vitest run handler.test.ts` — **expect the test to FAIL** (current code throws → record enters batchItemFailures → our assertion that BROADCAST_RECEIPT is absent should PASS, but the assertion that batchItemFailures contains the record ALSO passes — so the test PASSES on unfixed code confirming the bug behavior)
  - Document: "Counterexample confirmed: `promo_offer` record with Flow 400 response enters `batchItemFailures` with no delivery"
  - _Requirements: 1.6, 2.6_

- [x] 2. Write preservation baseline tests (Properties 2 & 3 — BEFORE fix)
  - **Property 2: Preservation** — Successful Flow send writes `SENT` receipt (should PASS on both unfixed and fixed code)
  - **Property 3: Preservation** — Non-promo records are unaffected (should PASS on both)
  - In `handler.test.ts`, add property-based tests using `fast-check`:
  - **P2 test**: Mock `fetch` → `{ ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.SUCCESS" }] }) }`. Use `fc.record({ promotionalContent: fc.string(), packageIntent: fc.string(), recipientName: fc.string() })` to generate varied `promo_offer` records. Assert `batchItemFailures` is empty and `PutItemCommand` called with `deliveryStatus: { S: "SENT" }` and `gsi1pk: { S: "MSG#wamid.SUCCESS" }`. Run 100 iterations.
  - **P3 test**: Mock `fetch` → 200 + WAMID. Use `fc.string().filter(s => s !== "promo_offer")` for `templateName`. Assert `batchItemFailures` empty and `deliveryStatus: { S: "SENT" }`. No fallback fetch called. Run 100 iterations.
  - Tag both: `// Feature: whatsapp-flow-immediate-delivery-failure, Property 2/3: preservation`
  - Run `npx vitest run handler.test.ts` — **expect both P2 and P3 to PASS** on unfixed code (establishes preservation baseline)
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Apply fix to vidaBaileProcessOutboundQueue/handler.ts — DEPLOY IMMEDIATELY
  - **PRODUCTION EMERGENCY — apply and deploy this task before writing any further tests**
  - Open `amplify/functions/vidaBaileProcessOutboundQueue/handler.ts`
  - Inside the `for (const record of event.Records)` loop, locate the section after `// ── 3. Build WhatsApp payload` and before `// ── 4. Send via Meta WhatsApp Cloud API`
  - Declare two variables before the Meta API call block:
    ```typescript
    let wamid: string | undefined;
    let deliveryStatus = "SENT";
    ```
  - Wrap the entire block from `// ── 4. Send via Meta WhatsApp Cloud API` through `console.log(`✅ Sent to ${recipientPhone}...`)` in a try/catch:
    ```typescript
    try {
      const response = await fetch(
        `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
        { method: "POST", headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(metaPayload) }
      );
      const metaData: any = await response.json();
      if (!response.ok) {
        console.error(`❌ Meta API full error:`, JSON.stringify(metaData));
        throw new Error(`Meta API error (${response.status}): ${metaData.error?.message ?? JSON.stringify(metaData)}`);
      }
      wamid = metaData.messages?.[0]?.id;
      if (!wamid) throw new Error("Meta API returned success but no message ID in response");
      console.log(`✅ Sent to ${recipientPhone} (WAMID: ${wamid})`);
    } catch (primaryError: any) {
      if (templateName === "promo_offer") {
        // ── 4b. Plain-text fallback when Flow infrastructure is broken ──────
        console.warn(`⚠️ Flow message failed (${primaryError.message}), retrying as plain-text for ${recipientPhone}`);
        const fallbackPayload = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: targetNumber,
          type: "text",
          text: { body: promotionalContent || "Hello from VidaBaile!" },
        };
        const fallbackResponse = await fetch(
          `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
          { method: "POST", headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(fallbackPayload) }
        );
        const fallbackData: any = await fallbackResponse.json();
        if (!fallbackResponse.ok) {
          console.error(`❌ Fallback also failed:`, JSON.stringify(fallbackData));
          throw new Error(`Fallback plain-text failed (${fallbackResponse.status}): ${fallbackData.error?.message}`);
        }
        wamid = fallbackData.messages?.[0]?.id;
        if (!wamid) throw new Error("Fallback succeeded but returned no WAMID");
        deliveryStatus = "SENT_FALLBACK";
        console.log(`✅ Fallback sent to ${recipientPhone} (WAMID: ${wamid})`);
      } else {
        throw primaryError; // Non-promo: re-throw unchanged
      }
    }
    ```
  - In `// ── 5. Create BROADCAST_RECEIPT ledger record`, change the hardcoded `deliveryStatus: { S: "SENT" }` to `deliveryStatus: { S: deliveryStatus }`
  - Remove the now-redundant standalone `const wamid` declaration and `console.log(`✅ Sent...`)` that were inside the old block (they are now inside the try above)
  - Run `tsc --noEmit` from the project root — confirm zero TypeScript errors
  - **DEPLOY**: run `npx ampx sandbox` (or trigger your CI/CD pipeline) to push the fix to AWS immediately
  - _Bug_Condition: templateName === "promo_offer" AND Meta API returns non-200 or missing WAMID_
  - _Expected_Behavior: plain-text fallback sent, BROADCAST_RECEIPT written with deliveryStatus="SENT_FALLBACK"_
  - _Preservation: successful Flow send → deliveryStatus="SENT"; non-promo → unchanged_
  - _Requirements: 2.6, 3.1, 3.2, 3.3, 3.6, 3.7_

- [x] 4. Apply diagnostic improvements to vidaBaileFlowEndpoint/handler.ts
  - Open `amplify/functions/vidaBaileFlowEndpoint/handler.ts`
  - **Change 1 — Hoist `decryptedAction`**: Before the `try {` at the start of the main handler body, add:
    ```typescript
    let decryptedAction: string | undefined;
    let body: any;
    ```
    Move the existing `let bodyStr` / `body = JSON.parse(bodyStr)` assignment into the try block but ensure `body` is hoisted so it's accessible in the outer catch.
  - **Change 2 — Decryption-specific catch**: Replace the bare `const { aesKey, iv, data: decryptedData } = decryptMetaRequest(body, PRIVATE_KEY);` line with:
    ```typescript
    let aesKey: Buffer, iv: Buffer, decryptedData: any;
    try {
      ({ aesKey, iv, data: decryptedData } = decryptMetaRequest(body, PRIVATE_KEY));
      decryptedAction = decryptedData.action;
    } catch (err: any) {
      const isCryptoError =
        err.message?.includes("RSA") ||
        err.message?.includes("decrypt") ||
        err.code === "ERR_OSSL_RSA_PKCS_DECRYPTION_ERROR";
      console.error("❌ Decryption failed:", {
        errorMessage: err.message,
        likelyCause: isCryptoError
          ? "RSA key mismatch — check FLOW_PRIVATE_KEY secret matches Meta Flow public key"
          : "Malformed payload",
        encryptedFieldsPresent: ["encrypted_aes_key", "encrypted_flow_data", "initial_vector"]
          .filter(k => body && k in body),
      });
      throw err;
    }
    ```
  - **Change 3 — Structured top-level catch**: Replace:
    ```typescript
    } catch (err: any) {
      console.error("❌ Flow execution error:", err);
      return { statusCode: 500, body: "Internal Server Error" };
    }
    ```
    With:
    ```typescript
    } catch (err: any) {
      console.error("❌ Flow execution error:", {
        message: err.message,
        stack: err.stack,
        action: decryptedAction ?? "UNKNOWN (decryption failed)",
        encryptedFieldsPresent: body ? Object.keys(body) : [],
      });
      return { statusCode: 500, body: "Internal Server Error" };
    }
    ```
  - **Change 4 — INIT timing log**: In the `if (decryptedData.action === "INIT")` block, wrap the `fetchActivePackages` call:
    ```typescript
    const t0 = Date.now();
    const activePackages = await fetchActivePackages(adminSub);
    console.log(`⏱️ fetchActivePackages: ${Date.now() - t0}ms, found ${activePackages.length} packages`);
    ```
  - Run `tsc --noEmit` — confirm zero TypeScript errors
  - _Requirements: 2.3, 2.4, 2.5_

- [x] 5. Verify fix with fix-checking tests (Property 1 re-run + new unit tests)

  - [x] 5.1 Re-run Property 1 exploration test — now MUST PASS
    - Run `npx vitest run handler.test.ts` from `amplify/functions/vidaBaileProcessOutboundQueue/`
    - The test from Task 1 now asserts `batchItemFailures` contains the record AND no `PutItem` was called
    - On FIXED code: when Flow mock returns 400, fallback mock must also be set up
    - Update the Task 1 test: add a second `fetch` mock call that returns `{ ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.FALLBACK001" }] }) }` for the fallback
    - Now assert: `batchItemFailures` is **empty**, `PutItemCommand` called with `deliveryStatus: { S: "SENT_FALLBACK" }` and `gsi1pk: { S: "MSG#wamid.FALLBACK001" }`
    - **EXPECTED OUTCOME**: PASSES — confirms fix resolves the bug
    - _Requirements: 2.6_

  - [x] 5.2 Unit test — fallback WAMID is correctly stored in gsi1pk
    - Mock: Flow fetch → 400, fallback fetch → 200 + `wamid: "wamid.FB42"`
    - Assert `PutItemCommand` called with `Item.gsi1pk: { S: "MSG#wamid.FB42" }` and `Item.gsi1sk: { S: "WEBHOOK" }`
    - _Requirements: 2.6, 3.2_

  - [x] 5.3 Unit test — double failure routes to batchItemFailures
    - Mock: Flow fetch → 400, fallback fetch → 400
    - Assert `batchItemFailures` contains the record's `messageId`
    - Assert `PutItemCommand` NOT called
    - _Requirements: 3.7_

  - [x] 5.4 Unit test — batch isolation: fallback failure on one record does not affect others
    - Create SQS event with 2 records: record A is `promo_offer` (Flow fails, fallback fails); record B is `plain_text` (succeeds)
    - Assert `batchItemFailures` contains only record A's `messageId`
    - Assert `PutItemCommand` called exactly once (for record B) with `deliveryStatus: { S: "SENT" }`
    - _Requirements: 3.7_

  - [x] 5.5 Unit test — FlowEndpoint decryption error log structure
    - Create a test file `amplify/functions/vidaBaileFlowEndpoint/handler.test.ts`
    - Call handler with a malformed body (missing `encrypted_aes_key`) to trigger decryption failure
    - Spy on `console.error`; assert it was called with an object containing `likelyCause` key
    - Assert handler returns `{ statusCode: 500 }`
    - _Requirements: 2.3, 2.5_

  - [x] 5.6 Unit test — FlowEndpoint RSA key mismatch detected
    - Simulate an error whose message contains "RSA" by mocking `crypto.privateDecrypt` to throw `{ message: "RSA_PKCS_DECRYPTION_ERROR", code: "ERR_OSSL_RSA_PKCS_DECRYPTION_ERROR" }`
    - Assert `console.error` called with `likelyCause` containing "RSA key mismatch"
    - _Requirements: 2.3_

- [x] 6. Re-run preservation tests (Properties 2 & 3) — MUST still PASS
  - Run the full test suite: `npx vitest run`
  - **Property 2**: Successful Flow send → `deliveryStatus: "SENT"`, fallback never called — MUST PASS
  - **Property 3**: Non-promo `templateName` → unchanged plain-text path, no fallback — MUST PASS
  - If any preservation test fails, the fix introduced a regression — stop and investigate before proceeding
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 7. Checkpoint — All tests green + TypeScript clean + deployment verified
  - Run `npx vitest run` — confirm all tests pass (exploration + fix-checking + preservation)
  - Run `tsc --noEmit` — confirm zero TypeScript errors across `amplify/`
  - Confirm the deployment from Task 3 is live: open CloudWatch for `vidaBaileProcessOutboundQueue` and verify next broadcast attempt logs either `✅ Sent` (Flow working) or `⚠️ Flow message failed... retrying as plain-text` + `✅ Fallback sent`
  - **Operational verification** — check the following before marking complete:
    1. Go to Meta for Developers → WhatsApp → Flows → confirm the Flow matching `WHATSAPP_FLOW_ID` is in **PUBLISHED** state (not DRAFT)
    2. Confirm the Flow's Endpoint URL matches the current `VidaBaileFlowUrl` from `amplify_outputs.json`
    3. Use Meta's "Test Endpoint" button — verify it returns a `ping` response (HTTP 200, `{ data: { status: "active" } }`)
    4. If endpoint URL is stale: paste the new URL → save → re-publish the Flow (Runbook A)
    5. If Flow is in DRAFT: click Publish (Runbook B)
    6. If endpoint test fails with crypto error: check `FLOW_PRIVATE_KEY` secret matches the public key registered in Meta (Runbook C)
  - Ask the user if any questions arise
