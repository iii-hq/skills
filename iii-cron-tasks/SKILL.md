---
name: iii-cron-tasks
description: "Defines, configures, and manages cron job schedules using iii-sdk or the Motia framework — including setting cron expressions, registering triggers, handling job failures, and verifying execution. iii-sdk and Motia are alternative runtimes: iii-sdk uses a direct WebSocket API while Motia uses a file-based step config. Use when scheduling periodic tasks, cron jobs, recurring jobs, or timed automation; replacing node-cron, APScheduler, or system crontab; or setting up batch processing, health checks, cleanup routines, or audit jobs that run on a fixed interval."
---

# Cron Tasks with iii

## Overview

iii replaces standalone cron schedulers (node-cron, APScheduler, crontab) with a **Cron Trigger** bound to a Function. Define the schedule as a cron expression, the engine fires your function on time.

## When to Use

- Scheduled tasks (cleanup, reports, health checks)
- Replacing node-cron, APScheduler, or system crontab
- Periodic data syncs or batch processing
- Audit jobs that check state on intervals

## Cron Expression Format

```
┌───────── second (0-59)        [iii uses 7-field]
│ ┌─────── minute (0-59)
│ │ ┌───── hour (0-23)
│ │ │ ┌─── day of month (1-31)
│ │ │ │ ┌─ month (1-12)
│ │ │ │ │ ┌ day of week (0-7)
│ │ │ │ │ │ ┌ year (optional)
* * * * * * *
```

| Schedule | Expression |
|----------|-----------|
| Every minute | `* * * * *` |
| Every 5 minutes | `0 0/5 * * * * *` |
| Every hour | `0 0 * * * *` |
| Daily at midnight | `0 0 0 * * *` |
| Every Monday 9am | `0 0 9 * * 1` |
| Every second | `* 1 * * * * *` |

## iii SDK Pattern (TypeScript)

```typescript
import { init } from 'iii-sdk'

const iii = init('ws://localhost:49134')

iii.registerFunction({ id: 'cleanup.expired-sessions' }, async () => {
  const deleted = await deleteExpiredSessions()
  return { deleted, timestamp: new Date().toISOString() }
})

iii.registerTrigger({
  type: 'cron',
  function_id: 'cleanup.expired-sessions',
  config: { expression: '0 0 * * * *' },
})
```

## Motia Framework Pattern (TypeScript)

```typescript
import type { Handlers, StepConfig } from 'motia'
import type { Order } from './types'

export const config = {
  name: 'OrderAuditJob',
  description: 'Check for overdue orders every 5 minutes',
  triggers: [{ type: 'cron', expression: '0 0/5 * * * * *' }],
  enqueues: ['notification'],
  flows: ['order-management'],
} as const satisfies StepConfig

export const handler: Handlers<typeof config> = async (_input, { logger, state, enqueue }) => {
  const orders = await state.list<Order>('orders')

  for (const order of orders) {
    if (!order.complete && new Date() > new Date(order.shipDate)) {
      logger.warn('Overdue order detected', { orderId: order.id })

      await enqueue({
        topic: 'notification',
        data: {
          email: 'ops@example.com',
          templateId: 'overdue-order',
          templateData: { orderId: order.id, shipDate: order.shipDate },
        },
      })
    }
  }
}
```

## Motia Framework Pattern (Python)

```python
from typing import Any
from motia import FlowContext, cron

config = {
    "name": "DailyReport",
    "description": "Generate daily report at midnight",
    "triggers": [cron("0 0 0 * * *")],
    "enqueues": ["report.generated"],
}

async def handler(input_data: Any, ctx: FlowContext[Any]) -> None:
    ctx.logger.info("Generating daily report")

    report = await generate_report()
    await ctx.enqueue({
        "topic": "report.generated",
        "data": {"report_id": report["id"], "date": report["date"]},
    })
```

## Engine Config (config.yaml)

```yaml
modules:
  - class: modules::cron::CronModule
    config:
      adapter:
        class: modules::cron::KvCronAdapter
```

## Verifying Registration and Monitoring Execution

**Confirm the cron is registered** by checking startup logs for a line referencing the trigger ID and expression, e.g.:

```
[cron] Registered trigger cleanup.expired-sessions → 0 0 * * * *
```

**Confirm the handler fires** by adding a log line at the top of every cron handler and watching for it at the expected wall-clock time:

```typescript
// iii SDK
iii.registerFunction({ id: 'cleanup.expired-sessions' }, async () => {
  console.log('[cron] cleanup.expired-sessions fired at', new Date().toISOString())
  // ...
})
```

```python
# Motia Python
async def handler(input_data: Any, ctx: FlowContext[Any]) -> None:
    ctx.logger.info("DailyReport cron fired", extra={"ts": __import__("datetime").datetime.utcnow().isoformat()})
```

**Detect missed or failed runs** by wrapping handler logic in try/catch (TypeScript) or try/except (Python) and enqueuing or logging failures explicitly — the cron engine will not retry a failed invocation by default:

```typescript
iii.registerFunction({ id: 'cleanup.expired-sessions' }, async () => {
  try {
    const deleted = await deleteExpiredSessions()
    return { deleted, timestamp: new Date().toISOString() }
  } catch (err) {
    console.error('[cron] cleanup.expired-sessions failed', err)
    // enqueue to a dead-letter topic or alert channel as needed
  }
})
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using 5-field cron (missing seconds) | iii supports 7-field: `second minute hour day month weekday year` |
| Cron handler that takes too long | Keep cron handlers fast; enqueue heavy work to a queue topic |
| No error handling in cron | Cron fires regardless of previous run — handle errors gracefully |
| Running at `* * * * * * *` (every second) | Usually too frequent — use `0 0/5 * * * * *` for 5-min intervals |
