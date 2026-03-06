---
name: iii-rust-sdk
description: "Use when building, registering, or wiring iii platform functions, triggers, workers, HTTP API handlers, or backend services using the iii-sdk Rust crate. Covers the full lifecycle: initializing the async WebSocket client, registering function closures and event triggers (HTTP, queue, cron), performing atomic stream updates, implementing custom trigger types, and handling errors with IIIError. Use when a user asks how to write a Rust worker for iii, set up iii-sdk dependencies, register a serverless-style function handler, wire a cron or queue trigger, use the Streams helper for atomic key updates, or debug common registration mistakes."
---

# iii Rust SDK

## Overview

The Rust SDK (`iii-sdk` crate) provides a native async interface to the iii engine via tokio + tokio-tungstenite WebSocket. Functions use closures returning `Future<Output = Result<Value, IIIError>>`. Full OpenTelemetry support behind the `otel` feature flag.

## When to Use

- Building high-performance workers in Rust
- Systems requiring zero-cost abstractions and memory safety
- Latency-sensitive function handlers
- When you need the `Streams` helper for atomic updates

## Quick-Start Workflow

Follow these steps in order to get a worker running:

1. **Add dependencies** — add `iii-sdk`, `tokio`, `serde_json`, and optional crates to `Cargo.toml`
2. **Initialize** — call `init()` with the bridge URL and `InitOptions` to create the `iii` client
3. **Register functions** — call `iii.register_function(id, closure)` for each handler
4. **Register triggers** — call `iii.register_trigger(type, function_id, config)?` to bind HTTP/queue/cron events
5. **Run the event loop** — keep the process alive (e.g. `tokio::time::sleep` loop) so the client continues receiving events

> **Verification tip:** After calling `register_function`, the SDK returns a `FunctionRef` whose `id` field echoes the registered name — confirm it matches what you passed in. For triggers, a successful `register_trigger` call returns `Ok(())`; any registration error surfaces as an `IIIError` immediately, so always propagate with `?`.

## Cargo.toml

```toml
[dependencies]
iii-sdk = { version = "0.4", features = ["otel"] }
tokio = { version = "1", features = ["full"] }
serde_json = "1"
reqwest = { version = "0.12", features = ["json"] }
```

## Initialization

```rust
use iii_sdk::{init, InitOptions, OtelConfig};
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let url = std::env::var("III_BRIDGE_URL")
        .unwrap_or("ws://127.0.0.1:49134".into());

    let iii = init(&url, InitOptions {
        otel: Some(OtelConfig::default()),
        ..Default::default()
    })?;

    // Register functions and triggers here...

    loop {
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;
    }
}
```

## Register Functions

```rust
use iii_sdk::{get_context, IIIError};

iii.register_function("greet", |input| async move {
    let ctx = get_context();
    let name = input["name"].as_str().unwrap_or("world");
    ctx.logger.info("Greeting", Some(json!({"name": name})));
    Ok(json!({"message": format!("Hello, {}!", name)}))
});
```

### With External State (Clone Pattern)

```rust
let iii_clone = iii.clone();
iii.register_function("order.process", move |input| {
    let iii = iii_clone.clone();
    async move {
        let ctx = get_context();
        let order_id = input["orderId"].as_str().unwrap_or("unknown");
        ctx.logger.info("Processing order", Some(json!({"orderId": order_id})));

        iii.trigger_void("notification.send", json!({
            "to": "ops@example.com",
            "message": format!("Order {} processed", order_id),
        }))?;

        Ok(json!({"processed": true, "orderId": order_id}))
    }
});
```

## Register Triggers

```rust
iii.register_trigger("http", "greet", json!({
    "api_path": "/greet",
    "http_method": "POST",
    "description": "Greet a user",
}))?;

iii.register_trigger("queue", "order.process", json!({
    "topic": "order.created",
}))?;

iii.register_trigger("cron", "cleanup.sessions", json!({
    "expression": "0 */6 * * *",
}))?;
```

## Invoke Functions

```rust
let result = iii.trigger("greet", json!({"name": "Alice"})).await?;
println!("Result: {}", result);

iii.trigger_void("analytics.track", json!({"event": "page_view"}))?;
```

## Error Handling

