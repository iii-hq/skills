---
name: effect-system
description: >-
  Composes and chains function pipelines on the iii engine. Use when building
  typed functional workflows, function composition, or data pipelines where each
  step is a pure function that can be independently tested, reused across
  pipelines, and traced end-to-end.
---

# Effect System & Typed Functional Infrastructure

Comparable to: Effect-TS

## Key Concepts

Use the concepts below when they fit the task. Not every effect-style pipeline needs all of them.

- Each "effect" is a small, focused registered function (validate, check-duplicate, enrich, persist, notify)
- Pipelines compose effects by calling `iii.trigger()` sequentially — like `Effect.pipe`
- The same primitives are reused across different pipelines (single registration, multi-use composition)
- Errors propagate naturally (thrown errors bubble up through the trigger chain)
- Every step gets distributed tracing automatically

## Architecture

```
Pipeline A: register-user
  parse-input → check-duplicate → enrich → persist → send-welcome

Pipeline B: import-users-batch
  for each user:
    parse-input → check-duplicate → enrich → persist
    (reuses the same 4 functions, skips welcome)
```

## iii Primitives Used

| Primitive                                             | Purpose                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `registerWorker`                                      | Initialize the worker and connect to iii                                     |
| `registerFunction`                                    | Define each effect (pure-ish function)                                       |
| `trigger({ function_id, payload })`                   | Synchronous composition — call one effect from another, get the return value |
| `trigger({ ..., action: TriggerAction.Void() })`      | Fire-and-forget side effects (publish)                                       |
| `trigger({ function_id: 'state::set/get', payload })` | Persistence effects                                                          |
| `registerTrigger({ type: 'http' })`                   | Expose pipelines as endpoints                                                |

## Reference Implementation

See [reference.js](reference.js) for the full working example — a user registration pipeline
composed from 5 primitive effects, plus a batch import pipeline that reuses 4 of the same effects.

## Common Patterns

Code using this pattern commonly includes, when relevant:

- `registerWorker(url, { workerName })` — worker initialization
- Each effect as a small `registerFunction` with a single responsibility (one validation, one transform, one side effect)
- `await iii.trigger({ function_id, payload })` — synchronous composition (call effect, get return value)
- A pipeline function that composes effects sequentially via chained `trigger()` calls
- Error propagation: effects throw, pipeline catches at the recovery boundary
- `trigger({ function_id: 'publish', ..., action: TriggerAction.Void() })` — fire-and-forget side effects
- `functionId` segments reflecting the effect domain: `fx::parse-X`, `fx::persist-X`

## Adapting This Pattern

Use the adaptations below when they apply to the task.

- Keep effects small: one validation, one transform, one side effect per function
- Compose via `await iii.trigger({ function_id: effectId, payload: data })` — each call is traced and independently retryable
- Reuse effects across pipelines rather than duplicating logic
- Error handling: let effects throw; catch at the pipeline level where recovery decisions are made
- `functionId` segments should reflect the effect domain (e.g. `fx::parse-user-input`, `fx::persist-user`)
