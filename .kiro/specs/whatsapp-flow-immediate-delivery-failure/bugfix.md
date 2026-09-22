# Bugfix Requirements Document

## Introduction

Every broadcast message sent via the WhatsApp interactive Flow channel fails with a `failed`
delivery status approximately one second after `vidaBaileProcessOutboundQueue` logs
`✅ Sent`. This is a 100% failure rate production regression. The root cause is that
`flow_action: "data_exchange"` causes the recipient's WhatsApp client to immediately call
the `vidaBaileFlowEndpoint` Lambda Function URL on delivery. If that call fails for any
reason — URL mismatch after redeployment, decryption key mismatch, cold-start timeout, or
Flow not being PUBLISHED — Meta marks the entire outbound message as `failed` and no
message reaches the recipient's device.

There are four distinct bug conditions (A–D), any one of which is sufficient to produce the
symptom. The fix must address all four, plus add a plain-text fallback so broadcasts remain
deliverable while Flow infrastructure issues are being resolved.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `vidaBaileFlowEndpoint`'s Lambda Function URL has changed since the Meta Flow was
    last registered (Condition A — URL mismatch after redeployment) THEN the system sends the
    interactive Flow message, Meta returns HTTP 200 with a WAMID, and within ~1 second Meta
    marks that WAMID as `failed` because the `INIT` request from WhatsApp hits a 404.

1.2 WHEN the Meta Flow record itself is in DRAFT mode rather than PUBLISHED (Condition B)
    THEN the system sends the message with `mode: "published"`, Meta returns HTTP 200 with a
    WAMID, and Meta immediately marks the WAMID as `failed` because DRAFT Flows cannot be
    delivered to end users.

1.3 WHEN the RSA private key stored in the `FLOW_PRIVATE_KEY` Amplify secret does not match
    the public key registered in the Meta Flow (Condition C — key pair mismatch) THEN the
    system sends the message successfully, WhatsApp calls the Flow endpoint with an encrypted
    INIT payload, `decryptMetaRequest` throws a crypto error, and the Lambda returns HTTP 500,
    causing Meta to mark the WAMID as `failed`.

1.4 WHEN the `vidaBaileFlowEndpoint` Lambda experiences a cold start combined with a
    DynamoDB query during INIT handling (Condition D) THEN the system sends the message
    successfully, WhatsApp calls the Flow endpoint, the endpoint exceeds Meta's response
    deadline, and Meta marks the WAMID as `failed` due to timeout.

1.5 WHEN any unhandled exception occurs inside `vidaBaileFlowEndpoint` THEN the system logs
    `❌ Flow execution error:` followed by the error object but returns only the string
    `"Internal Server Error"` as the HTTP 500 body, providing no structured error detail
    visible to operators in CloudWatch beyond the top-level message.

1.6 WHEN `templateName === "promo_offer"` and the Flow infrastructure is broken (any of
    conditions A–D are active) THEN the system has no fallback delivery mechanism and every
    broadcast message in the campaign fails with zero recipients reached.

---

### Expected Behavior (Correct)

2.1 WHEN `vidaBaileFlowEndpoint`'s Lambda Function URL has changed since the Meta Flow was
    last registered THEN the system SHALL provide a documented, repeatable operational
    procedure that operators follow after every Amplify deployment to re-register the new URL
    in the Meta Flow, preventing URL mismatch from reaching production.

2.2 WHEN the Meta Flow is not in PUBLISHED state THEN the system SHALL provide a documented
    verification checklist that confirms the Flow is PUBLISHED before any broadcast campaign
    is dispatched, and the Flow publication state SHALL be verifiable independently of the
    send path.

2.3 WHEN `decryptMetaRequest` fails due to a key mismatch or any other crypto error THEN the
    system SHALL log the specific exception class, error message, and the names of the
    encrypted fields present in the payload (without logging key material or decrypted content)
    to CloudWatch, so operators can distinguish a key-mismatch failure from a malformed-payload
    failure.

2.4 WHEN a cold start causes `vidaBaileFlowEndpoint` to approach its 15-second timeout THEN
    the system SHALL log a timing warning at the start and completion of each DynamoDB
    operation during INIT handling so operators can identify which operation contributes to
    latency.

