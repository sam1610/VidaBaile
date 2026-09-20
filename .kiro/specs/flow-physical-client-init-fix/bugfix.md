# Bugfix Requirements Document

## Introduction

When a broadcast message is sent via `vidaBaileProcessOutboundQueue`, the current implementation uses a `template` message type (`promo_offer`) with an embedded WhatsApp Flow button. On physical iOS/Android WhatsApp clients, tapping the Flow button opens the Flow UI but renders a blank package list — the INIT request to the Lambda endpoint is never fired. The same Flow works correctly in the Meta WhatsApp Manager Interactive Mode preview. The root cause is that Meta's `template` message type does not support the `flow_action` / `flow_action_payload` fields required to trigger a dynamic INIT request; only the `interactive` message type (with `type: "flow"`) supports these fields.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a broadcast message is sent using the `promo_offer` template type AND a physical iOS or Android WhatsApp client receives it AND the user taps the Flow button THEN the system opens the Flow UI without firing the INIT request, resulting in a blank/empty package list screen.

1.2 WHEN the broadcast handler attempts to include `flow_action` or `flow_action_payload` fields inside the `template` button parameters THEN the system receives an HTTP 400 error from the Meta Graph API with the message `Unexpected key "flow_action"`, and the message is not sent.

### Expected Behavior (Correct)

2.1 WHEN a broadcast message is sent using the interactive/flow message type AND a physical iOS or Android WhatsApp client receives it AND the user taps the Flow button THEN the system SHALL fire the INIT request to the Lambda endpoint, receive the dynamic package list, and render it correctly in the Flow UI.

2.2 WHEN the broadcast handler builds the outbound message payload THEN the system SHALL use `type: "interactive"` at the top level with `interactive.type: "flow"`, including `flow_action: "navigate"` and `flow_action_payload: { screen: "PACKAGES_SCREEN" }` in the action parameters, so that the Meta Graph API accepts the request and the physical client receives the INIT instruction.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the SQS message `templateName` field is any value other than `promo_offer` THEN the system SHALL CONTINUE TO send a plain-text `text` message type with the `promotionalContent` as the message body, unchanged.

3.2 WHEN any broadcast message is successfully sent THEN the system SHALL CONTINUE TO create a `BROADCAST_RECEIPT` record in DynamoDB with the same key pattern (`pk: adminSub`, `sk: BROADCAST#<broadcastId>#MEMBER#<recipientPhone>`, `gsi1pk: MSG#<wamid>`, `gsi1sk: WEBHOOK`) and the same field values as before.

3.3 WHEN building the `flow_token` for the interactive message THEN the system SHALL CONTINUE TO use the format `BUY_PACKAGE_${packageIntent}_CAMP#${campaignId}_ADMIN#${adminSub}` so that downstream handlers (`vidaBaileChatAgent`, `vidaBaileWhatsapp`) can continue to parse the `CAMP#` and `ADMIN#` segments without modification.

3.4 WHEN an SQS message is missing required fields (`adminSub`, `broadcastId`, `recipientPhone`) THEN the system SHALL CONTINUE TO throw a validation error and report the record as a batch item failure without making any external API calls.
