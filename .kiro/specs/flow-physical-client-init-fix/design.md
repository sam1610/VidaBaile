# flow-physical-client-init-fix Bugfix Design

## Overview

When `vidaBaileProcessOutboundQueue` sends a broadcast, it previously built a Meta `template` message containing a Flow button. Physical iOS/Android WhatsApp clients open the Flow UI from such a message but never fire the INIT request to `vidaBaileFlowEndpoint`, leaving the package list screen blank. The Meta Graph API also rejects `flow_action` / `flow_action_payload` fields inside `template` button parameters with HTTP 400.

The fix replaces the `template` payload with an `interactive/flow` message type that natively supports `flow_action: "navigate"` and `flow_action_payload: { screen: "PACKAGES_SCREEN" }`, which instructs the physical client to trigger the INIT lifecycle call on open. All other message paths, the DynamoDB receipt record, the `flow_token` format, and the plain-text fallback are preserved unchanged.

---

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — `templateName === "promo_offer"` is set AND the message is sent as a `template` type to a physical WhatsApp client.
- **Property (P)**: The desired outcome when the bug condition holds — the physical client receives an `interactive/flow` message and fires the INIT request to `vidaBaileFlowEndpoint`.
- **Preservation**: All behaviors unrelated to the `promo_offer` template path must remain byte-for-byte identical after the fix.
- **INIT request**: The encrypted POST sent by the WhatsApp physical client to `vidaBaileFlowEndpoint` when `flow_action: "navigate"` is present; its `action` field equals `"INIT"`.
- **`flow_token`**: The opaque string embedded in the interactive payload; parsed by downstream handlers (`vidaBaileWhatsapp`, `vidaBaileChatAgent`) using the `_CAMP#` and `_ADMIN#` delimiters.
- **`promo_offer`**: The `templateName` sentinel value that selects the Flow promotional path inside `vidaBaileProcessOutboundQueue`.
- **BROADCAST_RECEIPT**: The DynamoDB ledger record created after a successful Meta API call (`pk: adminSub`, `sk: BROADCAST#<broadcastId>#MEMBER#<recipientPhone>`, `gsi1pk: MSG#<wamid>`, `gsi1sk: WEBHOOK`).

---

## Bug Details

### Bug Condition

The bug manifests when `templateName === "promo_offer"` and the handler builds a Meta `type: "template"` payload. Physical WhatsApp clients render the button but suppress the INIT call because the `template` message type does not carry `flow_action`/`flow_action_payload` semantics. When those fields are injected into template button parameters anyway, Meta returns HTTP 400 (`Unexpected key "flow_action"`), blocking delivery entirely.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input — parsed SQS message body
  OUTPUT: boolean

  RETURN input.templateName === "promo_offer"
         AND outboundPayload.type === "template"
         AND ("flow_action" NOT IN outboundPayload.template.components[*].parameters
              OR Meta API returns HTTP 400 for "flow_action")
END FUNCTION
```

### Examples

- **Blank screen on physical client**: SQS message has `templateName: "promo_offer"`. Handler sends `type: "template"`. User taps the button on an iPhone — Flow opens, INIT never fires, packages list is empty.
- **Meta HTTP 400 — field rejected**: Developer adds `flow_action: "navigate"` inside the template button parameters. Meta API responds `400 Bad Request: Unexpected key "flow_action"`. Message is never delivered.
- **Meta Manager preview works**: The same Flow config renders correctly in the Meta WhatsApp Manager Interactive Mode because that preview environment bypasses the INIT lifecycle and injects mock data directly — masking the production bug.
- **Non-`promo_offer` path unaffected**: SQS message has `templateName: "generic_blast"`. Handler sends `type: "text"`. No bug condition — plain text delivered normally.

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Plain-text (`type: "text"`) path for all `templateName` values other than `"promo_offer"` must continue to send `promotionalContent` as the message body unchanged.
- The `BROADCAST_RECEIPT` DynamoDB write — key pattern, all field names, and all field values — must be identical after the fix.
- The `flow_token` format `BUY_PACKAGE_${packageIntent}_CAMP#${campaignId}_ADMIN#${adminSub}` must be preserved so `vidaBaileWhatsapp` and `vidaBaileChatAgent` can continue parsing `_CAMP#` and `_ADMIN#` segments without modification.
- Pre-flight validation (missing `adminSub`, `broadcastId`, or `recipientPhone` throws and reports a batch item failure without calling Meta) must remain unchanged.

**Scope:**

All SQS messages where `templateName !== "promo_offer"` and all code paths after the Meta API call (receipt creation, error reporting, batch item failure accounting) are completely outside the scope of this fix and must not be altered.

---

## Hypothesized Root Cause

1. **Wrong message `type` at the top level**: The original payload used `type: "template"`, which routes through Meta's HSM (Highly Structured Message) pipeline. This pipeline ignores `flow_action` / `flow_action_payload` fields because template buttons are static; only `interactive` messages with `type: "flow"` trigger the dynamic INIT lifecycle on the client.

