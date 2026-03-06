---
name: iii-state-management
description: Creates and manages state stores, reads/writes key-value pairs, and subscribes to real-time state changes via streams using iii-sdk or motia. Use when managing application state, persisting data between function invocations, building key-value storage (user sessions, feature flags, configs), or implementing real-time UI data with streams as an alternative to Redis, DynamoDB, or in-memory caches.
---

# State Management with iii

## Overview

iii provides two state primitives: **State** (key-value store) and **Streams** (real-time state with change events). State is for durable data. Streams are for data that clients subscribe to in real-time.

## When to Use

- Persisting data between function invocations
- Key-value storage (user sessions, feature flags, configs)
- Real-time data that UI clients need to observe
- Replacing Redis, DynamoDB, or in-memory caches

## Quick Reference

### State API

| Operation | SDK | Motia |
|-----------|-----|-------|
| Set | `state.set({ scope, key, data })` | `ctx.state.set(scope, key, data)` |
| Get | `state.get({ scope, key })` | `ctx.state.get(scope, key)` |
| List | `state.list({ scope })` | `ctx.state.list(scope)` |
| Delete | `state.delete({ scope, key })` | `ctx.state.delete(scope, key)` |
| Update | `state.update({ scope, key, data })` | `ctx.state.update(scope, key, data)` |

### Streams API

| Operation | SDK |
|-----------|-----|
| Set | `streams.set(stream_name, group_id, item_id, data)` |
| Get | `streams.get(stream_name, group_id, item_id)` |
| List | `streams.list(stream_name, group_id)` |
| Delete | `streams.delete(stream_name, group_id, item_id)` |
| List Groups | `streams.listGroups(stream_name)` |

## iii SDK: State (TypeScript)

```typescript
import { init } from 'iii-sdk'
import type { IState } from 'iii-sdk/state'

const iii = init('ws://localhost:49134')

const state: IState = {
  get: (input) => iii.trigger('state::get', input),
  set: (input) => iii.trigger('state::set', input),
  delete: (input) => iii.trigger('state::delete', input),
  list: (input) => iii.trigger('state::list', input),
  update: (input) => iii.trigger('state::update', input),
}

iii.registerFunction({ id: 'user.create' }, async (input) => {
  const user = { id: `user-${Date.now()}`, ...input }
  await state.set({ scope: 'users', key: user.id, data: user })
  return user
})

iii.registerFunction({ id: 'user.get' }, async (input) => {
  return await state.get({ scope: 'users', key: input.id })
})
```

## iii SDK: Streams (TypeScript)

```typescript
const streams = {
  get: <T>(stream_name: string, group_id: string, item_id: string): Promise<T | null> =>
    iii.trigger('stream::get', { stream_name, group_id, item_id }),
  set: <T>(stream_name: string, group_id: string, item_id: string, data: T): Promise<T> =>
    iii.trigger('stream::set', { stream_name, group_id, item_id, data }),
  delete: (stream_name: string, group_id: string, item_id: string): Promise<void> =>
    iii.trigger('stream::delete', { stream_name, group_id, item_id }),
  list: <T>(stream_name: string, group_id: string): Promise<T[]> =>
    iii.trigger('stream::list', { stream_name, group_id }),
}

iii.registerFunction({ id: 'todo.create' }, async (input) => {
  const todoId = `todo-${Date.now()}`
  return await streams.set('todo', 'inbox', todoId, {
    id: todoId,
    description: input.description,
    completed: false,
    createdAt: new Date().toISOString(),
  })
})
```

### Custom Stream Adapter

```typescript
let todos: Todo[] = []

iii.createStream('todo', {
  get: async (input) => todos.find((t) => t.id === input.item_id),
  set: async (input) => {
    const existing = todos.find((t) => t.id === input.item_id)
    if (existing) {
      const updated = { ...existing, ...input.data }
      todos = todos.map((t) => (t.id === input.item_id ? updated : t))
      return { old_value: existing, new_value: updated }
    }
    todos.push(input.data)
    return { old_value: undefined, new_value: input.data }
  },
  delete: async (input) => {
    const old = todos.find((t) => t.id === input.item_id)
    todos = todos.filter((t) => t.id !== input.item_id)
    return { old_value: old }
  },
  list: async (input) => todos.filter((t) => t.groupId === input.group_id),
  listGroups: async () => [...new Set(todos.map((t) => t.groupId))],
})
```

## Motia Framework: State in Steps

