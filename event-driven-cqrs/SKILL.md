---
name: event-driven-cqrs
description: >-
  Implements event-driven CQRS systems on the iii platform. Use when building
  event-sourced architectures with command/query separation, read model
  projections, append-only event logs, or fan-out notifications.
---

# Event-Driven / Message Systems (CQRS)

Comparable to: Kafka, RabbitMQ, CQRS/Event Sourcing systems

## Key Concepts

Use the concepts below when they fit the task. Not every event-driven system needs every CQRS element shown here.

- **Commands** validate input and append to an event log (write side)
- Commands **publish** domain events via pubsub
- **Projections** subscribe to events and build query-optimized read models (read side)
- The **event log** is append-only state — the source of truth
- **Multiple projections** independently subscribe to the same events via pubsub (catalog view, analytics, alerts)
- **PubSub** handles all fan-out — both to projections and downstream notification consumers

## Architecture

```
Write side:
  HTTP POST /inventory/add → cmd::add-inventory-item → appendEvent → publish(item-added)
  HTTP POST /inventory/sell → cmd::sell-item → appendEvent → publish(item-sold)

Read side (projections, each subscribes independently via pubsub):
  subscribe(item-added) → proj::catalog-on-add (build catalog view)
  subscribe(item-sold)  → proj::catalog-on-sell (update stock)
  subscribe(item-sold)  → proj::sales-analytics (aggregate metrics)
  subscribe(item-sold)  → notify::low-stock-alert → publish(alerts.low-stock)
    → subscribe(alerts.low-stock) → notify::slack-low-stock

Query endpoints:
  GET /inventory → query::catalog
  GET /inventory/analytics → query::sales-analytics
  GET /inventory/history → query::event-history (reads event log directly)
```

## iii Primitives Used

| Primitive                                                                    | Purpose                                                        |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `registerWorker`                                                             | Initialize the worker and connect to iii                       |
| `registerFunction`                                                           | Commands, projections, queries, notification handlers          |
| `trigger({ function_id: 'state::...', payload })`                            | Event log storage, read model persistence, incremental updates |
| `trigger({ function_id: 'publish', payload, action: TriggerAction.Void() })` | Publish domain events and notifications                        |
| `registerTrigger({ type: 'subscribe' })`                                     | Wire projections and consumers to events                       |
| `registerTrigger({ type: 'http' })`                                          | Command and query endpoints                                    |

## Reference Implementation

See [reference.js](reference.js) for the full working example — an inventory system with
add/sell commands, an append-only event log, catalog and analytics projections, and
low-stock alert fan-out.

## Common Patterns

Code using this pattern commonly includes, when relevant:

- `registerWorker(url, { workerName })` — worker initialization
- `trigger({ function_id: 'publish', payload: { topic, data }, action: TriggerAction.Void() })` — publish domain events
- `registerTrigger({ type: 'subscribe', function_id, config: { topic } })` — wire projections/consumers to events
- Separate state scopes for event log vs. read models (`event-log`, `inventory-read`, etc.)
- `functionId` prefixes reflecting CQRS role: `cmd::`, `proj::`, `query::`, `notify::`
- Commands validate then publish — never write directly to read models
- Projections subscribe independently and must be idempotent

## Adapting This Pattern

Use the adaptations below when they apply to the task.

- Commands validate then publish events — never write directly to read models
- Projections must be idempotent (safe to replay)
- Use pubsub (`publish` + `subscribe` triggers) for all event fan-out — projections and notifications alike
- Use separate state scopes for the event log (`event-log`), each read model (`inventory-read`, `sales-analytics`), etc.
- `functionId` segments should reflect the CQRS role: `cmd::`, `proj::`, `query::`, `notify::`
- The `appendEvent` helper (read-then-append to state) is reusable for any aggregate
