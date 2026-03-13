---
name: iii-language-adaptation
description: >-
  SDK surface differences between Node.js, Python, and Rust. Read this skill when
  adapting a Node.js iii reference implementation to Python or Rust, or when the
  user's target language differs from the reference code.
---

# iii Language Adaptation Guide

The design pattern skills contain Node.js reference implementations. Use this guide to translate
them idiomatically to Python or Rust (or future SDK languages).

Full SDK references:
- Node: https://iii.dev/docs/api-reference/sdk-node
- Python: https://iii.dev/docs/api-reference/sdk-python
- Rust: https://iii.dev/docs/api-reference/sdk-rust

## Initialization

| | Node | Python | Rust |
|---|---|---|---|
| Import | `import { registerWorker, getContext, TriggerAction } from 'iii-sdk'` | `from iii import III, InitOptions, TriggerAction, Logger` | `use iii_sdk::{III, TriggerAction, TriggerRequest, Logger};` |
| Connect | `const iii = registerWorker(url, { workerName: 'x' })` | `iii = III(url, InitOptions(worker_name='x'))` then `iii.connect()` | `let iii = III::new(&url);` |
| Alt connect | — | `from iii import register_worker` then `iii = register_worker(url, InitOptions(worker_name='x'))` | — |

## Function Registration

```javascript
// Node
iii.registerFunction({ id: 'ns::action' }, async (data) => {
  return { result: true }
})
```

```python
# Python — positional string ID, regular def (sync)
def handler(data):
    return {'result': True}

iii.register_function('ns::action', handler)
```

```rust
// Rust — string ID, closure returning a future
let iii_clone = iii.clone();
iii.register_function("ns::action", move |data| {
    let iii = iii_clone.clone();
    async move {
        Ok(json!({ "result": true }))
    }
});
```

## Trigger Registration

```javascript
// Node — single object argument
iii.registerTrigger({
  type: 'http',
  function_id: 'ns::action',
  config: { api_path: '/path', http_method: 'POST' },
})
```

```python
# Python — positional arguments
iii.register_trigger('http', 'ns::action', {
    'api_path': '/path',
    'http_method': 'POST',
})
```

```rust
// Rust — positional arguments with json! macro
iii.register_trigger("http", "ns::action", json!({
    "api_path": "/path",
    "http_method": "POST",
}));
```

## Trigger Calls

### Direct (request/response)

```javascript
// Node — await, object argument
const result = await iii.trigger({ function_id: 'ns::action', payload: data })
```

```python
# Python — sync (no await), dict argument
result = iii.trigger({'function_id': 'ns::action', 'payload': data})
```

```rust
// Rust — await, builder pattern
let result = iii.trigger(TriggerRequest::new("ns::action", data)).await?;
```

### Named Queue (async point-to-point)

```javascript
// Node
iii.trigger({
  function_id: 'orders::process',
  payload: order,
  action: TriggerAction.Enqueue({ queue: 'payment' }),
})
```

```python
# Python
iii.trigger({
    'function_id': 'orders::process',
    'payload': order,
    'action': TriggerAction.Enqueue(queue='payment'),
})
```

```rust
// Rust
iii.trigger(
    TriggerRequest::new("orders::process", order)
        .action(TriggerAction::enqueue("payment")),
).await?;
```

### Fire-and-Forget (Void)

```javascript
// Node
iii.trigger({
  function_id: 'publish',
  payload: { topic: 'events.created', data: event },
  action: TriggerAction.Void(),
})
```

```python
# Python
iii.trigger({
    'function_id': 'publish',
    'payload': {'topic': 'events.created', 'data': event},
    'action': TriggerAction.Void(),
})
```

```rust
// Rust
iii.trigger(
    TriggerRequest::new("publish", json!({
        "topic": "events.created",
        "data": event,
    }))
    .action(TriggerAction::void()),
).await?;
```

## Logging

```javascript
// Node — from handler context
const { logger } = getContext()
logger.info('message', { key: 'value' })
```

```python
# Python — standalone Logger class
from iii import Logger
logger = Logger()
logger.info('message', {'key': 'value'})
```

```rust
// Rust — standalone Logger struct
let logger = Logger();
logger.info("message", Some(json!({ "key": "value" })));
```

## Key Differences Summary

| Aspect | Node | Python | Rust |
|---|---|---|---|
| Naming | camelCase | snake_case | snake_case fns, PascalCase types |
| Async model | async/await throughout | Sync surface, background event loop | async/.await, move closures |
| Handler signature | `async (data) => { ... }` | `def handler(data): ...` | `move \|data\| { async move { Ok(json!({...})) } }` |
| Trigger request | `{ function_id, payload }` object | `{'function_id': ..., 'payload': ...}` dict | `TriggerRequest::new(id, payload)` builder |
| Error handling | `throw new Error(...)` | `raise Exception(...)` | `Err(anyhow!(...))` or panic |
| Return values | Any serializable value | Any serializable value (dicts) | `Ok(serde_json::Value)` |
| Clone for closures | Not needed | Not needed | Must `iii.clone()` before `move` closures |

## Adapting a Reference Implementation

1. Start with the Node.js `reference.js` from the relevant design pattern skill
2. Translate imports, initialization, and naming conventions per the tables above
3. Convert `registerFunction` handlers to the target language's handler signature
4. Convert `trigger()` calls to the target language's request format
5. Convert `registerTrigger()` calls to positional args (Python/Rust) or keep as object (Node)
6. Adjust logging to use the target language's Logger pattern
7. For Rust: clone the `iii` instance before each closure, wrap returns in `Ok(json!({...}))`
