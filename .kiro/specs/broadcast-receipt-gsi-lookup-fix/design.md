# broadcast-receipt-gsi-lookup-fix Bugfix Design

## Overview

A two-value GSI key mismatch in `findBroadcastReceiptByWamid` inside
`amplify/functions/vidaBaileWhatsapp/handler.ts` causes every DynamoDB GSI lookup
to miss its target row. The function queries with the wrong partition key
(`"BROADCAST_RECEIPT"`) and wrong sort key (`WAMID#<wamid>`), but
`vidaBaileProcessOutboundQueue` writes the record with `MSG#<wamid>` as the GSI
partition key and `"WEBHOOK"` as the GSI sort key. Because the keys never match,
the query always returns zero items, so delivery-status webhooks are silently
swallowed and inbound message context lookups always produce a null receipt.

The fix is a one-line-per-key correction inside the single
`ExpressionAttributeValues` block; no schema changes, no infrastructure changes,
and no other files are touched.

---

## Glossary

- **Bug_Condition (C)**: The query executes with `gsi1pk = "BROADCAST_RECEIPT"` and
  `gsi1sk = WAMID#<wamid>` — keys that were never written — so the GSI returns an
  empty result set even when a matching `BROADCAST_RECEIPT` record exists.
- **Property (P)**: For any WAMID that has a corresponding `BROADCAST_RECEIPT` record,
  `findBroadcastReceiptByWamid` SHALL return that record's `adminSub`, `sk`, and
  `deliveryStatus`.
- **Preservation**: All code paths that do NOT invoke `findBroadcastReceiptByWamid`,
  and WAMID lookups for WAMIDs with no matching record, must behave exactly as before.
- **`findBroadcastReceiptByWamid`**: The async helper in
  `amplify/functions/vidaBaileWhatsapp/handler.ts` (lines 34–51) that queries the
  `clubRecordsByGsi1pkAndGsi1sk` GSI to locate a `BROADCAST_RECEIPT` by outbound
  WhatsApp message ID.
- **`vidaBaileProcessOutboundQueue`**: The Lambda in
  `amplify/functions/vidaBaileProcessOutboundQueue/handler.ts` that sends a
  broadcast message via the Meta API and then writes the `BROADCAST_RECEIPT` record.
  This is the **write path** — its key patterns define the ground truth for the fix.
- **WAMID**: WhatsApp message ID returned by the Meta Cloud API (e.g.
  `wamid.HBgLMTIwNjU0...`). Used as the unique identifier for outbound messages.
- **GSI1**: The Global Secondary Index `clubRecordsByGsi1pkAndGsi1sk` on the
  `DancingClubData` table, keyed on `gsi1pk` / `gsi1sk`.

---

## Bug Details

### Bug Condition

The bug manifests whenever `findBroadcastReceiptByWamid` is called with any WAMID
that has a `BROADCAST_RECEIPT` record in DynamoDB. The function issues a GSI query
with keys that do not match what the write path stored, so DynamoDB always returns
an empty result regardless of whether the record exists.

The function is called in two distinct flows:

1. **Status-update path** — Meta sends a `value.statuses` webhook (delivered / read
   / failed). The webhook handler calls `findBroadcastReceiptByWamid(wamid)` to find
   the receipt and update its `deliveryStatus`.
2. **Inbound-reply path** — Meta sends a `value.messages` webhook where `msg.context.id`
   is set (member replying to a broadcast). The handler calls
   `findBroadcastReceiptByWamid(contextWamid)` to resolve `adminSub` and `campaignId`.

Both paths are broken by the same mismatch.