2.5 WHEN any exception propagates to the top-level catch block in `vidaBaileFlowEndpoint`
    THEN the system SHALL log the full error stack trace, the `action` value from the
    decrypted payload (if decryption succeeded), and a structured error context object to
    CloudWatch before returning HTTP 500, so the actual failure cause is visible without
    requiring a code change or redeployment.

2.6 WHEN `templateName === "promo_offer"` and a delivery attempt with an interactive Flow
    message fails at the Meta API level (non-200 response or missing WAMID) THEN the system
    SHALL automatically retry the same recipient using a plain-text message containing
    `promotionalContent`, log the fallback as a warning with the original error, and record
    the BROADCAST_RECEIPT with `deliveryStatus: "SENT_FALLBACK"` instead of `"SENT"`.

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `templateName !== "promo_offer"` (plain-text broadcast path) THEN the system SHALL
    CONTINUE TO send a `type: "text"` message to the recipient without invoking any Flow
    logic, unaffected by any Flow infrastructure state.

3.2 WHEN the interactive Flow message is sent successfully AND the Flow endpoint responds
    correctly to the INIT action THEN the system SHALL CONTINUE TO create the BROADCAST_RECEIPT
    with `deliveryStatus: "SENT"`, `gsi1pk: "MSG#<wamid>"`, and `gsi1sk: "WEBHOOK"` as before.

3.3 WHEN `vidaBaileFlowEndpoint` receives a valid, correctly encrypted INIT request THEN the
    system SHALL CONTINUE TO decrypt the payload, call `fetchActivePackages`, and return the
    encrypted `Packages_Screen` response to the WhatsApp client.

3.4 WHEN `vidaBaileFlowEndpoint` receives a `ping` action THEN the system SHALL CONTINUE TO
    return HTTP 200 with `{ data: { status: "active" } }` encrypted in the response body.

3.5 WHEN `vidaBaileFlowEndpoint` processes a `data_exchange` action for `FINALIZE_SUBMISSION`
    THEN the system SHALL CONTINUE TO update the BROADCAST_RECEIPT with
    `memberBookingStatus: "BOOKED"` and return the `Terminal_Success` screen.

3.6 WHEN `FLOW_ID` environment variable is not set THEN the system SHALL CONTINUE TO throw
    `"WHATSAPP_FLOW_ID environment variable is not set"` before any Meta API call is made,
    preventing a malformed interactive message from being sent.

3.7 WHEN a plain-text fallback message is sent for a recipient (behavior introduced by 2.6)
    THEN the system SHALL CONTINUE TO process other recipients in the same SQS batch
    independently; a fallback for one recipient SHALL NOT affect delivery of other recipients.

---

## Bug Condition Pseudocode

```pascal
// Bug Condition — identifies which send attempts trigger immediate 'failed' status
FUNCTION isBugCondition(attempt)
  INPUT: attempt { templateName, flowUrlMatchesMeta, flowIsPublished,
                   privateKeyMatchesMeta, flowEndpointRespondsWithinDeadline }
  OUTPUT: boolean

  IF attempt.templateName ≠ "promo_offer" THEN RETURN false  // plain-text path not affected

  // Any ONE of A, B, C, D is sufficient to cause 'failed'
  IF NOT attempt.flowUrlMatchesMeta          THEN RETURN true  // Condition A
  IF NOT attempt.flowIsPublished             THEN RETURN true  // Condition B
  IF NOT attempt.privateKeyMatchesMeta       THEN RETURN true  // Condition C
  IF NOT attempt.flowEndpointRespondsWithinDeadline THEN RETURN true  // Condition D

  RETURN false
END FUNCTION

// Property: Fix Checking — fallback must deliver when any bug condition is met
FOR ALL attempt WHERE isBugCondition(attempt) DO
  result ← sendBroadcast'(attempt)
  ASSERT result.metaDeliveryStatus ≠ "failed"
  ASSERT result.recipientReceivedMessage = true
  ASSERT result.broadcastReceiptDeliveryStatus ∈ { "SENT", "SENT_FALLBACK" }
END FOR

// Property: Preservation Checking — non-buggy inputs unchanged
FOR ALL attempt WHERE NOT isBugCondition(attempt) DO
  ASSERT sendBroadcast'(attempt) = sendBroadcast(attempt)
END FOR
```
