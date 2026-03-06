---
name: iii-background-jobs
description: Creates job handlers, configures queue workers, chains async pipelines, and implements fire-and-forget task execution using iii-sdk or motia. Use when building background jobs, async task processing, job queues, worker files, queue configurations, or event-driven workers — including replacing BullMQ, Celery, Sidekiq, or SQS with iii-sdk or motia.
---

# Background Jobs with iii

## Overview

iii replaces BullMQ, Celery, and SQS with a single primitive: a **Function** triggered by a **Queue topic**. Register a function, bind a queue trigger, enqueue work. The engine handles retries, ordering, and delivery.

## When to Use

- Processing tasks asynchronously (emails, image processing, data pipelines)
- Replacing BullMQ, Celery, Sidekiq, or SQS
- Event-driven architectures (order.created → process → notify)
- Fire-and-forget operations

## Quick Reference

| Operation | iii SDK | Motia |
|-----------|--------|-------|
| Define job handler | `registerFunction({ id }, handler)` | `config.triggers = [queue('topic')]` |
| Bind to queue | `registerTrigger({ type: 'queue', config: { topic } })` | `queue('topic', { input: schema })` |
| Enqueue work | `iii.trigger('fn-id', data)` | `ctx.enqueue({ topic, data })` |
| Fire-and-forget | `iii.triggerVoid('fn-id', data)` | Same `enqueue` (always async) |

## iii SDK Pattern (TypeScript)

```typescript
import { init } from 'iii-sdk'

const iii = init('ws://localhost:49134')

iii.registerFunction({ id: 'email.send' }, async (input) => {
  const { to, subject, body } = input

  await sendEmail(to, subject, body)

  return { sent: true, to }
})

iii.registerTrigger({
  type: 'queue',
  function_id: 'email.send',
  config: { topic: 'email.send' },
})

iii.triggerVoid('email.send', {
  to: 'user@example.com',
  subject: 'Welcome!',
  body: 'Thanks for signing up.',
})
```

### Chaining Jobs (Pipeline)

```typescript
iii.registerFunction({ id: 'image.resize' }, async (input) => {
  const resized = await resize(input.url, input.width)
  iii.triggerVoid('image.optimize', { url: resized.url })
  return resized
})

iii.registerFunction({ id: 'image.optimize' }, async (input) => {
  const optimized = await optimize(input.url)
  iii.triggerVoid('image.upload', { url: optimized.url })
  return optimized
})

iii.registerFunction({ id: 'image.upload' }, async (input) => {
  return await uploadToS3(input.url)
})

for (const fn of ['image.resize', 'image.optimize', 'image.upload']) {
  iii.registerTrigger({ type: 'queue', function_id: fn, config: { topic: fn } })
}
```

## Motia Framework Pattern (TypeScript)

```typescript
import { step, queue } from 'motia'
import { z } from 'zod'

const orderSchema = z.object({
  email: z.string(),
  quantity: z.number(),
  petId: z.string(),
})

export const stepConfig = {
  name: 'ProcessOrder',
  description: 'Process incoming orders from the queue',
  flows: ['order-processing'],
  triggers: [queue('order.created', { input: orderSchema })],
  enqueues: ['notification'],
}

export const { config, handler } = step(stepConfig, async (_input, ctx) => {
  const data = ctx.getData()

  ctx.logger.info('Processing order', { email: data.email, quantity: data.quantity })

  const order = await createOrder(data)
  await ctx.state.set('orders', order.id, order)

  await ctx.enqueue({
    topic: 'notification',
    data: {
      email: data.email,
      templateId: 'order-confirmation',
      templateData: { orderId: order.id, status: order.status },
    },
  })
})
```

## Motia Framework Pattern (Python)

```python
from typing import Any
from motia import FlowContext, queue

config = {
    "name": "ProcessPayment",
    "description": "Process payment from queue",
    "triggers": [queue("payment.pending")],
    "enqueues": ["payment.completed", "payment.failed"],
}

async def handler(input_data: Any, ctx: FlowContext[Any]) -> None:
    ctx.logger.info("Processing payment", {"amount": input_data.get("amount")})

    try:
        result = await charge_card(input_data["card_token"], input_data["amount"])
        await ctx.enqueue({
            "topic": "payment.completed",
            "data": {"payment_id": result["id"], "amount": input_data["amount"]},
        })
    except Exception as e:
        await ctx.enqueue({
            "topic": "payment.failed",
            "data": {"error": str(e), "amount": input_data["amount"]},
        })
```

## Engine Config (config.yaml)

```yaml
modules:
  - class: modules::event::EventModule
    config:
      adapter:
        class: modules::event::RedisAdapter
        config:
          redis_url: redis://localhost:6379
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `trigger()` when you don't need the result | Use `triggerVoid()` for fire-and-forget (SDK) |
| Not declaring `enqueues` in Motia config | Always list topics you enqueue to in `enqueues: [...]` |
| Blocking the handler with long sync work | Keep handlers async, offload to next queue step |
| Missing queue trigger binding | Every function needs both `registerFunction` AND `registerTrigger` |
