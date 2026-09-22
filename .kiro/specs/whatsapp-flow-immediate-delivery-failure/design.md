# WhatsApp Flow Immediate Delivery Failure — Bugfix Design

## Overview

When `vidaBaileProcessOutboundQueue` attempts to send an interactive WhatsApp Flow message
(`templateName === "promo_offer"`) and the Meta API returns a non-200 response or a WAMID is
absent, the Lambda currently throws immediately. The SQS record enters `batchItemFailures` with
zero message delivery — the recipient never receives anything.

The fix adds a plain-text fallback path: if the Flow message send fails at the Meta API level,
the handler immediately retries using a standard `text` message, records the receipt as
`deliveryStatus: "SENT_FALLBACK"`, and only adds the record to `batchItemFailures` if the
fallback itself also fails.

A secondary concern in `vidaBaileFlowEndpoint` is diagnostic quality: the top-level catch block
produces an unstructured log entry, decryption failures lose the error context needed to
distinguish RSA key mismatches from malformed payloads, and DynamoDB operations during `INIT`
have no timing instrumentation.

**Files changed:**
- `amplify/functions/vidaBaileProcessOutboundQueue/handler.ts` — fallback delivery logic
- `amplify/functions/vidaBaileFlowEndpoint/handler.ts` — structured error logging + timing

---

## Glossary

- **Bug_Condition (C)**: The condition that triggers zero-delivery — `templateName === "promo_offer"` AND the Meta API call for the interactive Flow message returns a non-200 status code or a response body without a WAMID.
- **Property (P)**: The desired outcome when C holds — the recipient SHALL receive a plain-text WhatsApp message and a `BROADCAST_RECEIPT` record with `deliveryStatus: "SENT_FALLBACK"` SHALL be written to DynamoDB.
- **Preservation**: Existing behaviour for non-promo templates and for successful Flow sends must remain byte-for-byte identical — no fallback logic executes, `deliveryStatus` stays `"SENT"`.
- **WAMID**: The message ID returned by Meta in `messages[0].id`. Its presence confirms Meta accepted the message for delivery.
- **batchItemFailures**: The SQS partial-batch failure contract — any record whose `messageId` appears in this array is retried by SQS; records absent from the list are considered successfully processed.
- **BROADCAST_RECEIPT**: A DynamoDB item (pk = `adminSub`, sk = `BROADCAST#<id>#MEMBER#<phone>`) that tracks per-recipient delivery status and links the WAMID for webhook-based status updates.
- **decryptedAction**: A variable in `vidaBaileFlowEndpoint` set after successful decryption of the Meta Flows payload, used to enrich error log context.

---

## Bug Details

### Bug Condition

The bug manifests when `templateName === "promo_offer"` and the Meta WhatsApp Cloud API call
inside `vidaBaileProcessOutboundQueue` either returns a non-200 HTTP status or returns 200 with
no `messages[0].id`. The handler throws at that point, causing the SQS record to enter
`batchItemFailures` with no message delivered to the recipient.

**Formal Specification:**
```
FUNCTION isBugCondition(sqsRecord)
  INPUT:  sqsRecord — one SQS record from the Lambda event
  OUTPUT: boolean

  body      := JSON.parse(sqsRecord.body)
  isPromo   := body.templateName === "promo_offer"

  // Simulate the Meta API call that the original code would make
  response  := callMetaAPI(buildInteractiveFlowPayload(body))
  apiError  := NOT response.ok
                 OR response.json().messages?.[0]?.id IS undefined

  RETURN isPromo AND apiError
END FUNCTION
```

### Examples

| Scenario | templateName | Meta response | Current behaviour | Expected behaviour |
|---|---|---|---|---|
| Flow message rejected (Flow not PUBLISHED) | `promo_offer` | 400 `flow_is_not_published` | SQS retry, zero delivery | Fallback plain-text sent, `SENT_FALLBACK` receipt |
| Flow endpoint URL stale after redeployment | `promo_offer` | 400 `invalid_endpoint_url` | SQS retry, zero delivery | Fallback plain-text sent, `SENT_FALLBACK` receipt |
| Meta response body lacks WAMID | `promo_offer` | 200 but no `messages[0].id` | SQS retry, zero delivery | Fallback plain-text sent, `SENT_FALLBACK` receipt |
| Both Flow and fallback fail | `promo_offer` | Both non-200 | SQS retry, zero delivery | Throw → SQS retry (unchanged) |
| Non-promo template | `plain_text` | any | Plain-text sent normally | No change |
| Flow message succeeds | `promo_offer` | 200 + WAMID | `SENT` receipt | No change — fallback never runs |

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- When `templateName !== "promo_offer"`, the existing direct plain-text send path runs without modification.
- When the interactive Flow message succeeds (Meta returns 200 + WAMID), `deliveryStatus` is `"SENT"` exactly as before — the fallback block is never entered.
- When both the Flow send AND the fallback fail, the record is still placed in `batchItemFailures` so SQS retries it.
- The `BROADCAST_RECEIPT` DynamoDB write structure (pk, sk, gsi1pk, gsi1sk, all fields) is unchanged for the success path; only `deliveryStatus` differs (`"SENT_FALLBACK"` vs `"SENT"`) on the fallback path.
- All `vidaBaileFlowEndpoint` business logic (INIT, data_exchange routing, FINALIZE_SUBMISSION, ping response) is unchanged — only catch/log instrumentation is added.

