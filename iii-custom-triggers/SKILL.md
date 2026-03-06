---
name: iii-custom-triggers
description: Creates and configures custom trigger types, registers webhook endpoints, and implements external event source handlers in iii (a function execution engine). Use when building custom trigger types, webhook triggers, event listeners, callbacks, automation triggers, or event-driven integrations; when connecting external event sources like Stripe, GitHub, file watchers, IoT devices, or database change streams; or when extending iii with new trigger mechanisms not covered by built-in types.
---

# Custom Trigger Types in iii

## Overview

iii's built-in trigger types (HTTP, queue, cron, state, stream) cover most use cases. But you can register **custom trigger types** for anything else: webhooks, file watchers, IoT events, database change streams, or third-party integrations. A custom trigger type has a `register` and `unregister` handler that the engine calls when functions bind to your trigger.

## When to Use

- Integrating external event sources (webhooks, Stripe, GitHub events)
- File system watchers
- Database change data capture (CDC)
- IoT device events
- Custom polling or long-polling mechanisms
- Any event source not covered by built-in triggers

## TypeScript: Register a Custom Trigger Type

```typescript
import { init } from 'iii-sdk'

const iii = init('ws://localhost:49134')

interface WebhookConfig {
  url: string
  events: string[]
  secret?: string
}

iii.registerTriggerType<WebhookConfig>(
  { id: 'webhook', description: 'External webhook trigger' },
  {
    async registerTrigger(config) {
      const { function_id, config: triggerConfig } = config

      await registerWebhookEndpoint({
        url: triggerConfig.url,
        events: triggerConfig.events,
        callback: async (event) => {
          await iii.trigger(function_id, event)
        },
      })
    },

    async unregisterTrigger(config) {
      await removeWebhookEndpoint(config.config.url)
    },
  }
)

iii.registerFunction({ id: 'stripe.payment' }, async (event) => {
  const { type, data } = event
  if (type === 'payment_intent.succeeded') {
    return { processed: true, amount: data.amount }
  }
  return { skipped: true }
})

iii.registerTrigger({
  type: 'webhook',
  function_id: 'stripe.payment',
  config: {
    url: 'https://api.stripe.com/webhooks',
    events: ['payment_intent.succeeded', 'payment_intent.failed'],
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  },
})
```

## TypeScript: File Watcher Trigger

```typescript
import { watch } from 'node:fs'

iii.registerTriggerType(
  { id: 'file-watch', description: 'Watch filesystem for changes' },
  {
    watchers: new Map(),

    async registerTrigger(config) {
      const { function_id, config: { path, events } } = config

      const watcher = watch(path, { recursive: true }, (eventType, filename) => {
        if (!events || events.includes(eventType)) {
          iii.triggerVoid(function_id, { eventType, filename, path })
        }
      })

      this.watchers.set(function_id, watcher)
    },

    async unregisterTrigger(config) {
      const watcher = this.watchers.get(config.function_id)
      watcher?.close()
      this.watchers.delete(config.function_id)
    },
  }
)

iii.registerFunction({ id: 'files.on-change' }, async (event) => {
  const { logger } = getContext()
  logger.info('File changed', event)
  return { handled: true }
})

iii.registerTrigger({
  type: 'file-watch',
  function_id: 'files.on-change',
  config: { path: './uploads', events: ['change', 'rename'] },
})
```

## TypeScript: Polling Trigger

```typescript
iii.registerTriggerType(
  { id: 'poll', description: 'Poll an endpoint at intervals' },
  {
    intervals: new Map(),

    async registerTrigger(config) {
      const { function_id, config: { url, intervalMs, headers } } = config

      let lastEtag: string | null = null

      const timer = setInterval(async () => {
        try {
          const res = await fetch(url, {
            headers: { ...headers, ...(lastEtag ? { 'If-None-Match': lastEtag } : {}) },
          })

          if (res.status === 200) {
            lastEtag = res.headers.get('etag')
            const data = await res.json()
            iii.triggerVoid(function_id, data)
          }
        } catch (err) {
          console.error('Poll error:', err)
        }
      }, intervalMs)

      this.intervals.set(function_id, timer)
    },

    async unregisterTrigger(config) {
      const timer = this.intervals.get(config.function_id)
      if (timer) clearInterval(timer)
      this.intervals.delete(config.function_id)
    },
  }
)
```

## Python: Custom Trigger Type

```python
from iii import III, init, InitOptions

iii_client = init('ws://localhost:49134')

class WebhookTriggerHandler:
    def __init__(self):
        self._endpoints = {}

    async def register_trigger(self, config):
        function_id = config["function_id"]
        trigger_config = config["config"]

        async def on_event(event):
            await iii_client.trigger(function_id, event)

        self._endpoints[function_id] = {
            "url": trigger_config["url"],
            "callback": on_event,
        }

    async def unregister_trigger(self, config):
        self._endpoints.pop(config["function_id"], None)

iii_client.register_trigger_type("webhook", WebhookTriggerHandler())
```

## Rust: Custom Trigger Type

```rust
use iii_sdk::{III, TriggerHandler, TriggerConfig, IIIError, init, InitOptions};
use async_trait::async_trait;
use serde_json::json;

struct WebhookHandler {
    iii: III,
}

#[async_trait]
impl TriggerHandler for WebhookHandler {
    async fn register_trigger(&self, config: TriggerConfig) -> Result<(), IIIError> {
        let url = config.config["url"].as_str().unwrap_or_default();
        println!("Registered webhook for: {}", url);
        Ok(())
    }

    async fn unregister_trigger(&self, config: TriggerConfig) -> Result<(), IIIError> {
        println!("Unregistered webhook for function: {}", config.function_id);
        Ok(())
    }
}

let iii = init("ws://127.0.0.1:49134", InitOptions::default())?;

iii.register_trigger_type("webhook", WebhookHandler { iii: iii.clone() });
```

## Unregistering Trigger Types

```typescript
iii.unregisterTriggerType('webhook')
```

```python
iii_client.unregister_trigger_type('webhook')
```

## TriggerConfig Shape

```typescript
interface TriggerConfig {
  id: string
  function_id: string
  config: Record<string, any>
}
```

The `config` field is whatever you define for your trigger type. The engine passes it through unchanged.

## Validating and Testing Custom Triggers

After registration, verify your custom trigger is working correctly:

**1. Manually fire a test event using `iii.trigger()`** to confirm the function receives and processes it before wiring up the real event source:

```typescript
// Fire a synthetic event directly — no real webhook needed
const result = await iii.trigger('stripe.payment', {
  type: 'payment_intent.succeeded',
  data: { amount: 1000 },
})
console.log(result) // { processed: true, amount: 1000 }
```

**2. Confirm cleanup by unregistering and re-registering** — if `unregisterTrigger` leaks resources (open watchers, live timers), the re-registration will reveal duplicate callbacks or errors:

```typescript
iii.unregisterTriggerType('webhook')
// Re-register and trigger again to confirm no ghost handlers remain
iii.registerTriggerType(/* ... */)
```

**3. Test error paths** — wrap `iii.trigger()` calls in try/catch inside your handler and assert the function still returns a result even when upstream event delivery fails (e.g., simulate a fetch error in the polling trigger).

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Not cleaning up in `unregisterTrigger` | Always close watchers, timers, connections |
| Blocking the register handler | Keep registration fast — defer heavy setup to async |
| Not handling errors in trigger callbacks | Wrap `iii.trigger()` calls in try/catch |
| Using built-in type names | Don't name custom types `http`, `cron`, `queue`, `state`, `stream` |
