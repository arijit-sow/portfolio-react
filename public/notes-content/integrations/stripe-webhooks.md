# Stripe Webhooks

> **Topic:** Receiving, verifying, and reliably processing Stripe webhook events.

## 1. What a Webhook Provides

Stripe sends an HTTP request when an asynchronous event occurs, such as a successful payment, a failed payment, or a subscription change. The webhook is the source of truth for state transitions that may happen after the original API request.

The endpoint should read the **raw request body**, verify the `Stripe-Signature` header with the webhook signing secret, and only then parse the event.

```java
Event event = Webhook.constructEvent(
    rawBody,
    signatureHeader,
    webhookSecret
);
```

Do not verify a parsed and re-serialized JSON object because even harmless formatting changes can invalidate the signature.

## 2. Reliable Processing

Webhook delivery is at least once. The same event may be sent more than once, and events may arrive out of order. Store the Stripe event ID with a unique constraint before applying a state transition, or use an equivalent idempotency mechanism.

```text
receive request
  -> verify signature
  -> record event ID
  -> enqueue processing
  -> acknowledge quickly
```

Return a successful response only after the event has been durably accepted. Perform slow work asynchronously so Stripe does not retry because the endpoint timed out.

## 3. Security and Validation

- Keep the webhook secret outside source control.
- Verify the signature and reject stale timestamps according to the SDK's tolerance.
- Check that the event type is supported.
- Confirm the event belongs to the expected account, mode, and connected account where applicable.
- Never trust client-supplied payment status over a verified Stripe event.

## 4. Testing and Operations

Use Stripe's CLI or test mode to send representative events. Log event IDs, types, request correlation IDs, and processing outcomes without logging secrets or full payment details. Provide retry-safe handling, dead-letter visibility, and a manual replay path for failed events.

When a webhook changes local state, model the transition explicitly and tolerate duplicate or out-of-order notifications. A webhook handler should be safe to run more than once.