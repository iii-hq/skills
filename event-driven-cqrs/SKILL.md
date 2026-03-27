---
name: event-driven-cqrs
description: >-
  Implements CQRS with event sourcing on the iii engine. Use when building
  command/query separation, event-sourced systems, or fan-out architectures
  where commands emit domain events to queue topics and multiple read model
  projections consume independently.
---

# Event-Driven CQRS & Event Sourcing

Comparable to: Kafka, RabbitMQ, CQRS/Event Sourcing systems

## Key Concepts

Use the concepts below when they fit the task. Not every CQRS system needs all of them.

- **Write side**: Commands validate input and emit domain events to queue topics
- **Read side**: Multiple projections consume events independently, building query-optimized views in state
- **Event log**: Events are appended to state as an ordered log (event sourcing)
- **Topic-based queues** handle fan-out across independently bound consumers
- **Named queues** handle dedicated workloads (alerts, notifications, heavy compute)
- **HTTP triggers** expose both command endpoints (POST) and query endpoints (GET)

## Architecture

```text
HTTP POST /inventory (command)
  → cmd::add-inventory-item → validate → append event to state
    → enqueue(topic='inventory.item-added')
      ↓ (fan-out via queue topic triggers)
      → proj::inventory-list (updates queryable list view)
      → proj::inventory-stats (updates aggregate counters)
      → notify::inventory-alert (sends low-stock alerts)

HTTP GET /inventory (query)
  → query::list-inventory → reads from projection state
```

## iii Primitives Used

| Primitive                                                   | Purpose                                   |
| ----------------------------------------------------------- | ----------------------------------------- |
| `registerWorker`                                            | Initialize the worker and connect to iii  |
| `registerFunction`                                          | Define commands, projections, and queries |
| `trigger({ function_id: 'state::set/get/list', payload })`  | Event log and projection state            |
| `trigger({ function_id: 'enqueue', payload: { topic, data } })` | Emit domain events by topic queue     |
| `registerTrigger({ type: 'queue', config: { topic } })`      | Bind projections to event topic queues    |
| `trigger({ ..., action: TriggerAction.Enqueue({ queue }) })` | Dispatch dedicated work to named queues   |
| `registerTrigger({ type: 'http' })`                         | Command and query endpoints               |
| `trigger({ ..., action: TriggerAction.Void() })`            | Optional non-critical side effects        |

## Reference Implementation

See [../references/event-driven-cqrs.js](../references/event-driven-cqrs.js) for the full working example — an inventory management system
with commands that emit domain events through queue topics and multiple projections building query-optimized views.

## Common Patterns

Code using this pattern commonly includes, when relevant:

- `registerWorker(url, { workerName })` — worker initialization
- `trigger({ function_id: 'state::set', payload: { scope: 'events', key, value } })` — event log append
- `trigger({ function_id: 'enqueue', payload: { topic, data } })` — domain event enqueue by topic
- `registerTrigger({ type: 'queue', function_id, config: { topic } })` — projection topic queue bindings
- `trigger({ function_id, payload, action: TriggerAction.Enqueue({ queue }) })` — named queue handoff
- Command functions with `cmd::` prefix, projection functions with `proj::` prefix, query functions with `query::` prefix
- Multiple projections consuming the same topic independently
- `const logger = new Logger()` — structured logging per command/projection

## Adapting This Pattern

Use the adaptations below when they apply to the task.

- Add new projections by registering queue topic triggers on existing event topics
- Use separate state scopes for each projection (e.g. `inventory-list`, `inventory-stats`)
- Commands should validate before enqueueing events — reject invalid commands early
- Use named queues for slow downstream workloads (alerts, webhooks, notifications)
- Event IDs should be unique and monotonic for ordering (e.g. `evt-${Date.now()}-${counter}`)

## Queue Mode Choice

- **Topic-based queues** for domain events and independent projection fanout.
- **Named queues** for bounded worker pools where retry/concurrency/FIFO are tuned per workload.

## Pattern Boundaries

- If the task is about simple CRUD with reactive side effects, prefer `reactive-backend`.
- If the task needs durable multi-step pipelines with retries, prefer `workflow-orchestration`.
- Stay with `event-driven-cqrs` when command/query separation, event sourcing, and independent projections are the primary concerns.

## When to Use

- Use this skill when the task is primarily about `event-driven-cqrs` in the iii engine.
- Triggers when the request directly asks for this pattern or an equivalent implementation.

## Boundaries

- Never use this skill as a generic fallback for unrelated tasks.
- You must not apply this skill when a more specific iii skill is a better fit.
- Always verify environment and safety constraints before applying examples from this skill.