**Scope:**
All SQS records where `templateName !== "promo_offer"`, and all Flow sends where the Meta API
returns 200 + WAMID, are completely unaffected. The additional diagnostic logging in
`vidaBaileFlowEndpoint` is purely additive — no control-flow changes.

---

## Hypothesized Root Cause

### ProcessOutboundQueue

1. **Hard throw on Meta API failure**: Lines ~100-107 of `handler.ts` call `throw new Error(...)` on non-200 and on missing WAMID. There is no recovery path — the only option is SQS-driven retry of the exact same payload, which will fail again if the root cause is a permanently invalid Flow configuration.

2. **Interactive Flow message prerequisite failures**: The most common real-world triggers are:
   - Flow not in `PUBLISHED` state (draft flows return 400)
   - Flow endpoint URL became stale after an Amplify sandbox redeployment
   - RSA key mismatch between Meta and the Lambda secret, which causes the Flow's health check to return `unhealthy` and Meta to reject the interactive send

3. **Missing fallback escalation**: The code has a plain-text payload path (the `else` branch for `templateName !== "promo_offer"`) but that path is never reached for `promo_offer` records — the throw happens before any retry with that payload shape.

### FlowEndpoint

4. **Bare top-level catch**: `console.error("❌ Flow execution error:", err)` serialises the error object without `.message` or `.stack`, producing unhelpful CloudWatch entries like `[object Object]`.

5. **Decryption errors lose context**: If `decryptMetaRequest` throws, the outer catch has no access to `decryptedData` (it was not yet assigned). There is no distinction logged between an RSA key mismatch and a malformed/truncated payload.

6. **No DynamoDB timing visibility**: During `INIT`, `fetchActivePackages` may hit DynamoDB cold-start latency or table-scan issues; without timing logs it is impossible to determine whether slow Flow responses are caused by DynamoDB or by Bedrock/network.

---

## Correctness Properties

Property 1: Bug Condition — Plain-Text Fallback on Flow Send Failure

_For any_ SQS record where `isBugCondition` returns true (i.e., `templateName === "promo_offer"`
AND the Meta API rejects the interactive Flow message), the fixed `handler` function SHALL attempt
a plain-text fallback send to the same recipient, and if that fallback succeeds SHALL write a
`BROADCAST_RECEIPT` with `deliveryStatus: "SENT_FALLBACK"` and NOT add the record to
`batchItemFailures`.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — Success Path Unchanged

_For any_ SQS record where the interactive Flow message send succeeds (Meta returns 200 + WAMID),
the fixed function SHALL produce exactly the same result as the original function: the WAMID is
used as-is, `deliveryStatus` is `"SENT"`, and the fallback block is never entered.

**Validates: Requirements 3.1, 3.2**

Property 3: Preservation — Non-Promo Path Unchanged

_For any_ SQS record where `templateName !== "promo_offer"`, the fixed function SHALL produce
exactly the same result as the original function — the plain-text send path executes directly,
with no fallback logic involved.

**Validates: Requirements 3.3**

---

## Fix Implementation

### File 1: `amplify/functions/vidaBaileProcessOutboundQueue/handler.ts`

**Function**: `handler` (inner `for` loop, after the Meta API response check)

**Specific Changes**:

1. **Capture the throw instead of re-throwing immediately**: After the `!response.ok` block throws, wrap the entire Meta API call + WAMID extraction in a try/catch that sets a local `wamid` variable.