**Formal Specification:**
```
FUNCTION isBugCondition(wamid)
  INPUT:  wamid — string WhatsApp message ID
  OUTPUT: boolean

  broadcastReceiptExists := EXISTS record IN DancingClubData
                              WHERE gsi1pk = "MSG#" + wamid
                                AND gsi1sk = "WEBHOOK"

  queriedGsi1pk := "BROADCAST_RECEIPT"          // what the broken code uses
  queriedGsi1sk := "WAMID#" + wamid             // what the broken code uses

  RETURN broadcastReceiptExists = true
         AND queriedGsi1pk ≠ "MSG#" + wamid
         AND queriedGsi1sk ≠ "WEBHOOK"
END FUNCTION
```

### Examples

| Scenario | WAMID | GSI1PK written | GSI1SK written | Broken query GSI1PK | Broken query GSI1SK | Broken result |
|---|---|---|---|---|---|---|
| Status update: "delivered" | `wamid.ABC123` | `MSG#wamid.ABC123` | `WEBHOOK` | `BROADCAST_RECEIPT` | `WAMID#wamid.ABC123` | `null` — status not updated |
| Status update: "read" | `wamid.DEF456` | `MSG#wamid.DEF456` | `WEBHOOK` | `BROADCAST_RECEIPT` | `WAMID#wamid.DEF456` | `null` — read flag not set |
| Inbound reply (context) | `wamid.GHI789` | `MSG#wamid.GHI789` | `WEBHOOK` | `BROADCAST_RECEIPT` | `WAMID#wamid.GHI789` | `null` — adminSub not resolved |
| WAMID with no receipt | `wamid.ZZZ000` | _(not written)_ | _(not written)_ | _(any)_ | _(any)_ | `null` — expected, no change |

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Non-broadcast inbound messages (no `contextWamid`, no receipt) must continue to
  be routed to the chat agent via `INBOUND_CHAT_QUEUE` exactly as before.
- Lookups for WAMIDs that have no matching `BROADCAST_RECEIPT` record must still
  return `null` — correct empty-result behavior must be preserved.
- `vidaBaileProcessOutboundQueue` write path (keys `gsi1pk = MSG#<wamid>`,
  `gsi1sk = WEBHOOK`) must remain completely unchanged.
- `updateBroadcastReceiptStatus` call logic — invocation sites, parameters passed,
  and DynamoDB `UpdateItemCommand` — must remain completely unchanged.
- Signature validation, webhook verification (GET), base64 decoding, and all other
  webhook processing code must remain completely unchanged.

**Scope:**
All code paths that do NOT exercise `findBroadcastReceiptByWamid` are unaffected by
this fix. Specifically:

- Inbound plain-text or button messages with no `contextWamid`
- `resolveAdminFromDisplayPhone` and the Tier 2 / Tier 3 admin resolution paths
- The SQS enqueue to `INBOUND_CHAT_QUEUE`
- Member record update (`UpdateItemCommand` on `MEMBER#<phone>`)

---

## Hypothesized Root Cause

Based on reading both handler files, the root cause is **a copy-paste key pattern
error** during initial authorship of `findBroadcastReceiptByWamid`. The function
appears to have been written with placeholder GSI key values that were never
reconciled against the actual write path in `vidaBaileProcessOutboundQueue`.

Specifically:

1. **Wrong partition key (`gsi1pk`)**: The query uses the literal string
   `"BROADCAST_RECEIPT"`, which is the `entityType` attribute value — never stored
   as a GSI key. The write path stores `MSG#<wamid>` in `gsi1pk` to enable
   WAMID-based reverse lookup.

2. **Wrong sort key (`gsi1sk`)**: The query uses `` `WAMID#${wamid}` `` (embedding
   the WAMID in the sort key), but the write path stores the static string
   `"WEBHOOK"` in `gsi1sk`. The WAMID is already encoded in `gsi1pk`, so the sort
   key serves only as a type discriminator.

3. **No early detection**: Because the function catches all errors and returns
   `null` on any exception, and because a GSI query returning zero items is not an
   error, the mismatch produced silent data loss — no exceptions, no alerts, just
   missed receipt updates and failed adminSub resolutions.

---

## Correctness Properties

Property 1: Bug Condition — GSI Lookup Returns Receipt for Known WAMID

