# Bugfix Requirements Document

## Introduction

The `findBroadcastReceiptByWamid` function in `amplify/functions/vidaBaileWhatsapp/handler.ts`
uses incorrect GSI key values when looking up a `BROADCAST_RECEIPT` record by WhatsApp message ID
(WAMID). As a result, every Meta delivery-status webhook callback (delivered, read, failed) silently
fails to find its receipt and returns without updating `deliveryStatus`. The Admin UI permanently
shows all broadcast messages as "SENT", making delivery tracking completely non-functional.

The records are written correctly by `vidaBaileProcessOutboundQueue` with
`gsi1pk = MSG#<wamid>` and `gsi1sk = WEBHOOK`. The bug is exclusively in the read path.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a Meta webhook delivers a status callback (delivered, read, or failed) for a WAMID that
    has a `BROADCAST_RECEIPT` record in DynamoDB THEN the system queries the GSI with
    `gsi1pk = "BROADCAST_RECEIPT"` and `gsi1sk = "WAMID#<wamid>"`, which never matches any item,
    and logs `ℹ️ No receipt found for WAMID: <wamid> (likely non-broadcast message)`.

1.2 WHEN `findBroadcastReceiptByWamid` returns null due to the key mismatch THEN the system skips
    the `updateBroadcastDeliveryStatus` call entirely, leaving `deliveryStatus` permanently at
    `"SENT"` regardless of the actual delivery outcome.

### Expected Behavior (Correct)

2.1 WHEN a Meta webhook delivers a status callback for a WAMID that has a `BROADCAST_RECEIPT`
    record in DynamoDB THEN the system SHALL query the GSI with `gsi1pk = "MSG#<wamid>"` and
    `gsi1sk = "WEBHOOK"`, matching the key pattern written by `vidaBaileProcessOutboundQueue`,
    and SHALL return the corresponding receipt item.

2.2 WHEN `findBroadcastReceiptByWamid` successfully returns a receipt item THEN the system SHALL
    call `updateBroadcastDeliveryStatus` and update the `deliveryStatus` field to the value
    reported by Meta (e.g., `"delivered"`, `"read"`, or `"failed"`).

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a Meta webhook delivers a regular inbound member message (not a broadcast delivery status)
    THEN the system SHALL CONTINUE TO route it through the chat agent pipeline without attempting a
    broadcast receipt lookup.

3.2 WHEN `findBroadcastReceiptByWamid` is called with a WAMID that has no corresponding
    `BROADCAST_RECEIPT` record in DynamoDB THEN the system SHALL CONTINUE TO return `null` and log
    the informational "not a broadcast message" message without throwing an error.

3.3 WHEN a broadcast delivery status callback arrives for a `"failed"` status THEN the system SHALL
    CONTINUE TO update `deliveryStatus` to `"failed"` (no change to this logic — only the lookup
    is affected).

3.4 WHEN `vidaBaileProcessOutboundQueue` writes a new `BROADCAST_RECEIPT` record THEN the system
    SHALL CONTINUE TO write `gsi1pk = "MSG#<wamid>"` and `gsi1sk = "WEBHOOK"` unchanged (the
    write path is correct and must not be modified).

---

## Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type WebhookStatusEvent
  OUTPUT: boolean

  // Returns true when the GSI query will fail to find the receipt
  RETURN X.type = "STATUS_UPDATE"
     AND X.wamid IS NOT NULL
     AND DynamoDB_has_receipt_for(X.wamid)   // receipt exists but query uses wrong keys
END FUNCTION
```

**Fix Checking Property:**
```pascal
// FOR ALL status callbacks where a matching BROADCAST_RECEIPT exists:
FOR ALL X WHERE isBugCondition(X) DO
  result ← findBroadcastReceiptByWamid'(X.wamid)   // F' = fixed function
  ASSERT result IS NOT NULL
  ASSERT result.deliveryStatus = X.status
END FOR
```

**Preservation Property:**
```pascal
// FOR ALL inputs that do NOT trigger the bug condition:
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT findBroadcastReceiptByWamid'(X.wamid) = findBroadcastReceiptByWamid(X.wamid)
END FOR
```
