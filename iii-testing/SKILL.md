---
name: iii-testing
description: Generates test files, creates mock implementations, sets up test fixtures, and structures test suites for iii functions, triggers, workers, and Motia steps. Use when writing unit tests, integration tests, or mocking the SDK for iii functions, triggers, workers, or Motia steps — including setting up vitest mocks, writing test cases, and validating handler behavior.
---

# Testing iii Functions and Steps

## Overview

Test iii functions by mocking `init()` and verifying function handlers directly. Test Motia steps by importing the handler and config, then calling the handler with mock context.

## When to Use

- Writing unit tests for iii-sdk functions
- Testing Motia step handlers
- Mocking iii engine connections
- Integration testing workflows

## Test Setup Checklist

Before running tests, verify that mocks are correctly configured:

1. **Mock `iii-sdk`** — ensure `vi.mock('iii-sdk', ...)` is declared at the top of the test file, before any imports that depend on it.
2. **Provide all context methods** — `mockContext` must include `logger`, `state` (with `get`, `set`, `list`, `delete`), `enqueue`, `trigger`, `getData`, and `match`.
3. **Reset mocks between tests** — call `vi.clearAllMocks()` in `beforeEach` to prevent state leaking across tests.
4. **Verify mock calls** — after each `handler` invocation, assert that expected mocks were called with the right arguments using `expect(mock).toHaveBeenCalledWith(...)`.
5. **Use `mockResolvedValue` for async state methods** — `state.get`, `state.set`, and `state.list` are async; mock them with `vi.fn().mockResolvedValue(...)`.

```typescript
beforeEach(() => {
  vi.clearAllMocks()
})
```

## iii SDK: Mocking init()

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('iii-sdk', () => {
  const functions = new Map<string, Function>()
  const triggers: any[] = []

  return {
    init: vi.fn(() => ({
      registerFunction: vi.fn(({ id }, handler) => functions.set(id, handler)),
      registerTrigger: vi.fn((config) => triggers.push(config)),
      trigger: vi.fn(async (id, data) => {
        const fn = functions.get(id)
        if (!fn) throw new Error(`Function ${id} not registered`)
        return fn(data)
      }),
      triggerVoid: vi.fn((id, data) => {
        const fn = functions.get(id)
        fn?.(data)
      }),
      call: vi.fn(async (method, input) => {
        if (method === 'state::get') return null
        if (method === 'state::set') return input.data
        if (method === 'state::list') return []
        return null
      }),
    })),
    getContext: vi.fn(() => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })),
  }
})
```

## Testing a Function Handler

```typescript
import { init } from 'iii-sdk'

const iii = init('ws://localhost:49134')

iii.registerFunction({ id: 'orders.create' }, async (input) => {
  if (!input.item) return { status_code: 400, body: { error: 'item required' } }
  return { status_code: 201, body: { id: '123', item: input.item } }
})

describe('orders.create', () => {
  it('creates an order', async () => {
    const result = await iii.trigger('orders.create', { item: 'widget' })
    expect(result).toEqual({ status_code: 201, body: { id: '123', item: 'widget' } })
  })

  it('rejects missing item', async () => {
    const result = await iii.trigger('orders.create', {})
    expect(result.status_code).toBe(400)
  })
})
```

## Testing Motia Steps

```typescript
import { describe, it, expect, vi } from 'vitest'

const mockContext = {
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  traceId: 'test-trace-123',
  state: {
    get: vi.fn(),
    set: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
  },
  enqueue: vi.fn(),
  trigger: { type: 'queue' as const, topic: 'order.created' },
  getData: vi.fn().mockReturnValue({ orderId: '123', item: 'widget', quantity: 1 }),
  match: vi.fn(async (handlers: Record<string, Function>) => {
    const handler = handlers['queue']
    if (handler) return handler({ orderId: '123', item: 'widget' })
  }),
}

describe('ProcessOrder step', () => {
  it('processes order from queue', async () => {
    const { handler } = await import('./process-order.step')
    await handler({}, mockContext as any)

    // Verify state was updated with the expected order status
    expect(mockContext.state.set).toHaveBeenCalledWith(
      'orders', '123', expect.objectContaining({ status: 'processing' })
    )
    // Verify a notification was enqueued
    expect(mockContext.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'notification' })
    )
  })
})
```

## Testing Cron Handlers

```typescript
describe('OrderAudit cron', () => {
  it('detects overdue orders', async () => {
    mockContext.state.list.mockResolvedValue([
      { id: '1', complete: false, shipDate: '2020-01-01' },
      { id: '2', complete: true, shipDate: '2020-01-01' },
    ])

    const { handler } = await import('./order-audit.step')
    await handler({}, mockContext as any)

    // Only the incomplete overdue order should trigger a notification
    expect(mockContext.enqueue).toHaveBeenCalledTimes(1)
    expect(mockContext.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'notification' })
    )
  })
})
```

## Testing Multi-Trigger Steps

Override `trigger` and `match` on a per-test context to simulate each trigger type:

```typescript
describe('MultiTrigger step', () => {
  it('handles HTTP trigger', async () => {
    const httpContext = {
      ...mockContext,
      trigger: { type: 'http' as const, method: 'POST', path: '/orders' },
      match: vi.fn(async (handlers) => handlers.http({ request: { body: { amount: 100 } } })),
    }
    const { handler } = await import('./multi-trigger.step')
    const result = await handler({}, httpContext as any)
    expect(result).toEqual(expect.objectContaining({ status: 200 }))
  })

  it('handles cron trigger', async () => {
    const cronContext = {
      ...mockContext,
      trigger: { type: 'cron' as const },
      match: vi.fn(async (handlers) => handlers.cron()),
    }
    const { handler } = await import('./multi-trigger.step')
    await handler({}, cronContext as any)
    expect(cronContext.match).toHaveBeenCalled()
  })
})
```

## Integration Testing

Connect to a real or test engine instance; skip SDK mocking:

```typescript
import { init } from 'iii-sdk'

describe('Integration: Order Workflow', () => {
  const iii = init(process.env.III_TEST_URL ?? 'ws://localhost:49134')

  it('processes full order flow', async () => {
    const result = await iii.trigger('order.validate', {
      orderId: 'test-1',
      items: ['widget'],
      total: 29.99,
    })
    expect(result).toEqual(expect.objectContaining({ validated: true }))
  })
})
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Testing against live engine | Mock `init()` for unit tests, use test engine for integration |
| Not mocking `state` and `enqueue` | Always provide mock implementations for context methods |
| Forgetting to test error paths | Test invalid input, missing data, and handler exceptions |
| Testing trigger config instead of handler | Config is declarative — focus tests on handler behavior |
