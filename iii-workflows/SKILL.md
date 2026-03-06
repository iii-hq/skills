---
name: iii-workflows
description: Creates, configures, and debugs multi-step workflows using iii-sdk and motia, including defining step handlers, managing state transitions, configuring event routing, and handling error recovery and saga compensation. Use when building multi-step workflows, event chains, pipelines, sagas, or orchestrated processes with iii-sdk or motia — such as order processing pipelines, fan-out event architectures, or replacing Temporal, Step Functions, or Inngest.
---

# Multi-Step Workflows with iii

## Overview

iii workflows are chains of Functions connected by queue topics. Each step processes data and enqueues the next step. No workflow engine needed — the queue IS the workflow engine.

## When to Use

- Multi-step processing pipelines (order → payment → fulfillment → notification)
- Event-driven architectures with fan-out
- Saga patterns (compensating transactions)
- Replacing Temporal, Step Functions, or Inngest

## Pattern: Event Chain

```
[HTTP Trigger] → [Step 1] --enqueue-→ [Step 2] --enqueue-→ [Step 3]
                              ↓                      ↓
                         [State Store]          [Notification]
```

## iii SDK Pattern (TypeScript)

```typescript
import { init } from 'iii-sdk'

const iii = init('ws://localhost:49134')

iii.registerFunction({ id: 'order.validate' }, async (input) => {
  if (!input.items?.length) throw new Error('No items')
  iii.triggerVoid('order.charge', { orderId: input.orderId, total: input.total })
  return { validated: true }
})

iii.registerFunction({ id: 'order.charge' }, async (input) => {
  const payment = await chargeCard(input.total)
  if (payment.success) {
    iii.triggerVoid('order.fulfill', { orderId: input.orderId, paymentId: payment.id })
  } else {
    iii.triggerVoid('order.failed', { orderId: input.orderId, reason: payment.error })
  }
  return payment
})

iii.registerFunction({ id: 'order.fulfill' }, async (input) => {
  await shipOrder(input.orderId)
  iii.triggerVoid('notification.send', {
    to: 'customer@example.com',
    template: 'order-shipped',
    data: { orderId: input.orderId },
  })
  return { shipped: true }
})

for (const fn of ['order.validate', 'order.charge', 'order.fulfill', 'order.failed', 'notification.send']) {
  iii.registerTrigger({ type: 'queue', function_id: fn, config: { topic: fn } })
}
```

## Motia Framework Pattern (TypeScript)

### Step 1: API Entry Point

```typescript
import type { Handlers, StepConfig } from 'motia'
import { z } from 'zod'

export const config = {
  name: 'ReceiveOrder',
  description: 'API entry point for order workflow',
  flows: ['order-workflow'],
  triggers: [{
    type: 'http', method: 'POST', path: '/orders',
    bodySchema: z.object({ items: z.array(z.string()), customerId: z.string() }),
  }],
  enqueues: ['order.validate'],
} as const satisfies StepConfig

export const handler: Handlers<typeof config> = async (request, { logger, enqueue }) => {
  const orderId = `order-${Date.now()}`
  logger.info('Order received', { orderId })

  await enqueue({
    topic: 'order.validate',
    data: { orderId, ...request.body },
  })

  return { status: 202, body: { orderId, status: 'processing' } }
}
```

### Step 2: Validation

```typescript
import { step, queue } from 'motia'
import { z } from 'zod'

export const stepConfig = {
  name: 'ValidateOrder',
  description: 'Validate order items and customer',
  flows: ['order-workflow'],
  triggers: [queue('order.validate', {
    input: z.object({ orderId: z.string(), items: z.array(z.string()), customerId: z.string() }),
  })],
  enqueues: ['order.charge', 'order.failed'],
}

export const { config, handler } = step(stepConfig, async (_input, ctx) => {
  const data = ctx.getData()
  ctx.logger.info('Validating order', { orderId: data.orderId })

  const customer = await lookupCustomer(data.customerId)
  if (!customer) {
    await ctx.enqueue({ topic: 'order.failed', data: { orderId: data.orderId, reason: 'unknown customer' } })
    return
  }

  // Persist validated state before enqueuing next step — if charge step fails,
  // the stored 'validated' status enables targeted retry or compensation.
  await ctx.state.set('orders', data.orderId, { ...data, status: 'validated' })

  // Verify state was persisted before proceeding
  const saved = await ctx.state.get('orders', data.orderId)
  if (!saved || saved.status !== 'validated') {
    throw new Error(`State persistence failed for order ${data.orderId}`)
  }

  await ctx.enqueue({ topic: 'order.charge', data: { orderId: data.orderId, total: calculateTotal(data.items) } })
})
```