```rust
use iii_sdk::IIIError;

iii.register_function("might.fail", |input| async move {
    let value = input.get("required_field")
        .ok_or_else(|| IIIError::Handler("required_field missing".into()))?;

    let parsed: i64 = value.as_i64()
        .ok_or_else(|| IIIError::Handler("required_field must be a number".into()))?;

    Ok(json!({"doubled": parsed * 2}))
});
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting `move` on closures | `register_function("id", move \|input\| { ... })` |
| Not cloning `iii` for nested calls | `let iii_clone = iii.clone();` before the closure |
| Missing tokio runtime | `#[tokio::main]` or `tokio::runtime::Handle::try_current()` |
| Using `trigger()` for fire-and-forget | Use `trigger_void()` — `trigger()` blocks until result |
| Not handling `IIIError` | Use `?` or `.map_err()` — don't unwrap in handlers |

---

## Advanced Reference

The following sections cover specialised use cases. Refer to them as needed rather than reading sequentially.

## HTTP API Handlers

```rust
use iii_sdk::{ApiRequest, ApiResponse, get_context, execute_traced_request};

let client = reqwest::Client::new();
let get_client = client.clone();

iii.register_function("api::get::users", move |_input| {
    let client = get_client.clone();
    async move {
        let ctx = get_context();
        ctx.logger.info("Fetching users", None);

        let request = client.get("https://api.example.com/users")
            .build()
            .map_err(|e| IIIError::Handler(e.to_string()))?;

        let response = execute_traced_request(&client, request)
            .await
            .map_err(|e| IIIError::Handler(e.to_string()))?;

        let status = response.status().as_u16();
        let data: serde_json::Value = response.json()
            .await
            .map_err(|e| IIIError::Handler(e.to_string()))?;

        let api_response = ApiResponse {
            status_code: status,
            body: json!({"data": data}),
            headers: [("Content-Type".into(), "application/json".into())].into(),
        };

        Ok(serde_json::to_value(api_response)?)
    }
});

iii.register_trigger("http", "api::get::users", json!({
    "api_path": "/users",
    "http_method": "GET",
}))?;
```

## Streams: Atomic Updates

```rust
use iii_sdk::{Streams, UpdateBuilder, UpdateOp};

let streams = Streams::new(iii.clone());

streams.update("orders::order-123", vec![
    UpdateOp::set("status", json!("processing")),
    UpdateOp::set("counter", json!(0)),
]).await?;

streams.increment("orders::order-123", "counter", 5).await?;

streams.decrement("orders::order-123", "counter", 2).await?;

streams.merge("orders::order-123", json!({
    "metadata": {"source": "rust-worker"},
})).await?;

streams.remove_field("orders::order-123", "temp_field").await?;

let ops = UpdateBuilder::new()
    .increment("counter", 1)
    .set("status", json!("active"))
    .set("updatedAt", json!("2026-01-01T00:00:00Z"))
    .build();

let result = streams.update("orders::order-123", ops).await?;
println!("New value: {:?}", result.new_value);
```

## Concurrent Updates (Thread-Safe)

```rust
let mut handles = vec![];
for i in 0..10 {
    let streams_clone = streams.clone();
    let key = "counters::shared".to_string();
    let handle = tokio::spawn(async move {
        for _ in 0..10 {
            let _ = streams_clone.increment(&key, "value", 1).await;
        }
        println!("Task {} done", i);
    });
    handles.push(handle);
}

for handle in handles {
    handle.await?;
}
```

## Custom Trigger Types

```rust
use iii_sdk::{TriggerHandler, TriggerConfig, IIIError};
use async_trait::async_trait;

struct MyTrigger;

#[async_trait]
impl TriggerHandler for MyTrigger {
    async fn register_trigger(&self, config: TriggerConfig) -> Result<(), IIIError> {
        println!("Registered: {} -> {}", config.id, config.function_id);
        Ok(())
    }

    async fn unregister_trigger(&self, config: TriggerConfig) -> Result<(), IIIError> {
        println!("Unregistered: {}", config.id);
        Ok(())
    }
}

iii.register_trigger_type("my-trigger", MyTrigger);
```

## Key Types

```rust
pub struct ApiRequest {
    pub path_params: HashMap<String, String>,
    pub query_params: HashMap<String, Value>,
    pub body: Value,
    pub headers: HashMap<String, Value>,
    pub method: String,
}

pub struct ApiResponse {
    pub status_code: u16,
    pub body: Value,
    pub headers: HashMap<String, String>,
}

pub struct FunctionRef {
    pub id: String,
    pub unregister: Arc<dyn Fn() + Send + Sync>,
}

pub struct WorkerMetadata {
    pub runtime: String,    // "rust"
    pub version: String,    // SDK version
    pub name: String,       // hostname:pid
    pub os: String,         // "linux x86_64 (unix)"
}
```

## See Also

- `iii-sdk` crate documentation (docs.rs) — full API reference, feature flags, and changelog
- `iii-sdk` on crates.io — version history and dependency graph