2. **`flow_action` placement mismatch**: Even if `flow_action` were injected into the template `components` array, Meta's API schema validation rejects it with `Unexpected key "flow_action"` (HTTP 400) because that key is only valid inside `interactive.action.parameters`.

3. **Meta Manager preview masking the issue**: The Interactive Mode preview in Meta's dashboard bypasses the encrypted INIT/EXCHANGE lifecycle and injects fixture data directly, so the Flow renders correctly there even when the message type would fail on a physical device. This created a false positive during initial testing.

4. **Missing `FLOW_ID` / `FLOW_CTA` environment wiring**: The original `resource.ts` did not declare `WHATSAPP_FLOW_ID` or `WHATSAPP_FLOW_CTA` environment entries, so `process.env.WHATSAPP_FLOW_ID` was `undefined` at runtime, which would have caused the `interactive/flow` payload to carry an empty `flow_id` even if the type had been correct.

---

## Correctness Properties

Property 1: Bug Condition — Interactive/Flow Payload Triggers INIT on Physical Client

_For any_ SQS message where `isBugCondition` returns true (`templateName === "promo_offer"`), the fixed `handler.ts` SHALL build a top-level `type: "interactive"` payload with `interactive.type: "flow"`, `flow_action: "navigate"`, `flow_action_payload: { screen: "PACKAGES_SCREEN" }`, and a non-empty `flow_id`, such that the Meta Graph API accepts the request (HTTP 200) and the physical WhatsApp client fires the INIT request to `vidaBaileFlowEndpoint`.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — All Non-Bug-Condition Paths Unchanged

_For any_ SQS message where `isBugCondition` returns false (i.e., `templateName !== "promo_offer"`, or post-Meta-call code), the fixed handler SHALL produce exactly the same observable behavior as the original handler — same Meta payload shape, same DynamoDB write, same `flow_token` format, same validation errors, and same batch item failure reporting.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

---

## Fix Implementation

### Changes Required

**File:** `amplify/functions/vidaBaileProcessOutboundQueue/handler.ts`

**Branch:** `if (templateName === "promo_offer")` payload construction

**Specific Changes:**

1. **Replace `type: "template"` with `type: "interactive"`**: The top-level `type` field must be `"interactive"`, not `"template"`, so Meta routes the message through the interactive pipeline that supports the Flow INIT lifecycle.

2. **Restructure payload under `interactive.type: "flow"`**: Move all Flow-specific fields (`header`, `body`, `footer`, `action`) under the `interactive` key with `interactive.type = "flow"`.

3. **Add `flow_action: "navigate"` and `flow_action_payload: { screen: "PACKAGES_SCREEN" }` inside `action.parameters`**: These fields instruct the physical client to navigate to `PACKAGES_SCREEN` on open, which triggers the INIT request to `vidaBaileFlowEndpoint`.

4. **Populate `flow_id` from `FLOW_ID` env constant**: The `parameters.flow_id` value must reference the `FLOW_ID` constant (already pulled from `process.env.WHATSAPP_FLOW_ID`) so the correct registered Flow is launched.

5. **Preserve `flow_token` format**: `parameters.flow_token` must remain `BUY_PACKAGE_${packageIntent}_CAMP#${campaignId}_ADMIN#${adminSub}` — no changes to downstream parsing compatibility.

**File:** `amplify/functions/vidaBaileProcessOutboundQueue/resource.ts`

**Specific Changes:**

6. **Add `WHATSAPP_FLOW_ID` and `WHATSAPP_FLOW_CTA` environment entries**: These plain (non-secret) env vars must be declared so the Lambda runtime has the values available. `WHATSAPP_FLOW_ID` carries the Meta-assigned Flow ID; `WHATSAPP_FLOW_CTA` carries the CTA button label (default: `"View Packages"`).

> **Status**: Both files have been updated. The implementation matches the above specification.

---

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first confirm that the original `template` payload produces the bug (counterexample), then verify that the fixed `interactive/flow` payload satisfies both correctness properties and leaves all preservation paths unchanged.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples demonstrating the bug on the *unfixed* code. Confirm the root cause before trusting the fix.

**Test Plan**: Construct the original `template` payload in a unit test harness, mock the Meta Graph API, and assert that `flow_action` / `flow_action_payload` are absent (or cause a 400). Run against the unfixed handler to observe failures.

**Test Cases:**

1. **Template type carries no `flow_action`** (fails on unfixed code): Invoke the unfixed handler with a `promo_offer` SQS record. Assert that the outbound Meta payload `type === "template"`. Confirm `flow_action` is absent from `components[*].parameters`. This proves INIT cannot be triggered.

2. **Meta 400 when `flow_action` injected into template** (fails on unfixed code if injected): Simulate a handler variant that injects `flow_action` into template parameters. Mock Meta API to return `400 { error: { message: "Unexpected key \"flow_action\"" } }`. Assert the handler throws and adds the record to `batchItemFailures`.