### Step 3: Charge & Notify

```typescript
import { step, queue } from 'motia'
import { z } from 'zod'

export const stepConfig = {
  name: 'ChargeOrder',
  flows: ['order-workflow'],
  triggers: [queue('order.charge', { input: z.object({ orderId: z.string(), total: z.number() }) })],
  enqueues: ['notification', 'order.failed'],
}

export const { config, handler } = step(stepConfig, async (_input, ctx) => {
  const { orderId, total } = ctx.getData()

  // Guard: confirm validation succeeded before charging — prevents charging
  // if a prior step partially failed and the message was redelivered.
  const orderState = await ctx.state.get('orders', orderId)
  if (!orderState || orderState.status !== 'validated') {
    ctx.logger.error('Charge attempted on unvalidated order — aborting', { orderId })
    await ctx.enqueue({ topic: 'order.failed', data: { orderId, reason: 'invalid state transition' } })
    return
  }

  let payment
  try {
    payment = await chargeCard(total)
  } catch (e) {
    // Payment failed after validation succeeded — compensate by marking order failed.
    // The 'validated' state record remains for auditing; update status for saga recovery.
    await ctx.state.set('orders', orderId, { ...orderState, status: 'charge-failed', error: String(e) })
    await ctx.enqueue({ topic: 'order.failed', data: { orderId, reason: String(e) } })
    return
  }

  await ctx.state.set('orders', orderId, { status: 'charged', paymentId: payment.id })

  await ctx.enqueue({
    topic: 'notification',
    data: { email: 'customer@example.com', templateId: 'order-charged', templateData: { orderId, total } },
  })
})
```

## Motia Framework Pattern (Python)

```python
from typing import Any
from motia import FlowContext, queue

config = {
    "name": "ProcessPayment",
    "description": "Charge payment for validated order",
    "triggers": [queue("order.charge")],
    "enqueues": ["order.fulfill", "order.failed"],
}

async def handler(input_data: Any, ctx: FlowContext[Any]) -> None:
    order_id = input_data["orderId"]
    total = input_data["total"]

    ctx.logger.info("Charging order", {"order_id": order_id, "total": total})

    try:
        payment = await charge_card(total)
        await ctx.state.set("orders", order_id, {"status": "paid", "payment_id": payment["id"]})
        await ctx.enqueue({"topic": "order.fulfill", "data": {"orderId": order_id}})
    except Exception as e:
        await ctx.enqueue({"topic": "order.failed", "data": {"orderId": order_id, "reason": str(e)}})
```

## Parallel Fan-Out Pattern

```typescript
export const stepConfig = {
  name: 'StartParallelMerge',
  triggers: [queue('pipeline.start')],
  enqueues: ['pipeline.step-a', 'pipeline.step-b', 'pipeline.step-c'],
}

export const { config, handler } = step(stepConfig, async (_input, ctx) => {
  const data = ctx.getData()

  await Promise.all([
    ctx.enqueue({ topic: 'pipeline.step-a', data }),
    ctx.enqueue({ topic: 'pipeline.step-b', data }),
    ctx.enqueue({ topic: 'pipeline.step-c', data }),
  ])
})
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Circular enqueue (A→B→A) | Design DAGs — use state to break cycles |
| Not persisting state between steps | Use `ctx.state.set()` — queue data is transient |
| Missing `enqueues` declaration | Motia requires declaring all topics you publish to |
| Synchronous chain via `trigger()` | Use `triggerVoid()` / `enqueue()` for true async |
| Charging/acting without confirming prior step state | Read state at step start to verify expected status before proceeding |
| No compensation on mid-workflow failure | Update state to a failure status and enqueue a `*.failed` topic for saga recovery |
