# Implementation Plan

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Template Type Suppresses INIT on Physical Client
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating that `type: "template"` payloads do not carry `flow_action`/`flow_action_payload`, meaning a physical WhatsApp client cannot fire the INIT request
  - **Scoped PBT Approach**: Scope the property to the concrete failing case — any SQS record where `templateName === "promo_offer"` — and assert the outbound Meta payload satisfies the interactive/flow structure
  - In the test harness, invoke the handler with a `promo_offer` SQS record and capture the outbound `fetch` call body
  - Assert `metaPayload.type === "interactive"` (fails on unfixed code where `type === "template"`)
  - Assert `metaPayload.interactive.type === "flow"` (fails on unfixed code)
  - Assert `metaPayload.interactive.action.parameters.flow_action === "navigate"` (fails on unfixed code — field absent in template path)
  - Assert `metaPayload.interactive.action.parameters.flow_action_payload.screen === "PACKAGES_SCREEN"` (fails on unfixed code)
  - Assert `metaPayload.interactive.action.parameters.flow_id !== ""` (fails on unfixed code — env var not wired)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists)
  - Document counterexamples found (e.g., `type === "template"` present, `flow_action` absent)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-`promo_offer` Paths and Post-Meta Code Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: on unfixed code, SQS records with `templateName !== "promo_offer"` produce `metaPayload.type === "text"` with `text.body === promotionalContent`
  - Observe: `PutItemCommand` is called with `pk: adminSub`, `sk: BROADCAST#<broadcastId>#MEMBER#<recipientPhone>`, `gsi1pk: MSG#<wamid>`, `gsi1sk: "WEBHOOK"`, `deliveryStatus: "SENT"`, `hasReplied: false` — for all `templateName` values
  - Observe: missing `adminSub` / `broadcastId` / `recipientPhone` throws before any `fetch` call and adds the record to `batchItemFailures`
  - Write property-based test: for all random `templateName` values != `"promo_offer"` (including empty strings, unicode, arbitrary strings), the outbound payload equals `{ type: "text", text: { body: promotionalContent } }` — identical to unfixed handler
  - Write property-based test: for all random combinations of `packageIntent`, `campaignId`, `adminSub`, the `BROADCAST_RECEIPT` `PutItemCommand` input is byte-for-byte identical between original and fixed handler
  - Write property-based test: for all combinations of present/absent `adminSub`, `broadcastId`, `recipientPhone`, validation behavior matches original (throws with correct missing-field message, no `fetch` call made)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 3. Fix for interactive/flow payload on `promo_offer` broadcast path

  - [ ] 3.1 Implement the fix in `handler.ts`
    - Replace `type: "template"` top-level field with `type: "interactive"` for the `promo_offer` branch
    - Restructure the entire `promo_offer` payload under `interactive: { type: "flow", header, body, footer, action }` with `action.name: "flow"` and `action.parameters` carrying all Flow fields
    - Add `flow_action: "navigate"` and `flow_action_payload: { screen: "PACKAGES_SCREEN" }` inside `action.parameters` so the physical client triggers the INIT lifecycle call on open
    - Set `action.parameters.flow_id` to the `FLOW_ID` constant (from `process.env.WHATSAPP_FLOW_ID`) — must be non-empty at runtime
    - Preserve `flow_token` as `BUY_PACKAGE_${packageIntent}_CAMP#${campaignId}_ADMIN#${adminSub}` exactly — no structural changes
    - Leave the plain-text `else` branch, all post-`fetch` code (receipt creation), and the pre-flight validation block completely untouched
    - _Bug_Condition: isBugCondition(input) where input.templateName === "promo_offer" AND outbound payload uses type: "template"_
    - _Expected_Behavior: metaPayload.type === "interactive", interactive.type === "flow", flow_action === "navigate", flow_action_payload.screen === "PACKAGES_SCREEN", flow_id !== "", HTTP 200 from Meta, physical client fires INIT to vidaBaileFlowEndpoint_
    - _Preservation: plain-text path unchanged; BROADCAST_RECEIPT DynamoDB write identical; flow_token format preserved; pre-flight validation unchanged_
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4_

  - [ ] 3.2 Add `WHATSAPP_FLOW_ID` and `WHATSAPP_FLOW_CTA` env entries in `resource.ts`
    - Declare `WHATSAPP_FLOW_ID: process.env.WHATSAPP_FLOW_ID ?? ''` in the `environment` block so the Lambda runtime resolves the Flow ID
    - Declare `WHATSAPP_FLOW_CTA: process.env.WHATSAPP_FLOW_CTA ?? 'View Packages'` for the CTA button label
    - These are non-secret plain env vars (visible in Meta Business dashboard) — do NOT wrap in `secret()`
    - _Requirements: 2.2_

  - [ ] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Interactive/Flow Payload Triggers INIT on Physical Client
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (`type: "interactive"`, `flow_action: "navigate"`, etc.)
    - When this test passes, it confirms the fixed handler builds the correct interactive/flow payload for all `promo_offer` inputs
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2_

  - [ ] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-`promo_offer` Paths and Post-Meta Code Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions on plain-text path, DynamoDB write, flow_token format, and pre-flight validation)
    - Confirm all tests still pass after fix (no regressions)

- [ ] 4. Checkpoint — Ensure all tests pass
  - Run the full test suite for `vidaBaileProcessOutboundQueue`
  - Confirm Property 1 (bug condition) test passes — interactive/flow payload is correct
  - Confirm Property 2 (preservation) tests pass — all non-`promo_offer` and post-Meta paths unchanged
  - Optionally deploy to sandbox and verify `vidaBaileFlowEndpoint` CloudWatch logs show an INIT invocation when a `promo_offer` broadcast is sent to a physical device
  - Ensure all tests pass; ask the user if questions arise
