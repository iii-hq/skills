---
name: iii-realtime-streaming
description: Creates WebSocket connections, implements SSE endpoints, builds streaming data pipelines, and wires up real-time browser clients using iii streams and motia stream-client. Use when building real-time features, WebSocket streaming, SSE endpoints, or live UI updates with iii streams or motia stream-client.
---

# Real-Time Streaming with iii

## Overview

iii provides real-time data through **Streams** — structured data with change events. Clients subscribe via WebSocket or SSE. No separate WebSocket server needed.

**Related skills:**
- `iii-pubsub` — topic-based broadcasting (pub/sub pattern)
- `iii-state` — durable key-value storage (State vs Streams: State = durable KV, Streams = real-time change events)

## When to Use

- Live dashboards, real-time UI updates
- Chat, notifications, activity feeds
- Server-Sent Events (SSE) endpoints
- Replacing Socket.io, Pusher, or Firebase Realtime Database

## Architecture

```
[Browser/Client] ←SSE/WS→ [Stream Module :3112] ←→ [iii Engine] ←→ [Redis Adapter]
                                                          ↑
                                                   [Functions write to streams]
```

## Contents

1. [Getting Started](#getting-started)
2. [Validation: Verifying Stream Connectivity](#validation-verifying-stream-connectivity)
3. [iii SDK: Stream Client](#iii-sdk-stream-client-typescript)
4. [iii SDK: SSE Endpoint](#iii-sdk-sse-endpoint)
5. [Motia Framework: Stream Steps](#motia-framework-stream-steps-typescript)
6. [Motia Framework: SSE Step](#motia-framework-sse-step-typescript)
7. [Browser Client (React)](#browser-client-react)
8. [Engine Config](#engine-config)
9. [Common Mistakes](#common-mistakes)

---

## Getting Started

1. **Configure the engine** — add `StreamModule` with a Redis adapter to your engine config (see [Engine Config](#engine-config))
2. **Create a stream step** — define a stream handler using `StreamConfig` or `iii.registerFunction`
3. **Test the connection** — subscribe from a client and confirm events are received (see [Validation](#validation-verifying-stream-connectivity))
4. **Verify events are flowing** — check logs and assert the event callback fires with expected `type` and `data`

---

## Validation: Verifying Stream Connectivity

Use a minimal test subscription to confirm the stream is live before wiring up production UI:

```typescript
import { StreamClient } from 'iii-sdk/stream'

const streamClient = new StreamClient('http://localhost:3112')

const unsub = streamClient.subscribe('todo', 'inbox', (event) => {
  console.log('✅ Stream connected — event received:', event.type, event.data)
  unsub() // unsubscribe after first event to confirm connectivity
})

// Trigger a write to the stream from another process, then check console output
```

---

## iii SDK: Stream Client (TypeScript)

```typescript
import { init } from 'iii-sdk'
import { StreamClient } from 'iii-sdk/stream'

const iii = init('ws://localhost:49134')

const streamClient = new StreamClient('http://localhost:3112')

streamClient.subscribe('todo', 'inbox', (event) => {
  console.log('Stream event:', event.type, event.data)
})
```

---

## iii SDK: SSE Endpoint

```typescript
iii.registerFunction({ id: 'api::get::events' }, async (req) => {
  return {
    status_code: 200,
    body: { stream: 'notifications', group: 'user-123' },
    headers: { 'Content-Type': 'text/event-stream' },
  }
})

iii.registerTrigger({
  type: 'http',
  function_id: 'api::get::events',
  config: { api_path: '/events', http_method: 'GET' },
})
```

---

## Motia Framework: Stream Steps (TypeScript)

```typescript
import type { StreamConfig } from 'motia'

export const config: StreamConfig = {
  name: 'TodoStream',
  stream: 'todo',
  flows: ['todo-app'],
}

export const handler = async (event: StreamEvent, { logger }) => {
  logger.info('Stream event', { type: event.type, itemId: event.item_id })
}
```

---

## Motia Framework: SSE Step (TypeScript)

```typescript
import type { Handlers, StepConfig } from 'motia'

export const config = {
  name: 'SSEEndpoint',
  description: 'Server-Sent Events endpoint',
  triggers: [{ type: 'http', method: 'GET', path: '/sse/updates' }],
  enqueues: [],
  flows: ['realtime'],
} as const satisfies StepConfig

export const handler: Handlers<typeof config> = async (request, { logger }) => {
  logger.info('SSE connection requested')

  return {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
    body: { connected: true, stream: 'updates' },
  }
}
```

---

## Browser Client (React)

```typescript
import { useStream } from 'motia/stream-client-react'

function TodoList() {
  const { data, loading } = useStream<Todo[]>('todo', 'inbox')

  if (loading) return <p>Loading...</p>

  return (
    <ul>
      {data?.map((todo) => (
        <li key={todo.id}>{todo.description}</li>
      ))}
    </ul>
  )
}
```

---

## Engine Config

> **Note:** The Redis adapter is required for multi-instance deployments. The local adapter does not share state across workers. See [Common Mistakes](#common-mistakes).

```yaml
modules:
  - class: modules::stream::StreamModule
    config:
      port: 3112
      host: 127.0.0.1
      adapter:
        class: modules::stream::adapters::RedisAdapter
        config:
          redis_url: redis://localhost:6379
```

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Polling instead of subscribing | Use StreamClient or SSE — iii pushes changes |
| Missing Redis adapter for multi-instance | Local adapter doesn't share across workers — use Redis |
| Not cleaning up subscriptions | Unsubscribe when component unmounts or connection closes |
| Confusing State and Streams | State = durable KV. Streams = real-time with change events |