3. **Physical client INIT never fires** (conceptual / integration): Using the Meta Test Phone in the sandbox, send the `template` payload. Observe CloudWatch logs for `vidaBaileFlowEndpoint` — no INIT invocation logged.

**Expected Counterexamples:**
- Outbound payload `type === "template"` — INIT lifecycle not triggered.
- HTTP 400 from Meta when `flow_action` is embedded in template parameters.

---

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed handler produces the expected behavior.

**Pseudocode:**

```
FOR ALL sqsRecord WHERE isBugCondition(sqsRecord.body) DO
  metaPayload := captureOutboundPayload(fixedHandler, sqsRecord)
  ASSERT metaPayload.type === "interactive"
  ASSERT metaPayload.interactive.type === "flow"
  ASSERT metaPayload.interactive.action.parameters.flow_action === "navigate"
  ASSERT metaPayload.interactive.action.parameters.flow_action_payload.screen === "PACKAGES_SCREEN"
  ASSERT metaPayload.interactive.action.parameters.flow_id !== ""
  ASSERT metaPayload.interactive.action.parameters.flow_token MATCHES
         /^BUY_PACKAGE_.+_CAMP#.+_ADMIN#.+$/
  ASSERT metaApiResponse.status === 200
END FOR
```

---

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed handler produces exactly the same result as the original.

**Pseudocode:**

```
FOR ALL sqsRecord WHERE NOT isBugCondition(sqsRecord.body) DO
  resultOriginal := originalHandler(sqsRecord)
  resultFixed    := fixedHandler(sqsRecord)
  ASSERT resultOriginal.metaPayload  = resultFixed.metaPayload
  ASSERT resultOriginal.dynamoWrite  = resultFixed.dynamoWrite
  ASSERT resultOriginal.batchFailures = resultFixed.batchFailures
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many random non-`promo_offer` `templateName` values automatically.
- It catches edge cases (empty strings, null fields, unicode names) that manual unit tests miss.
- It provides strong coverage guarantees that the plain-text path and DynamoDB write are byte-for-byte identical across all non-buggy inputs.

**Test Cases:**

1. **Plain-text path preservation**: Generate random SQS records with `templateName !== "promo_offer"`. Assert `metaPayload.type === "text"` and `metaPayload.text.body === record.promotionalContent` — identical to original.

2. **BROADCAST_RECEIPT DynamoDB write preservation**: For both `promo_offer` (fixed) and all other `templateName` values, assert the `PutItemCommand` receives exactly the same `pk`, `sk`, `gsi1pk`, `gsi1sk`, `deliveryStatus`, `hasReplied`, and all other fields as the original handler produced.

3. **`flow_token` format preservation**: For any `promo_offer` record, assert `flow_token === \`BUY_PACKAGE_${packageIntent}_CAMP#${campaignId}_ADMIN#${adminSub}\`` — no structural change that would break `vidaBaileWhatsapp` or `vidaBaileChatAgent` parsing.

4. **Pre-flight validation preservation**: For SQS records missing `adminSub`, `broadcastId`, or `recipientPhone`, assert the handler throws before calling Meta and that the record appears in `batchItemFailures` — identical to original.

---

### Unit Tests

- Assert `type: "interactive"` and `interactive.type: "flow"` are present in the outbound payload when `templateName === "promo_offer"`.
- Assert `flow_action: "navigate"` and `flow_action_payload: { screen: "PACKAGES_SCREEN" }` are present in `action.parameters`.
- Assert `flow_id` equals the value of `process.env.WHATSAPP_FLOW_ID`.
- Assert `flow_token` matches the canonical format `BUY_PACKAGE_${packageIntent}_CAMP#${campaignId}_ADMIN#${adminSub}`.
- Assert plain-text payload is unchanged for `templateName !== "promo_offer"`.
- Assert pre-flight validation throws for missing required fields.

### Property-Based Tests

- Generate random valid SQS records with `templateName === "promo_offer"` and assert the fixed payload always satisfies Property 1 structure constraints.
- Generate random SQS records with arbitrary `templateName` values (excluding `"promo_offer"`) and assert the fixed handler output is identical to the original handler output (Property 2).
- Generate random combinations of `packageIntent`, `campaignId`, and `adminSub` and assert `flow_token` always serializes to the correct `_CAMP#` / `_ADMIN#` delimited format.

### Integration Tests

- Deploy the fixed Lambda to the sandbox. Send a test SQS message with `templateName: "promo_offer"` and a real test phone number. Observe `vidaBaileFlowEndpoint` CloudWatch logs for an INIT invocation within 5 seconds.
- Verify the `BROADCAST_RECEIPT` item appears in DynamoDB with the correct key pattern and `deliveryStatus: "SENT"`.
- Verify that a plain-text broadcast (`templateName: "generic"`) still delivers correctly and creates the same `BROADCAST_RECEIPT` structure.
- Verify that `vidaBaileFlowEndpoint` correctly resolves `adminSub` from the `flow_token` using the `_ADMIN#` split (confirms `flow_token` format compatibility end-to-end).