_For any_ WAMID where a `BROADCAST_RECEIPT` record exists in DynamoDB (written by
`vidaBaileProcessOutboundQueue` with `gsi1pk = "MSG#<wamid>"` and
`gsi1sk = "WEBHOOK"`), the fixed `findBroadcastReceiptByWamid` function SHALL return
a non-null object containing the correct `adminSub`, `sk`, and `deliveryStatus`
values from that record.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — No-Receipt WAMID Still Returns Null

_For any_ WAMID where the bug condition does NOT hold (no `BROADCAST_RECEIPT` record
exists in DynamoDB for that WAMID), the fixed `findBroadcastReceiptByWamid` function
SHALL return `null`, producing the same result as the original function for that
input.

**Validates: Requirements 3.1, 3.2, 3.3**

---

## Fix Implementation

### Changes Required

**File**: `amplify/functions/vidaBaileWhatsapp/handler.ts`

**Function**: `findBroadcastReceiptByWamid` (lines 34–51)

**Specific Changes**:

1. **Replace `gsi1pk` value**: Change `{ S: "BROADCAST_RECEIPT" }` to
   `{ S: \`MSG#${wamid}\` }` so the partition key matches what the write path stores.

2. **Replace `gsi1sk` value**: Change `{ S: \`WAMID#${wamid}\` }` to
   `{ S: "WEBHOOK" }` so the sort key matches what the write path stores.

**Before:**
```typescript
ExpressionAttributeValues: {
  ":gsi1pk": { S: "BROADCAST_RECEIPT" },
  ":gsi1sk": { S: `WAMID#${wamid}` }
}
```

**After:**
```typescript
ExpressionAttributeValues: {
  ":gsi1pk": { S: `MSG#${wamid}` },
  ":gsi1sk": { S: "WEBHOOK" }
}
```

No other lines in the file change. No other files change.

---

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples
that demonstrate the bug on the **unfixed** code to confirm the root cause, then
verify the fix works correctly and preserves all existing behavior.

---

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the
fix. Confirm or refute the root cause analysis. If we refute, we will need to
re-hypothesize.

**Test Plan**: Mock the DynamoDB `QueryCommand` to simulate what the real table
contains (a `BROADCAST_RECEIPT` record keyed with `gsi1pk = MSG#<wamid>` and
`gsi1sk = WEBHOOK`). Call `findBroadcastReceiptByWamid` on the **unfixed** code and
assert the return value is the receipt object. The unfixed code will return `null`
instead, confirming the mismatch.

**Test Cases**:

1. **Status-update receipt lookup (unfixed)**: Write a mock that returns the
   `BROADCAST_RECEIPT` item when queried with `gsi1pk = "MSG#wamid.ABC"` /
   `gsi1sk = "WEBHOOK"`. Call `findBroadcastReceiptByWamid("wamid.ABC")` on unfixed
   code. Expected: receipt object. Actual on unfixed: `null`. _(will fail on unfixed code)_

2. **Read-status receipt lookup (unfixed)**: Same as above with a different WAMID
   to verify the pattern is consistent, not WAMID-specific. _(will fail on unfixed code)_

3. **Inbound-reply context lookup (unfixed)**: Simulate an inbound message where
   `msg.context.id = "wamid.XYZ"` and a receipt exists for that WAMID. Assert
   `adminSub` and `campaignId` are resolved. On unfixed code, `adminSub` will be
   empty and the message will be discarded. _(will fail on unfixed code)_

4. **Out-of-range WAMID (no receipt)**: Call `findBroadcastReceiptByWamid` for a
   WAMID that has no record in the mock. Assert `null` is returned. Should pass on
   both unfixed and fixed code (no change expected). _(expected to pass on both)_

**Expected Counterexamples**:

- On unfixed code, cases 1–3 return `null` instead of the receipt object.
- Root cause confirmed: the DynamoDB mock receives queries with
  `gsi1pk = "BROADCAST_RECEIPT"` (not `"MSG#<wamid>"`), which match zero items.

