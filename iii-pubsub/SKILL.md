---
name: iii-pubsub
description: Creates topics, publishes messages, manages subscriptions, and handles message routing for pub/sub messaging with iii-sdk. Use when building pub/sub messaging, topic-based broadcasting, event-driven decoupling, or fan-out patterns — such as broadcasting events to multiple consumers, cache invalidation, real-time notifications, or replacing Redis Pub/Sub, NATS, or Kafka topics.
---

# Pub/Sub with iii

## Overview

iii's PubSub module provides topic-based message broadcasting. Publish to a topic, all subscribers receive the message. Unlike queues (where one consumer processes each message), pub/sub delivers to ALL subscribers. Use for event broadcasting, notifications, cache invalidation, and fan-out.

## When to Use

- Broadcasting events to multiple consumers
- Cache invalidation across workers
- Real-time notifications to multiple services
- Fan-out patterns (one event → many handlers)
- Decoupling services (publisher doesn't know subscribers)
- Replacing Redis Pub/Sub, NATS, or Kafka topics

## Pub/Sub vs Queue

| Feature | Pub/Sub | Queue |
|---------|---------|-------|
| Delivery | All subscribers | One consumer |
| Persistence | No (fire-and-forget) | Yes (until processed) |
| Use case | Broadcasting, notifications | Job processing, workflows |
| Trigger type | `subscribe` | `queue` |

## TypeScript: Publish and Subscribe

```typescript
import { init } from 'iii-sdk'

const iii = init('ws://localhost:49134')

iii.registerFunction({ id: 'cache.invalidate' }, async (event) => {
  const { logger } = getContext()
  logger.info('Cache invalidated', { key: event.key })
  await clearCache(event.key)
  return { invalidated: true }
})

iii.registerTrigger({
  type: 'subscribe',
  function_id: 'cache.invalidate',
  config: { topic: 'cache.changed' },
})

iii.registerFunction({ id: 'analytics.track' }, async (event) => {
  await trackEvent(event.type, event.data)
  return { tracked: true }
})

iii.registerTrigger({
  type: 'subscribe',
  function_id: 'analytics.track',
  config: { topic: 'cache.changed' },
})

// Subscribers must be registered before publishing — pub/sub has no replay
await iii.trigger('publish', {
  topic: 'cache.changed',
  data: { key: 'user:123', reason: 'profile_updated' },
})
```

## Setup Validation Workflow

Because pub/sub has no replay, verify that all subscribers are active before publishing production events. Use a probe publish to confirm end-to-end delivery during startup or integration tests:

```typescript
// 1. Register all subscribers first
iii.registerFunction({ id: 'probe.receiver' }, async (event) => {
  const { logger } = getContext()
  logger.info('Probe received — subscriber is live', { topic: event._probeTopic })
  return { alive: true }
})

iii.registerTrigger({
  type: 'subscribe',
  function_id: 'probe.receiver',
  config: { topic: 'system.probe' },
})

// 2. Publish a probe event to confirm the pipeline is wired up
try {
  await iii.trigger('publish', {
    topic: 'system.probe',
    data: { _probeTopic: 'system.probe', timestamp: Date.now() },
  })
  logger.info('Pub/sub pipeline verified — proceeding with production publishes')
} catch (err) {
  logger.error('Pub/sub probe failed — subscribers may not be registered', { error: err.message })
  throw err // halt startup until the pipeline is confirmed
}

// 3. Only publish real events after the probe succeeds
await iii.trigger('publish', {
  topic: 'cache.changed',
  data: { key: 'user:123', reason: 'profile_updated' },
})
```

**Checklist before publishing:**
- All `registerFunction` + `registerTrigger` calls for a topic have completed
- Engine config includes the correct adapter (LocalAdapter for single-instance, RedisAdapter for multi-instance)
- Probe publish succeeded without throwing

## Pattern: Event Fan-Out

```typescript
iii.registerFunction({ id: 'user.created.email' }, async (user) => {
  await sendWelcomeEmail(user.email)
})

iii.registerFunction({ id: 'user.created.analytics' }, async (user) => {
  await trackSignup(user.id)
})

iii.registerFunction({ id: 'user.created.onboarding' }, async (user) => {
  await createOnboardingFlow(user.id)
})

for (const fn of ['user.created.email', 'user.created.analytics', 'user.created.onboarding']) {
  iii.registerTrigger({
    type: 'subscribe',
    function_id: fn,
    config: { topic: 'user.created' },
  })
}

await iii.trigger('publish', {
  topic: 'user.created',
  data: { id: 'user-123', email: 'alice@example.com', name: 'Alice' },
})
```

## Pattern: Cross-Service Communication

```typescript
iii.registerFunction({ id: 'inventory.on-order' }, async (order) => {
  await decrementStock(order.itemId, order.quantity)
})

iii.registerTrigger({
  type: 'subscribe',
  function_id: 'inventory.on-order',
  config: { topic: 'order.placed' },
})

iii.registerFunction({ id: 'shipping.on-order' }, async (order) => {
  await createShipment(order.id, order.address)
})

iii.registerTrigger({
  type: 'subscribe',
  function_id: 'shipping.on-order',
  config: { topic: 'order.placed' },
})
```

## Error Handling

Subscriber errors are isolated — one failing handler does not prevent others from receiving the message. Wrap subscriber logic in try/catch and handle publish failures at the call site:

```typescript
// Subscriber with error handling
iii.registerFunction({ id: 'notifications.on-order' }, async (order) => {
  const { logger } = getContext()
  try {
    await sendNotification(order.userId, order.id)
    return { notified: true }
  } catch (err) {
    logger.error('Notification failed', { orderId: order.id, error: err.message })
    // Return a result rather than re-throwing to avoid poisoning the subscriber
    return { notified: false, error: err.message }
  }
})

// Publisher with error handling
try {
  await iii.trigger('publish', {
    topic: 'order.placed',
    data: { id: 'order-789', userId: 'user-123' },
  })
} catch (err) {
  // publish failure means the message was not delivered to any subscriber
  logger.error('Publish failed — no subscribers received the event', { topic: 'order.placed', error: err.message })
  // Fall back to direct invocation or enqueue for retry via a queue trigger
}
```

## Engine Config

```yaml
modules:
  - class: modules::pubsub::PubSubModule
    config:
      adapter:
        class: modules::pubsub::LocalAdapter

  # For multi-instance, use Redis:
  # adapter:
  #   class: modules::pubsub::RedisAdapter
  #   config:
  #     redis_url: redis://localhost:6379
```

## State Triggers (Reactive Pub/Sub)

State triggers are a special form of pub/sub — they fire when state changes:

```typescript
iii.registerFunction({ id: 'orders.on-update' }, async (event) => {
  const { key, new_value, old_value, event_type } = event
  console.log(`Order ${key} changed: ${event_type}`, { old_value, new_value })
})

iii.registerTrigger({
  type: 'state',
  function_id: 'orders.on-update',
  config: { scope: 'orders' },
})
```

### Conditional State Trigger

```typescript
const conditionFn = iii.registerFunction(
  { id: 'conditions.status-changed' },
  async (event) => event.event_type === 'updated' && event.key === 'status',
)

iii.registerTrigger({
  type: 'state',
  function_id: 'orders.on-status-change',
  config: {
    scope: 'orders',
    condition_function_id: conditionFn.id,
  },
})
```

## Python: Pub/Sub

```python
from iii import init, get_context

iii = init('ws://localhost:49134')

async def on_cache_change(event):
    ctx = get_context()
    ctx.logger.info('Cache changed', {'key': event.get('key')})

iii.register_function('cache.on_change', on_cache_change)
iii.register_trigger(
    type='subscribe',
    function_id='cache.on_change',
    config={'topic': 'cache.changed'},
)

await iii.trigger('publish', {
    'topic': 'cache.changed',
    'data': {'key': 'user:456', 'action': 'deleted'},
})
```

## Rust: Pub/Sub

```rust
use iii_sdk::{init, InitOptions, get_context};
use serde_json::json;

let iii = init("ws://127.0.0.1:49134", InitOptions::default())?;

iii.register_function("events.log", |event| async move {
    let ctx = get_context();
    ctx.logger.info("Event received", Some(event.clone()));
    Ok(json!({"logged": true}))
});

iii.register_trigger("subscribe", "events.log", json!({
    "topic": "system.events",
}))?;

iii.trigger("publish", json!({
    "topic": "system.events",
    "data": {"type": "deploy", "version": "1.2.0"},
})).await?;
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using pub/sub for job processing | Use `queue` trigger — pub/sub delivers to ALL subscribers |
| Expecting message persistence | Pub/sub is fire-and-forget — use queues for guaranteed delivery |
| LocalAdapter in multi-instance | Switch to RedisAdapter for pub/sub across multiple engine instances |
| Publishing before subscribers register | Subscribers must be registered before publish — no replay |
| Confusing `subscribe` with `queue` | `subscribe` = fan-out to all. `queue` = one consumer gets it |
| Letting subscriber errors propagate silently | Wrap handler logic in try/catch and log failures explicitly |
