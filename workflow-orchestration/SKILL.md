---
name: workflow-orchestration
description: >-
  Orchestrates durable multi-step workflow pipelines on the iii engine. Use
  when building order fulfillment, data pipelines, task orchestration, or any
  sequential process requiring retries, backoff, step tracking, scheduled
  cleanup, or dead letter queue (DLQ) handling.
---

# Workflow Orchestration & Durable Execution

Comparable to: Temporal, Airflow, Inngest

## Key Concepts

Use the concepts below when they fit the task. Not every workflow needs every durability or tracking mechanism shown here.

- Each pipeline step is a registered function chained via **named queues** with config-driven retries
- Step progress is tracked in **shared state** and broadcast via **streams**
- A **cron trigger** handles scheduled maintenance (e.g. stale order cleanup)
- Queue behavior (retries, backoff, concurrency, FIFO) is defined per queue in `iii-config.yaml`

## Architecture

```
HTTP (create order)
  → Enqueue(order-validate) → validate
    → Enqueue(order-payment) → charge-payment
      → Enqueue(order-ship) → ship
        → publish(order.fulfilled)

Cron (hourly) → cleanup-stale

Queue configs (iii-config.yaml):
  order-validate:  max_retries: 2
  order-payment:   max_retries: 5, type: fifo, concurrency: 2
  order-ship:      max_retries: 3
```

## iii Primitives Used

| Primitive                                                    | Purpose                                   |
| ------------------------------------------------------------ | ----------------------------------------- |
| `registerWorker`                                             | Initialize the worker and connect to iii  |
| `registerFunction`                                           | Define each pipeline step                 |
| `trigger({ ..., action: TriggerAction.Enqueue({ queue }) })` | Durable step chaining via named queues    |
| `trigger({ function_id: 'state::...', payload })`            | Track step progress                       |
| `trigger({ ..., action: TriggerAction.Void() })`             | Fire-and-forget stream events and publish |
| `registerTrigger({ type: 'cron' })`                          | Scheduled maintenance                     |
| `registerTrigger({ type: 'http' })`                          | Entry point                               |

## Reference Implementation

See [reference.js](reference.js) for the full working example — an order fulfillment pipeline
with validate → charge → ship steps, retry configuration, stream-based progress tracking,
and hourly stale-order cleanup.

## Common Patterns

Code using this pattern commonly includes, when relevant:

- `registerWorker(url, { workerName })` — worker initialization
- `trigger({ function_id, payload, action: TriggerAction.Enqueue({ queue }) })` — durable step chaining via named queues
- `trigger({ function_id: 'state::update', payload: { scope, key, ops } })` — step progress tracking
- Named queues with a comment referencing `iii-config.yaml` for retry/concurrency settings
- `const { logger } = getContext()` — structured logging per step
- Each step as its own `registerFunction` with a single responsibility
- `trigger({ function_id: 'publish', payload, action: TriggerAction.Void() })` — completion broadcast

## Adapting This Pattern

Use the adaptations below when they apply to the task.

- Each step should do one thing and enqueue the next function on success
- Define separate named queues in `iii-config.yaml` when steps need different retry/concurrency settings
- The `trackStep` helper pattern (state update + stream event) is reusable for any pipeline
- Failed jobs exhaust retries and move to a DLQ — see the [dead-letter-queues HOWTO](https://iii.dev/docs/how-to/dead-letter-queues)
- Cron expressions use 7-position numeric format: `0 0 * * * * *` (every hour)
