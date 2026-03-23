---
name: rust-sdk
description: >-
  Rust SDK for the iii engine. Use when building high-performance workers,
  registering functions, or invoking triggers in Rust.
---

# Rust SDK

The native async Rust SDK for connecting workers to the iii engine via tokio.

## Documentation

Full API reference: https://iii.dev/docs/api-reference/sdk-rust

## Install

Add to `Cargo.toml`:

`iii-sdk = { version = "...", features = ["otel"] }`

## Key Types and Functions

| Export | Purpose |
|--------|---------|
| `init(url, InitOptions)` | Connect to the engine, returns `III` client |
| `III::register_function(id, closure)` | Register a function (closure returns `Future<Result<Value, IIIError>>`) |
| `III::register_trigger(type, function_id, config)` | Bind a trigger to a function |
| `III::trigger(TriggerRequest)` | Invoke a function |
| `TriggerAction::Void` | Fire-and-forget invocation |
| `TriggerAction::Enqueue { queue }` | Durable async invocation |
| `IIIError` | Error type for handler failures |
| `Streams` | Helper for atomic stream CRUD |
| `with_span`, `get_tracer`, `get_meter` | OpenTelemetry (requires `otel` feature) |
| `execute_traced_request` | HTTP client with trace context propagation |

## Key Notes

- Add `features = ["otel"]` to `Cargo.toml` for OpenTelemetry support
- Functions use closures returning `Future<Output = Result<Value, IIIError>>`
- Keep the tokio runtime alive (e.g., `tokio::time::sleep` loop) for event processing
- `register_trigger` returns `Ok(())` on success; propagate errors with `?`

## Pattern Boundaries

- For usage patterns and working examples, see `functions-and-triggers`
- For Node.js SDK, see `node-sdk`
- For Python SDK, see `python-sdk`
