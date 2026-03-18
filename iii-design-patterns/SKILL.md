---
name: iii-design-patterns
description: >-
  Maps problem domains to iii design pattern skills. Consult when designing,
  architecting, or scaffolding new iii functionality to find the right skill
  for the task before writing any code.
---

# iii Design Pattern Catalog

When the user's task aligns with a known pattern, read the corresponding skill's reference implementation before writing any iii code.

## Pattern → Skill Mapping

| Pattern | Use when... | Skill |
|---|---|---|
| Agentic Backend | Building multi-agent pipelines, AI agent collaboration, research/review/synthesis chains | `agentic-backend` |
| Workflow Orchestration | Building durable multi-step pipelines with retries, step tracking, DLQ handling, scheduled cleanup | `workflow-orchestration` |
| Reactive Backend | Building real-time apps where state changes trigger side effects and stream to clients | `reactive-backend` |
| Effect System | Building composable, pipeable function chains where each step is pure and independently testable | `effect-system` |
| Low-Code Automation | Building simple trigger→transform→action chains, webhook integrations, scheduled digests | `low-code-automation` |
| Traditional Backend | Building REST APIs with routes, model layers, auth middleware, and background jobs | `traditional-backend` |
| Event-Driven CQRS | Building event-sourced systems with command/query separation, projections, and fan-out | `event-driven-cqrs` |

## Use Case → Skill Lookup

Not every use case maps 1:1 to a single skill. Use this table to find which skill(s) to consult for common use cases.

| Use case | Primary skill | Also consult |
|---|---|---|
| REST APIs, CRUD, HTTP routes | `traditional-backend` | — |
| Job queues, background tasks | `workflow-orchestration` | — |
| Pub/Sub, event fan-out, subscriptions | `event-driven-cqrs` | — |
| WebSockets, realtime streams | `reactive-backend` | — |
| Shared state, KV store | `reactive-backend` | `traditional-backend` (model helpers) |
| Durable execution, retry pipelines | `workflow-orchestration` | — |
| Observability, logging, tracing | conventions only | `traditional-backend` (`getContext` pattern) |
| Multi-step workflows, orchestration | `workflow-orchestration` | — |
| AI agents, LLM pipelines | `agentic-backend` | — |
| Feature flags, runtime config | `reactive-backend` | (state + publish for propagation) |
| Multiplayer, game state sync | `reactive-backend` | (streams + publish for events) |
| ETL, data pipelines | `low-code-automation` | `workflow-orchestration` (if retries needed) |
| Remote invocation, service routing | conventions only | `traditional-backend` (HTTP trigger pattern) |
| Composable function pipelines | `effect-system` | — |
| Scheduled tasks, cron jobs | `traditional-backend` | `low-code-automation` (cron + digest pattern) |

When a use case maps to "conventions only," there is no dedicated skill — derive the implementation from the iii conventions skill and the closest skill listed under "Also consult."

Patterns can be combined. For example, a Traditional Backend can incorporate Reactive side effects, or a Workflow Orchestration can use Effect System composition within individual steps.
