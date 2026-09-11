# Kafka and Event-Driven Architecture

> **Topic:** Kafka's event model, delivery guarantees, partitioning, consumer groups, and reliable event-driven services.

## 1. Core Concepts

Apache Kafka is a distributed event-streaming platform. Producers write records to **topics**, and brokers persist those records in ordered **partitions**.

- A **record** contains a key, value, timestamp, and optional headers.
- A **partition** is an append-only ordered log.
- An **offset** identifies a record's position within a partition.
- A **consumer group** divides partitions among its members so each record is processed by one member of that group.

Kafka preserves ordering only within a partition. Choose a record key that keeps related events in the same partition when their order matters.

## 2. Producers and Consumers

Producers can use acknowledgements to trade latency for durability:

| Setting | Meaning |
|---|---|
| `acks=0` | Do not wait for broker acknowledgement |
| `acks=1` | Leader acknowledges the record |
| `acks=all` | All in-sync replicas acknowledge the record |

Consumers poll records, process them, and commit offsets. Commit an offset only after the corresponding work has succeeded; otherwise a crash can cause data loss.

## 3. Delivery Semantics

- **At-most-once:** commit before processing; records are not repeated, but failures can lose records.
- **At-least-once:** process before committing; records can be redelivered, so consumers must be idempotent.
- **Exactly-once:** combine Kafka transactions and careful transactional processing where the full workflow supports it.

In most services, at-least-once delivery with an idempotency key is the practical default.

## 4. Reliable Event Design

Events should describe facts that happened, such as `OrderPlaced`, rather than commands that request work. Include a stable event ID, aggregate ID, event type, schema version, occurred-at timestamp, and correlation ID.

The **transactional outbox** pattern writes the business change and an outbox event in the same database transaction. A relay then publishes the outbox record to Kafka, preventing a successful database update from being separated from its event.

## 5. Operational Guidelines

Use replication and `acks=all` for important data, monitor consumer lag, define retention according to replay requirements, and plan partition counts before production. Consumers should handle retries, dead-letter topics, poison messages, schema compatibility, and graceful rebalancing.