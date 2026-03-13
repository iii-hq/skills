---
name: agentic-backend
description: >-
  Reference implementation for multi-agent pipelines in iii. Use when building
  AI agent collaboration, research/review/synthesis chains, or any system where
  specialized agents hand off work through queues and shared state.
---

# Agentic Backend

Comparable to: LangGraph, CrewAI, AutoGen, Letta

## Key Concepts

- Each agent is a registered function with a single responsibility
- Agents communicate via **named queues** (ordered handoffs) and **shared state** (accumulated context)
- **Approval gates** are explicit checks in the producing agent before enqueuing the next step
- An HTTP trigger provides the entry point; agents chain from there
- **Pubsub** broadcasts completion events for downstream listeners

## Architecture

```
HTTP request
  → Enqueue(agent-tasks) → Agent 1 (researcher) → writes state
    → Enqueue(agent-tasks) → Agent 2 (critic) → reads/updates state
      → explicit approval check (is-approved?)
        → Enqueue(agent-tasks) → Agent 3 (synthesizer) → final state update
          → publish(research.complete)
```

## iii Primitives Used

| Primitive | Purpose |
|---|---|
| `registerWorker` | Initialize the worker and connect to iii |
| `registerFunction` | Define each agent |
| `trigger({ function_id: 'state::set/get/update', payload })` | Shared context between agents |
| `trigger({ ..., action: TriggerAction.Enqueue({ queue }) })` | Async handoff between agents via named queue |
| `trigger({ function_id, payload })` | Explicit condition check before enqueuing |
| `trigger({ function_id: 'publish', payload, action: TriggerAction.Void() })` | Broadcast completion to any listeners |
| `registerTrigger({ type: 'http' })` | Entry point |

## Reference Implementation

See [reference.js](reference.js) for the full working example — a multi-agent research pipeline
where a researcher gathers findings, a critic reviews them, and a synthesizer produces a final report.

## Minimum Patterns

Any code using this pattern must include at minimum:

- `registerWorker(url, { workerName })` — worker initialization
- `trigger({ function_id, payload, action: TriggerAction.Enqueue({ queue }) })` — async handoff between agents
- `trigger({ function_id: 'state::set/get/update', payload: { scope, key } })` — shared context between agents
- Explicit condition check via `await iii.trigger({ function_id: 'condition-fn', payload })` before enqueuing next agent
- `trigger({ function_id: 'publish', payload: { topic, data }, action: TriggerAction.Void() })` — completion broadcast
- Each agent as its own `registerFunction` with `agents::` prefix IDs
- `const { logger } = getContext()` — structured logging per agent

## Adapting This Pattern

- Replace simulated logic in each agent with real work (API calls, LLM inference, etc.)
- Add more agents by registering functions and enqueuing to them with `TriggerAction.Enqueue({ queue })`
- For approval gates, call a condition function explicitly before enqueuing the next agent
- Define queue configs (retries, concurrency) in `iii-config.yaml` under `queue_configs`
- State scope should be named for your domain (e.g. `research-tasks`, `support-tickets`)
- `functionId` segments should reflect your agent hierarchy (e.g. `agents::researcher`, `agents::critic`)