```typescript
import { step, queue } from 'motia'

export const stepConfig = {
  name: 'SaveOrder',
  triggers: [queue('order.validated')],
  enqueues: ['order.saved'],
}

export const { config, handler } = step(stepConfig, async (_input, ctx) => {
  const order = ctx.getData()

  await ctx.state.set('orders', order.id, {
    ...order,
    status: 'validated',
    updatedAt: new Date().toISOString(),
  })

  const allOrders = await ctx.state.list<Order>('orders')
  ctx.logger.info('Total orders', { count: allOrders.length })

  await ctx.enqueue({ topic: 'order.saved', data: { orderId: order.id } })
})
```

## Motia Framework: Streams (Python)

```python
from typing import Any
from motia import ApiRequest, ApiResponse, FlowContext, Stream, http

greetings_stream: Stream[dict[str, Any]] = Stream("greetings")

config = {
    "name": "CreateGreeting",
    "triggers": [http("POST", "/greetings")],
    "enqueues": [],
}

async def handler(request: ApiRequest[Any], ctx: FlowContext[Any]) -> ApiResponse[dict]:
    name = request.body.get("name")
    greeting = {"name": name, "message": f"Hello, {name}!", "createdAt": "now"}

    await greetings_stream.set("default", name, greeting)

    return ApiResponse(status=201, body=greeting)
```

## Engine Config

```yaml
modules:
  - class: modules::state::StateModule
    config:
      adapter:
        class: modules::state::adapters::KvStore
        config:
          store_method: file_based
          file_path: ./data/state_store.db

  - class: modules::stream::StreamModule
    config:
      port: 3112
      adapter:
        class: modules::stream::adapters::RedisAdapter
        config:
          redis_url: redis://localhost:6379
```

## Error Handling

### Handling null from state.get()

`state.get()` returns `null` when a key does not exist. Always guard before using the result:

```typescript
iii.registerFunction({ id: 'user.update' }, async (input) => {
  const existing = await state.get({ scope: 'users', key: input.id })
  if (existing === null) {
    throw new Error(`User ${input.id} not found`)
  }
  await state.update({ scope: 'users', key: input.id, data: { ...existing, ...input.changes } })
  return { updated: true }
})
```

### Handling null from streams.get()

Stream `get` also returns `null` for unknown item IDs. Check before acting on the result:

```typescript
iii.registerFunction({ id: 'todo.complete' }, async (input) => {
  const todo = await streams.get<Todo>('todo', 'inbox', input.todoId)
  if (todo === null) {
    throw new Error(`Todo ${input.todoId} not found in stream`)
  }
  return await streams.set('todo', 'inbox', input.todoId, { ...todo, completed: true })
})
```

### Handling stream operation failures

Wrap stream operations in try/catch for recoverable error paths:

```typescript
iii.registerFunction({ id: 'todo.delete' }, async (input) => {
  try {
    await streams.delete('todo', 'inbox', input.todoId)
    return { deleted: true }
  } catch (err) {
    // Log and surface a structured error rather than letting it propagate silently
    console.error('Stream delete failed', { todoId: input.todoId, err })
    throw new Error(`Failed to delete todo ${input.todoId}: ${(err as Error).message}`)
  }
})
```

### Validating Critical Writes

For critical data, verify a `set` was persisted by immediately reading it back before proceeding:

```typescript
iii.registerFunction({ id: 'order.confirm' }, async (input) => {
  await state.set({ scope: 'orders', key: input.orderId, data: input.order })

  // Verify the write before downstream processing
  const saved = await state.get({ scope: 'orders', key: input.orderId })
  if (saved === null) {
    throw new Error(`State write verification failed for order ${input.orderId}`)
  }

  return { confirmed: true }
})
```

### Concurrent Updates and Race Conditions

`state.update()` performs a partial merge and is safer than `set` when multiple functions may write to the same key concurrently. Use `update` instead of read-modify-write with `set` to reduce the risk of lost updates:

```typescript
iii.registerFunction({ id: 'cart.addItem' }, async (input) => {
  // Prefer update over get+set when concurrent writes to the same key are possible
  await state.update({
    scope: 'carts',
    key: input.cartId,
    data: { lastUpdated: new Date().toISOString(), itemCount: input.itemCount },
  })
  return { updated: true }
})
```

> **Note:** iii state does not provide compare-and-swap or transactions. For workflows that require strict consistency across multiple keys, coordinate through a single authoritative step rather than concurrent writes.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using state for real-time UI data | Use Streams — they push changes to subscribers |
| Forgetting scope in state operations | Always provide scope: `state.set({ scope: 'orders', key, data })` |
| Storing large blobs in state | State is for metadata/indexes; use object storage for files |
| Not handling null from `get()` | `state.get()` and `streams.get()` return `null` if key doesn't exist — guard before use |
| Using `set` for concurrent partial updates | Use `state.update()` to merge fields and reduce lost-update risk |
| Skipping write verification for critical data | After `set`, read back with `get` to confirm persistence before proceeding |