---

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed
function produces the expected behavior.

**Pseudocode:**
```
FOR ALL wamid WHERE isBugCondition(wamid) DO
  result := findBroadcastReceiptByWamid_fixed(wamid)
  ASSERT result ≠ null
  ASSERT result.adminSub = expectedAdminSub(wamid)
  ASSERT result.sk       = expectedSk(wamid)
END FOR
```

---

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (WAMID
has no receipt), the fixed function returns `null` — the same result as the
original function for those inputs.

**Pseudocode:**
```
FOR ALL wamid WHERE NOT isBugCondition(wamid) DO
  ASSERT findBroadcastReceiptByWamid_original(wamid)
       = findBroadcastReceiptByWamid_fixed(wamid)
       = null
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation
checking because:

- It generates many random WAMID strings automatically, covering formats the write
  path never uses.
- It catches edge cases (empty string, very long WAMID, special characters) that
  manual unit tests might miss.
- It provides strong guarantees that the null-return path is unconditionally
  preserved for all non-existent WAMIDs.

**Test Cases**:

1. **Empty mock — any WAMID returns null**: Configure the DynamoDB mock to always
   return `{ Items: [] }`. For any WAMID input (generated by PBT), assert the
   result is `null`.
2. **Non-broadcast inbound message routing**: Verify that an inbound message with
   no `contextWamid` is still enqueued to `INBOUND_CHAT_QUEUE` and adminSub
   resolution via display phone is unchanged.
3. **`updateBroadcastReceiptStatus` call signature**: Verify that when a receipt
   IS found (fixed code), `updateBroadcastReceiptStatus` is called with the same
   `(adminSub, sk, status, extras)` arguments as the original design — the call
   sites must not change.

---

### Unit Tests

- Call `findBroadcastReceiptByWamid` with a mocked DynamoDB that holds a
  `BROADCAST_RECEIPT` at `MSG#<wamid>` / `WEBHOOK`; assert correct object returned.
- Call `findBroadcastReceiptByWamid` with a mocked DynamoDB that holds nothing;
  assert `null` returned.
- Verify the `QueryCommand` parameters sent to DynamoDB contain
  `":gsi1pk": { S: "MSG#<wamid>" }` and `":gsi1sk": { S: "WEBHOOK" }` after the fix.
- Test `updateBroadcastReceiptStatus` is called with receipt fields when receipt
  is found in the status-update path.
- Test `updateBroadcastReceiptStatus` is NOT called when receipt is `null` (no-op
  path, WAMID not a broadcast).

### Property-Based Tests

- Generate random WAMID strings; assert `findBroadcastReceiptByWamid` returns
  `null` when the DynamoDB mock returns empty (preservation of no-receipt path).
- Generate random WAMID strings; assert the `QueryCommand` always uses
  `gsi1pk = "MSG#" + wamid` regardless of WAMID format (fix correctness
  invariant).
- Generate random inbound message payloads with no `contextWamid`; assert they
  are always enqueued to `INBOUND_CHAT_QUEUE` regardless of the GSI fix (non-
  broadcast flow preservation).

### Integration Tests

- End-to-end status-update webhook: send a mock `value.statuses` payload with a
  WAMID that maps to a real `BROADCAST_RECEIPT` record; assert `deliveryStatus`
  is updated to `"delivered"` in DynamoDB.
- End-to-end read-status webhook: same as above with `status = "read"`; assert
  `isRead = true` and `readAt` are written.
- End-to-end inbound reply: send a mock `value.messages` payload where
  `msg.context.id` maps to a broadcast receipt; assert `adminSub` is resolved,
  message is enqueued to chat agent, and receipt's `hasReplied` flag is set to
  `true`.
- Negative integration: send a status-update webhook for a WAMID with no receipt;
  assert the handler returns `200 OK` and no DynamoDB write occurs.
