---
name: python-sdk
description: >-
  Python SDK for the iii engine. Use when building workers, registering
  functions, or invoking triggers in Python.
---

# Python SDK

The async Python SDK for connecting workers to the iii engine.

## Documentation

Full API reference: https://iii.dev/docs/api-reference/sdk-python

## Install

`pip install iii-sdk`

## Key Exports

| Export | Purpose |
|--------|---------|
| `init(address, options?)` | Connect to the engine inside an async context |
| `InitOptions(worker_name, otel?)` | Connection configuration |
| `register_function(id, handler)` | Register an async function handler |
| `register_trigger(type, function_id, config)` | Bind a trigger to a function |
| `trigger(function_id, payload)` | Invoke a function (async) |
| `trigger_void(function_id, payload)` | Fire-and-forget invocation |
| `get_context()` | Access logger and trace context inside handlers |
| `ApiRequest` / `ApiResponse` | HTTP request/response types (pydantic) |
| `IStream` | Interface for custom stream implementations |
| `on_functions_available(callback)` | Listen for function discovery |
| `on_connection_state_change(callback)` | Monitor connection state |

## Key Notes

- `init()` must be called inside an `async def` — it requires a running event loop
- `ApiResponse` uses camelCase `statusCode` (pydantic alias), not `status_code`
- End workers with `while True: await asyncio.sleep(60)` to keep the event loop alive
- Use `asyncio.to_thread()` for CPU-heavy sync work inside handlers

## Pattern Boundaries

- For usage patterns and working examples, see `functions-and-triggers`
- For Node.js SDK, see `node-sdk`
- For Rust SDK, see `rust-sdk`
