---
name: iii-multi-trigger
description: Generates multi-trigger function handlers for iii/motia that respond to HTTP requests, queue messages, and cron schedules within a single step using ctx.match(). Use when a single function needs multiple event sources (webhook handlers, scheduled jobs, event-driven functions), conditional execution based on trigger type, or trigger-specific response handling — such as returning an HTTP body for API calls while queue and cron handlers return void.
---

# Multi-Trigger Steps with iii

## Overview

A single function can respond to multiple trigger types — HTTP requests, queue events, AND cron schedules. Use `ctx.match()` to handle each trigger type differently. One function, multiple entry points.

## When to Use

- Same logic triggered by API call, queue event, or schedule
- Different response formats per trigger type (HTTP returns body, queue returns void)
- Conditional triggers (only fire for high-value orders, verified users, business hours)

## Motia Framework Pattern (TypeScript)

```typescript
import type { ApiRequest, Handlers, StepConfig, TriggerCondition } from 'motia'
import { z } from 'zod'

const isHighValue: TriggerCondition<{ amount: number }> = (input) => {
  return (input as { amount: number }).amount > 1000
}

export const config = {
  name: 'ProcessOrder',
  description: 'Process orders via API, queue, or scheduled batch',
  flows: ['orders'],
  triggers: [
    {
      type: 'queue',
      topic: 'order.created',
      input: z.object({ amount: z.number(), description: z.string() }),
      condition: isHighValue,
    },
    {
      type: 'http',
      method: 'POST',
      path: '/orders/manual',
      bodySchema: z.object({
        user: z.object({ verified: z.boolean() }),
        amount: z.number(),
        description: z.string(),
      }),
      responseSchema: {
        200: z.object({ message: z.string(), orderId: z.string() }),
      },
    },
    { type: 'cron', expression: '* * * * *' },
  ],
  enqueues: ['order.processed'],
} as const satisfies StepConfig

export const handler: Handlers<typeof config> = async (_, ctx): Promise<any> => {
  const orderId = `order-${Date.now()}`

  return ctx.match({
    http: async ({ request }) => {
      const { amount, description } = request.body
      try {
        await ctx.state.set('orders', orderId, { id: orderId, amount, source: 'api' })
        await ctx.enqueue({ topic: 'order.processed', data: { orderId, amount, source: 'api' } })
      } catch (err) {
        ctx.logger.error('Failed to process HTTP order', { orderId, err })
        return { status: 500, body: { message: 'Order processing failed' } }
      }
      return { status: 200, body: { message: 'Order processed', orderId } }
    },

    queue: async (data) => {
      const { amount, description } = data
      try {
        await ctx.state.set('orders', orderId, { id: orderId, amount, source: 'queue' })
        await ctx.enqueue({ topic: 'order.processed', data: { orderId, amount, source: 'queue' } })
      } catch (err) {
        ctx.logger.error('Failed to process queue order', { orderId, err })
      }
    },

    cron: async () => {
      ctx.logger.info('Running scheduled order batch')
      const pending = await ctx.state.list<{ id: string; amount: number }>('pending-orders')
      for (const order of pending) {
        try {
          await ctx.enqueue({ topic: 'order.processed', data: { orderId: order.id, amount: order.amount, source: 'cron' } })
        } catch (err) {
          // Log and continue — don't let one failure abort the entire batch
          ctx.logger.error('Failed to enqueue order in batch', { orderId: order.id, err })
        }
      }
    },
  })
}
```

## Motia Framework Pattern (Python)

```python
from typing import Any
from motia import ApiRequest, ApiResponse, FlowContext, cron, http, queue

async def is_business_hours(input: Any, ctx: FlowContext[Any]) -> bool:
    from datetime import datetime
    now = datetime.now()
    return 9 <= now.hour < 17

config = {
    "name": "TripleTrigger",
    "description": "Handle events from queue, API, and cron",
    "triggers": [
        queue("orders.new"),
        http("POST", "/orders/manual", condition=is_business_hours),
        cron("0 0 * * * *"),
    ],
    "enqueues": ["orders.processed"],
}

async def handler(input_data: Any, ctx: FlowContext[Any]) -> Any:

    async def _queue_handler(data: Any) -> None:
        try:
            ctx.logger.info("Processing from queue", {"data": data})
        except Exception as err:
            ctx.logger.error("Queue handler failed", {"error": str(err)})

    async def _api_handler(request: ApiRequest[Any]) -> ApiResponse[Any]:
        try:
            ctx.logger.info("Processing from API")
            return ApiResponse(status=200, body={"message": "Order received"})
        except Exception as err:
            ctx.logger.error("API handler failed", {"error": str(err)})
            return ApiResponse(status=500, body={"message": "Processing failed"})

    async def _cron_handler() -> None:
        ctx.logger.info("Processing scheduled batch")

    return await ctx.match({
        "queue": _queue_handler,
        "http": _api_handler,
        "cron": _cron_handler,
    })
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Not using `ctx.match()` | Always dispatch by trigger type — input shapes differ |
| HTTP handler not returning response | HTTP match MUST return `{ status, body }` |
| Queue/cron handler returning HTTP response | Queue and cron handlers return void or data, NOT HTTP responses |
| Condition accessing wrong input shape | Check `ctx.trigger.type` before casting input |
| Unhandled errors in cron batch loops | Wrap each iteration in try/catch so one failure doesn't abort the batch |

---

## Reference: Trigger Conditions

Conditions filter when a trigger fires. Return `true` to proceed, `false` to skip.

```typescript
const isVerified: TriggerCondition<{ user: { verified: boolean } }> = (input, ctx) => {
  if (ctx.trigger.type !== 'http') return false
  return (input as ApiRequest<any>).body.user.verified === true
}
```

```python
async def is_verified(input: Any, ctx: FlowContext[Any]) -> bool:
    if ctx.trigger.type != "http":
        return False
    return input.body.get("user", {}).get("verified", False)
```

## Reference: Debugging — Identifying the Active Trigger

During development, log `ctx.trigger.type` at the top of the handler to confirm which trigger fired:

```typescript
export const handler: Handlers<typeof config> = async (_, ctx): Promise<any> => {
  ctx.logger.info('Trigger fired', { type: ctx.trigger.type })
  // ...
}
```

```python
async def handler(input_data: Any, ctx: FlowContext[Any]) -> Any:
    ctx.logger.info("Trigger fired", {"type": ctx.trigger.type})
    # ...
```

This is especially useful when a condition silently skips execution — confirm the trigger type and condition return value are both as expected.
