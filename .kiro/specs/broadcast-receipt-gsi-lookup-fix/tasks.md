# Implementation Plan

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - GSI Lookup Returns Null for Existing Receipt (Wrong Keys)
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to concrete WAMIDs (e.g. `"wamid.ABC123"`) to ensure reproducibility since the bug is deterministic
  - Create test file at `amplify/functions/vidaBaileWhatsapp/handler.test.ts`
  - Mock `@aws-sdk/client-dynamodb` using `vi.mock`; configure `QueryCommand` mock to return a `BROADCAST_RECEIPT` item when queried (simulating what `vidaBaileProcessOutboundQueue` writes: `gsi1pk = "MSG#wamid.ABC123"`, `gsi1sk = "WEBHOOK"`, with `pk = "adminSub#123"`, `sk = "BROADCAST#camp1#MEMBER#wamid.ABC123"`, `deliveryStatus = "sent"`)
  - Extract and call `findBroadcastReceiptByWamid("wamid.ABC123")` on the UNFIXED code
  - Assert the returned object is non-null and contains `adminSub = "adminSub#123"`, `sk = "BROADCAST#camp1#MEMBER#wamid.ABC123"`, `deliveryStatus = "sent"`
  - Run test on UNFIXED code: `npm test -- --run`
  - **EXPECTED OUTCOME**: Test FAILS because the broken code queries with `gsi1pk = "BROADCAST_RECEIPT"` / `gsi1sk = "WAMID#wamid.ABC123"` — the mock receives those wrong keys and returns `[]`, so the function returns `null` instead of the receipt
  - Document counterexample: `findBroadcastReceiptByWamid("wamid.ABC123")` returns `null` when receipt exists at `MSG#wamid.ABC123 / WEBHOOK`
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.1, 2.2_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - No-Receipt WAMID Always Returns Null
  - **IMPORTANT**: Follow observation-first methodology — observe behavior on UNFIXED code for non-buggy inputs (WAMIDs with no receipt), then write property that captures it
  - Observe on UNFIXED code: `findBroadcastReceiptByWamid("wamid.ZZZ999")` with DynamoDB returning `{ Items: [] }` → returns `null`
  - Write property-based test using `fast-check`: generate arbitrary WAMID strings (`fc.string({ minLength: 1, maxLength: 64 })`), mock DynamoDB to always return `{ Items: [] }`, assert `findBroadcastReceiptByWamid(wamid)` returns `null` for all generated WAMIDs
  - Run test on UNFIXED code: `npm test -- --run`
  - **EXPECTED OUTCOME**: Tests PASS (the null-return path works the same in both broken and fixed code — this confirms the baseline to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2_

- [ ] 3. Fix the GSI key mismatch in findBroadcastReceiptByWamid

  - [ ] 3.1 Implement the fix in handler.ts
    - Open `amplify/functions/vidaBaileWhatsapp/handler.ts`
    - Locate `findBroadcastReceiptByWamid` (lines 34–51)
    - Replace the two wrong `ExpressionAttributeValues` entries:
      - Change `":gsi1pk": { S: "BROADCAST_RECEIPT" }` → `":gsi1pk": { S: \`MSG#${wamid}\` }`
      - Change `":gsi1sk": { S: \`WAMID#${wamid}\` }` → `":gsi1sk": { S: "WEBHOOK" }`
    - No other lines in the file change; no other files change
    - _Bug_Condition: isBugCondition(wamid) — broadcastReceiptExists at gsi1pk="MSG#"+wamid / gsi1sk="WEBHOOK" but code queries gsi1pk="BROADCAST_RECEIPT" / gsi1sk="WAMID#"+wamid_
    - _Expected_Behavior: findBroadcastReceiptByWamid(wamid) returns { adminSub, sk, deliveryStatus } for any WAMID with a matching BROADCAST_RECEIPT record_
    - _Preservation: All WAMID lookups where no BROADCAST_RECEIPT exists must still return null; all other code paths (inbound message routing, SQS enqueue, updateBroadcastReceiptStatus call sites) must be completely unchanged_
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3_

  - [ ] 3.2 Add unit tests for the QueryCommand params (fix correctness)
    - In `handler.test.ts`, add a unit test that captures the exact `QueryCommand` input sent to the DynamoDB mock
    - Mock `@aws-sdk/client-dynamodb` with a spy that records the command input
    - Call `findBroadcastReceiptByWamid("wamid.TEST42")` on the FIXED code
    - Assert the captured `ExpressionAttributeValues` contain `":gsi1pk": { S: "MSG#wamid.TEST42" }` and `":gsi1sk": { S: "WEBHOOK" }`
    - _Requirements: 2.1_

  - [ ] 3.3 Add unit test: receipt lookup returns correct object
    - In `handler.test.ts`, mock DynamoDB `QueryCommand` to return a `BROADCAST_RECEIPT` item with `pk.S = "admin#sub"`, `sk.S = "BROADCAST#camp1#MEMBER#phone"`, `deliveryStatus.S = "delivered"`
    - Call `findBroadcastReceiptByWamid("wamid.FOUND")` on FIXED code
    - Assert returned object equals `{ adminSub: "admin#sub", sk: "BROADCAST#camp1#MEMBER#phone", deliveryStatus: "delivered" }`
    - _Requirements: 2.1, 2.2_

  - [ ] 3.4 Add unit test: status-update webhook path calls updateBroadcastReceiptStatus
    - In `handler.test.ts`, mock the full status-update webhook event (`value.statuses` with `id = "wamid.DEL001"`, `status = "delivered"`)
    - Mock DynamoDB `QueryCommand` to return a receipt for `MSG#wamid.DEL001 / WEBHOOK` with `adminSub = "admin#A"`, `sk = "BROADCAST#c1#MEMBER#phone"`
    - Spy on `UpdateItemCommand` to capture calls
    - Invoke the `handler` with a valid Meta signature (or bypass signature check via env var)
    - Assert `UpdateItemCommand` was called with `Key = { pk: { S: "admin#A" }, sk: { S: "BROADCAST#c1#MEMBER#phone" } }` and `deliveryStatus = "delivered"`
    - _Requirements: 2.1, 2.2_

  - [ ] 3.5 Add unit test: status-update for WAMID with no receipt does NOT call updateBroadcastReceiptStatus
    - In `handler.test.ts`, mock DynamoDB `QueryCommand` to return `{ Items: [] }` (no receipt)
    - Invoke handler with a `value.statuses` event for `wamid.UNKNOWN`
    - Assert `UpdateItemCommand` was NOT called
    - Assert handler returns `{ statusCode: 200, body: "OK" }`
    - _Requirements: 3.1, 3.2_

  - [ ] 3.6 Verify bug condition exploration test now passes (Property 1)
    - **Property 1: Expected Behavior** - GSI Lookup Returns Receipt for Known WAMID
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior: receipt returned for known WAMID
    - Run: `npm test -- --run`
    - **EXPECTED OUTCOME**: Test PASSES (confirms the fix resolves the GSI key mismatch)
    - _Requirements: 2.1, 2.2_

  - [ ] 3.7 Verify preservation property tests still pass (Property 2)
    - **Property 2: Preservation** - No-Receipt WAMID Still Returns Null
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run: `npm test -- --run`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions on the null-return path)
    - _Requirements: 3.1, 3.2_

- [ ] 4. Checkpoint — Ensure all tests pass
  - Run the full test suite: `npm test -- --run`
  - Ensure all 6 unit/property tests pass (tasks 1–3.7)
  - Confirm no TypeScript compilation errors: `npx tsc --noEmit`
  - Ask the user if any questions arise
