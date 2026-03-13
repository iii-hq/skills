---
name: low-code-automation
description: >-
  Reference implementation for low-code automation workflows in iii. Use when
  building webhook integrations, trigger-transform-action chains, scheduled
  digests, or Zapier/n8n-style automations.
---

# Low-Code / No-Code Workflow Builders

Comparable to: n8n, Zapier, LangFlow

## Key Concepts

- Each "node" in the automation is a small registered function
- Nodes chain via **named queues**: webhook → enrich → store → notify
- Easy to add, remove, or reorder steps by changing enqueue targets
- **Cron triggers** drive scheduled automations (daily digests, periodic reports)
- **PubSub** for fan-out notifications to downstream systems

## Architecture

```
Automation 1: Form submission pipeline
  HTTP webhook
    → Enqueue(automation) → enrich-lead
      → Enqueue(automation) → store-lead
        → Enqueue(automation) → notify-team
          → publish(notifications.internal)

Automation 2: Scheduled digest
  Cron (8 AM daily) → daily-digest → publish(notifications.internal)
```

## iii Primitives Used

| Primitive | Purpose |
|---|---|
| `registerWorker` | Initialize the worker and connect to iii |
| `registerFunction` | Define each automation node |
| `registerTrigger({ type: 'http' })` | Webhook entry points |
| `trigger({ ..., action: TriggerAction.Enqueue({ queue }) })` | Chain nodes via named queue |
| `trigger({ ..., action: TriggerAction.Void() })` | Fire-and-forget publish |
| `trigger({ function_id: 'state::...', payload })` | Persist and query data |
| `registerTrigger({ type: 'cron' })` | Scheduled automations |

## Reference Implementation

See [reference.js](reference.js) for the full working example — a form-submission pipeline
(webhook → enrich → store → notify) and a scheduled daily digest.

## Adapting This Pattern

- Each node should do one thing: receive data, optionally transform it, pass it along
- Adding a step = register a function + update the previous node's enqueue target to the new function
- Removing a step = delete the function + update the previous node to enqueue the next function in the chain
- Define queue config (retries, concurrency) in `iii-config.yaml` under `queue_configs`
- Cron expressions use 7-position numeric format: `0 0 8 * * * *` (8 AM daily)