2. **Fallback block after catch**: When the primary send threw (or `wamid` is undefined), and `templateName === "promo_offer"`, enter the fallback block:
   ```typescript
   console.warn(`⚠️ Flow message failed (${primaryError}), retrying as plain-text for ${recipientPhone}`);
   const fallbackPayload = {
     messaging_product: "whatsapp",
     recipient_type: "individual",
     to: targetNumber,
     type: "text",
     text: { body: promotionalContent || "Hello from VidaBaile!" },
   };
   const fallbackResponse = await fetch(
     `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
     {
       method: "POST",
       headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}`, "Content-Type": "application/json" },
       body: JSON.stringify(fallbackPayload),
     }
   );
   const fallbackData: any = await fallbackResponse.json();
   if (!fallbackResponse.ok) {
     throw new Error(`Fallback also failed (${fallbackResponse.status}): ${fallbackData.error?.message}`);
   }
   wamid = fallbackData.messages?.[0]?.id;
   if (!wamid) throw new Error("Fallback succeeded but returned no WAMID");
   deliveryStatus = "SENT_FALLBACK";
   ```

3. **Pass `deliveryStatus` to the DynamoDB write**: Change the hardcoded `"SENT"` string in the `PutItemCommand` to use the `deliveryStatus` variable (`"SENT"` on success, `"SENT_FALLBACK"` on fallback).

4. **Log the fallback outcome**: `console.log(`✅ Fallback sent to ${recipientPhone} (WAMID: ${wamid})`)`

### File 2: `amplify/functions/vidaBaileFlowEndpoint/handler.ts`

**Specific Changes**:

1. **Hoist `decryptedAction` variable**: Declare `let decryptedAction: string | undefined` before the try block so it is accessible in the catch.

2. **Set `decryptedAction` after successful decryption**: `decryptedAction = decryptedData.action` immediately after `decryptMetaRequest` returns.

3. **Replace bare top-level catch** with structured logging:
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

4. **Add decryption-specific catch** wrapping `decryptMetaRequest`:
   ```typescript
   try {
     ({ aesKey, iv, data: decryptedData } = decryptMetaRequest(body, PRIVATE_KEY));
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
         .filter(k => k in body),
     });
     throw err; // Re-throw so outer catch returns 500
   }
   ```

5. **Add timing instrumentation around INIT DynamoDB calls**:
   ```typescript
   const t0 = Date.now();
   const activePackages = await fetchActivePackages(adminSub);
   console.log(`⏱️ fetchActivePackages: ${Date.now() - t0}ms, found ${activePackages.length} packages`);
   ```

---

## Testing Strategy

### Validation Approach

Two-phase: first run exploratory tests on the **unfixed** code to confirm the bug and surface
counterexamples; then verify the fix with fix-checking and preservation-checking tests.

### Exploratory Bug Condition Checking

**Goal**: Confirm that the current code delivers zero messages when the Meta API rejects a
Flow send. Observe `batchItemFailures` contains the record and no `BROADCAST_RECEIPT` is written.

**Test Plan**: Mock `fetch` to return a 400 response for the interactive Flow message. Call the
handler with a `promo_offer` SQS record. Assert that `batchItemFailures` contains the message ID.
Run on **unfixed code** — expected to demonstrate the zero-delivery failure.

**Test Cases**:

1. **Flow send 400 — WAMID absent**: Mock Meta API → 400. On unfixed code, record enters `batchItemFailures` with no delivery. (Will fail on fixed code — fallback should succeed instead.)
2. **Flow send 200 — no WAMID**: Mock Meta API → 200 with `messages: []`. On unfixed code, record enters `batchItemFailures`. (Will fail on fixed code.)
3. **Both channels fail**: Mock both the Flow send and the plain-text fallback to return 400. Expect `batchItemFailures` on both unfixed and fixed code.
4. **Non-promo record**: Mock Meta API → 200. `templateName = "plain_text"`. Expect success on both unfixed and fixed code (preservation baseline).

**Expected Counterexamples on Unfixed Code**:
- `batchItemFailures` contains the `messageId` of the `promo_offer` record
- No DynamoDB `PutItem` call is made — `BROADCAST_RECEIPT` is never written

### Fix Checking

**Goal**: Verify that for all inputs where `isBugCondition` holds, the fixed function sends the
fallback and writes a `SENT_FALLBACK` receipt.

**Pseudocode:**
```
FOR ALL sqsRecord WHERE isBugCondition(sqsRecord) DO
  result := handler_fixed({ Records: [sqsRecord] })
  ASSERT result.batchItemFailures does NOT contain sqsRecord.messageId
  ASSERT DynamoDB PutItem was called with deliveryStatus = "SENT_FALLBACK"
  ASSERT fallback fetch was called with type = "text"
END FOR
```

### Preservation Checking

