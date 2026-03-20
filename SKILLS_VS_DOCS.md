# Skills vs Docs Coverage Analysis

Analysis of all skill folders against `iii-mono/docs`. Skills with matching docs how-to pages should be auto-replaced with the docs content on build.

---

## iii-prefixed Skills (Feature-Specific)

### Has matching docs — auto-replace on build

| Skill | Matching Docs | Coverage |
|-------|---------------|----------|
| **iii-background-jobs** | `how-to/use-queues.mdx`, `how-to/trigger-actions.mdx` | Full |
| **iii-cron-tasks** | `how-to/schedule-cron-task.mdx` | Full |
| **iii-custom-triggers** | `how-to/create-custom-trigger-type.mdx` | Full |
| **iii-realtime-streaming** | `how-to/stream-realtime-data.mdx` | Full |
| **iii-rest-api** | `how-to/expose-http-endpoint.mdx` | Full |
| **iii-state-management** | `how-to/manage-state.mdx`, `how-to/react-to-state-changes.mdx` | Full |
| **iii-python-sdk** | `how-to/use-functions-and-triggers.mdx` (Python examples) | Full |
| **iii-rust-sdk** | `how-to/use-functions-and-triggers.mdx` (Rust examples) | Full |

### Partial docs coverage

| Skill | Matching Docs | Gap |
|-------|---------------|-----|
| **iii-deployment** | `how-to/configure-engine.mdx`, `advanced/deployment.mdx` | Missing Docker production hardening details |
| **iii-observability** | `how-to/configure-engine.mdx` (OTel section), `advanced/telemetry.mdx`, `modules/module-observability.mdx` | Missing SDK-level custom spans/metrics examples |
| **iii-multi-trigger** | `how-to/use-functions-and-triggers.mdx` | `ctx.match()` pattern not documented in docs |
| **iii-workflows** | `how-to/trigger-actions.mdx`, `how-to/use-queues.mdx` | Saga/compensation patterns not in docs |

### No matching docs

| Skill | Topic | Notes |
|-------|-------|-------|
| **iii-ai-agents** | RAG pipelines, multi-agent orchestration, ReAct patterns | No how-to or advanced doc covers AI workflows |
| **iii-channels** | WebSocket binary streaming between workers | Unique feature, no docs at all |
| **iii-pubsub** | Topic-based message broadcasting, fan-out | `modules/module-pubsub.mdx` exists but no how-to guide |
| **iii-testing** | Unit tests, mocking the SDK, integration test setup | No testing docs anywhere |

---

## Non-iii-prefixed Skills (Pattern/Architecture)

These are higher-level composition patterns that combine multiple iii primitives. They don't map 1:1 to a how-to page but draw from several docs.

### agentic-backend

Multi-agent pipelines where specialized agents hand off work through queues and shared state. Supports agent collaboration, research/review/synthesis chains, and approval gates.

- **Related docs:** `modules/module-queue.mdx`, `modules/module-state.mdx`, `modules/module-pubsub.mdx`, `primitives-and-concepts/functions-triggers-workers.mdx`
- **Docs gap:** No guide on agent orchestration patterns or LLM integration

### reactive-backend

Event-driven real-time backends with state as the database layer, automatic state triggers firing side effects, and live updates via streams to clients.

- **Related docs:** `modules/module-state.mdx`, `modules/module-stream.mdx`, `modules/module-http.mdx`, `how-to/react-to-state-changes.mdx`
- **Docs gap:** No end-to-end guide showing the reactive pattern composed together

### workflow-orchestration

Durable multi-step workflow pipelines with sequential processing, retries, backoff, step tracking, scheduled cleanup, and dead-letter queue handling.

- **Related docs:** `modules/module-queue.mdx`, `modules/module-state.mdx`, `modules/module-cron.mdx`, `how-to/use-queues.mdx`, `how-to/dead-letter-queues.mdx`
- **Docs gap:** No guide on durable workflow patterns, saga compensation, or step tracking

### effect-system

Composable, pipeable function chains where each step is a pure function registered in iii, with distributed tracing and retry across the pipeline.

- **Related docs:** `primitives-and-concepts/functions-triggers-workers.mdx`, `advanced/telemetry.mdx`
- **Docs gap:** No guide on function composition as effect pipelines

### event-driven-cqrs

CQRS with event sourcing — commands publish domain events via pubsub, multiple read model projections subscribe independently to build query-optimized views.

- **Related docs:** `modules/module-pubsub.mdx`, `modules/module-state.mdx`, `modules/module-http.mdx`
- **Docs gap:** No guide on CQRS/event sourcing patterns

### http-invoked-functions

Registers external HTTP endpoints as iii functions so the engine calls them when triggered, combining with cron, state, and queue triggers.

- **Related docs:** `modules/module-http.mdx`, `how-to/expose-http-endpoint.mdx`, `modules/module-cron.mdx`
- **Docs gap:** No guide specifically on outbound HTTP invocation of external services

### low-code-automation

Simple trigger-transform-action chains where each node is a small registered function chained via named queues (Zapier/n8n style).

- **Related docs:** `modules/module-queue.mdx`, `modules/module-http.mdx`, `modules/module-cron.mdx`, `modules/module-pubsub.mdx`
- **Docs gap:** No guide on building automation chains or low-code patterns

---

## Docs Pages With No Matching Skill

These docs exist but have no dedicated skill covering them:

| Doc | Section | Topic |
|-----|---------|-------|
| `create-ephemeral-worker.mdx` | how-to | One-off workers that run a function once then shut down |
| `dead-letter-queues.mdx` | how-to | DLQ inspection and message redrive |
| `trigger-functions-from-cli.mdx` | how-to | `iii trigger` CLI command for invoking functions |
| `use-trigger-conditions.mdx` | how-to | Condition functions that gate trigger execution |
| `trigger-actions.mdx` | how-to | Invocation modes: synchronous, void, enqueue |
| `adapters.mdx` | advanced | Pluggable adapter backends (Redis, RabbitMQ, etc.) |
| `architecture.mdx` | advanced | System architecture overview |
| `custom-modules.mdx` | advanced | Developing custom iii modules |
| `protocol.mdx` | advanced | WebSocket JSON protocol for engine-worker communication |
| `module-bridge.mdx` | modules | Connecting iii instances over WebSocket |
| `module-exec.mdx` | modules | Shell command execution during startup |
| `discovery.mdx` | primitives | Live function registry and worker discovery |
| `quickstart.mdx` | root | Getting started setup |

---

## Summary

- **23 skills total** (16 iii-prefixed + 7 pattern skills)
- **8 skills** fully covered by docs — should auto-replace on build
- **4 skills** partially covered — docs exist but miss key patterns
- **4 iii-prefixed skills** have no matching docs (ai-agents, channels, pubsub, testing)
- **7 pattern skills** have no direct how-to match (they compose multiple primitives)
- **13 doc pages** have no dedicated skill
