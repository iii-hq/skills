---
name: reactive-backend
description: >-
  Reference implementation for reactive real-time backends in iii. Use when
  building apps where state changes automatically trigger side effects,
  clients receive live updates via streams, or you need a real-time database
  layer with CRUD endpoints.
---

# Reactive Backend

Comparable to: Convex, Firebase, Supabase, Appwrite

## Key Concepts

- State is the "database" — CRUD via `state::set/get/update/delete/list`
- **State triggers** fire automatically when any value in a scope changes
- Side effects (notifications, metrics, stream pushes) are wired reactively, not imperatively
- **Streams** deliver real-time updates to connected clients

## Architecture

```
HTTP CRUD endpoints
  → state::set/update/delete (writes to 'todos' scope)
    ↓ (automatic state triggers)
    → on-change → stream::send (push to clients)
    → update-metrics → state::update (aggregate counters)

HTTP GET /metrics → reads from 'todo-metrics' scope
WebSocket clients ← stream 'todos-live'
```

## iii Primitives Used

| Primitive | Purpose |
|---|---|
| `registerWorker` | Initialize the worker and connect to iii |
| `registerFunction` | CRUD handlers and reactive side effects |
| `trigger({ function_id: 'state::...', payload })` | Database layer |
| `registerTrigger({ type: 'state', config: { scope } })` | React to any change in a scope |
| `trigger({ ..., action: TriggerAction.Void() })` | Fire-and-forget stream push to clients |
| `registerTrigger({ type: 'http' })` | REST endpoints |

## Reference Implementation

See [reference.js](reference.js) for the full working example — a real-time todo app with
CRUD endpoints, automatic change broadcasting via streams, and reactive aggregate metrics.

## Minimum Patterns

Any code using this pattern must include at minimum:

- `registerWorker(url, { workerName })` — worker initialization
- `trigger({ function_id: 'state::set/get', payload: { scope, key, value } })` — CRUD via state module
- `registerTrigger({ type: 'state', function_id, config: { scope } })` — reactive side effects on state change
- Event argument destructuring in reactive handlers: `async (event) => { const { new_value, old_value, key } = event }`
- `trigger({ function_id: 'stream::send', payload, action: TriggerAction.Void() })` — push live updates to clients
- `const { logger } = getContext()` — structured logging inside handlers

## Adapting This Pattern

- State triggers fire on **any** change in the scope — use the `event` argument (`new_value`, `old_value`, `key`) to determine what changed
- Multiple functions can react to the same scope independently (on-change and update-metrics both watch `todos`)
- Stream clients connect via `ws://host:port/stream/{stream_name}/{group_id}`
- Keep reactive functions fast — offload heavy work to queues if needed