**Goal**: Verify that records outside the bug condition produce identical outcomes in the fixed
and unfixed code.

**Pseudocode:**
```
FOR ALL sqsRecord WHERE NOT isBugCondition(sqsRecord) DO
  ASSERT handler_original(sqsRecord) = handler_fixed(sqsRecord)
END FOR
```

**Testing Approach**: Property-based testing using `fast-check` is recommended — it generates
many combinations of `templateName`, `promotionalContent`, `packageIntent`, and API response
shapes, confirming that the fallback branch is never entered outside the bug condition.

**Test Cases**:

1. **Successful Flow send preservation**: Mock Meta → 200 + WAMID. `promo_offer` record. Fixed code MUST write `deliveryStatus: "SENT"` (not `"SENT_FALLBACK"`). `batchItemFailures` must be empty.
2. **Non-promo plain-text preservation**: `templateName = "plain_text"`. Fixed code must not enter fallback block. `deliveryStatus: "SENT"`.
3. **Missing required fields (pre-flight validation)**: `adminSub` absent. Both fixed and unfixed must add to `batchItemFailures` without calling Meta — unchanged.
4. **Missing FLOW_ID env var for promo**: `FLOW_ID = ""`. Both fixed and unfixed throw before any Meta call — unchanged.

### Unit Tests

- Test fallback path: mock Flow send → 400; assert fallback plain-text fetch called; assert `deliveryStatus = "SENT_FALLBACK"`
- Test fallback WAMID extraction: mock fallback → 200 + WAMID; assert `gsi1pk = MSG#<fallback_wamid>`
- Test double failure: mock both fetches → 400; assert record in `batchItemFailures`
- Test `decryptMetaRequest` structured error logging: pass malformed body; assert log contains `likelyCause`
- Test `decryptMetaRequest` RSA key-mismatch detection: simulate `ERR_OSSL_RSA_PKCS_DECRYPTION_ERROR`; assert `likelyCause` contains "RSA key mismatch"
- Test INIT timing log: mock `fetchActivePackages`; assert `⏱️ fetchActivePackages:` appears in logs

### Property-Based Tests

- **Property 1 (fast-check)**: For any `promo_offer` SQS record where the primary fetch is mocked to fail and the fallback fetch is mocked to succeed, `batchItemFailures` is empty AND `deliveryStatus` is `"SENT_FALLBACK"`.
- **Property 2 (fast-check)**: For any non-promo SQS record with a successful Meta API mock, the handler output is identical between original and fixed code.
- **Property 3 (fast-check)**: For any `promo_offer` record where the primary fetch succeeds (200 + WAMID), `deliveryStatus` is always `"SENT"` and the fallback fetch is never called.

### Integration Tests

- Full SQS batch with mixed records: some `promo_offer` (Flow fails), some `promo_offer` (Flow succeeds), some `plain_text` — verify correct `deliveryStatus` on each `BROADCAST_RECEIPT`
- `vidaBaileFlowEndpoint` integration: send a request with an intentionally bad private key; verify CloudWatch log contains structured RSA key mismatch message and Lambda returns 500
- `vidaBaileFlowEndpoint` INIT timing: send a valid INIT request; verify `⏱️ fetchActivePackages:` log entry appears in CloudWatch

---

## Operational Runbooks (Non-Code)

These are documented here for operator awareness. They are not code changes.

### Runbook A — Re-register Flow endpoint URL after Amplify deployment

1. After `ampx sandbox` or production deployment, find `VidaBaileFlowUrl` in `amplify_outputs.json` or CDK output.
2. Meta for Developers → Your App → WhatsApp → Flows → select the Flow matching `WHATSAPP_FLOW_ID`.
3. Click Edit → Endpoint URL → paste the new URL.
4. Click "Test Endpoint" — verify a `ping` response is returned.
5. Save and re-publish the Flow.

### Runbook B — Verify Flow is PUBLISHED

1. Meta for Developers → WhatsApp → Flows → check the Flow status badge.
2. If DRAFT: click Publish (permanent action).
3. If published but failures persist: run Runbook A to verify the endpoint URL.

### Runbook C — Diagnose RSA key mismatch

1. Check CloudWatch logs for `vidaBaileFlowEndpoint` for "RSA key mismatch" entries (now emitted by the structured decryption catch).
2. Meta → Flows → Edit → Encryption section → note the public key fingerprint.
3. Compare with the private key in AWS Secrets Manager (`FLOW_PRIVATE_KEY`).
4. If mismatch: generate a new RSA key pair, upload the public key to Meta, update the secret.
