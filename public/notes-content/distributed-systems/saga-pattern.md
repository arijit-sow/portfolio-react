# Saga Pattern

> **Topic:** Coordinating distributed business transactions without a shared database transaction.

## 1. Why a Saga Is Needed

In a microservices system, one business operation may update several services, each with its own database. A traditional distributed transaction adds coordination and availability costs. A **saga** breaks the operation into a sequence of local transactions.

Each local transaction commits independently and publishes the event that starts the next step. If a later step fails, compensating actions undo the business effect of earlier steps.

## 2. Example

An order workflow might be:

1. Order service creates an order in `PENDING`.
2. Payment service authorizes payment.
3. Inventory service reserves stock.
4. Order service changes the order to `CONFIRMED`.

If inventory cannot be reserved, a compensation event can request a payment refund and mark the order as rejected.

## 3. Orchestration vs. Choreography

| Style | Description | Strength | Risk |
|---|---|---|---|
| Orchestration | A coordinator tells each service what step to perform | Centralized visibility and explicit flow | Coordinator can become a bottleneck or business-logic hub |
| Choreography | Services react to one another's events | Loose coupling and no central coordinator | The overall flow can become difficult to understand and debug |

Use orchestration for long or conditional workflows. Choreography works well for short flows with clear event ownership.

## 4. Compensation Is Not a Database Rollback

A compensation is a new business operation, not a technical undo. A captured payment may require a refund, and a shipped item may require a return rather than simply restoring a row.

Every step should have an idempotency key, explicit status, timeout handling, retry policy, and a durable record of progress. Consumers must safely handle duplicate events because retries are normal in distributed systems.

## 5. Practical Guidelines

Use durable events, correlation IDs, dead-letter handling, observability across the entire saga, and clear terminal states such as `COMPLETED`, `FAILED`, and `COMPENSATION_REQUIRED`. Design for partial failure rather than assuming every service is available.