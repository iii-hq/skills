---
name: http-invoked-functions
description: >-
  Registers external HTTP endpoints as iii engine functions. Use when
  integrating webhooks, serverless functions, or third-party APIs so the engine
  calls them on trigger — no client-side HTTP code needed. Covers
  HttpInvocationConfig, auth options, and combining with cron/state/queue
  triggers.
---

# HTTP-Invoked Functions

Expose external HTTP endpoints as first-class iii functions. The engine makes the HTTP call when triggered — workers never issue HTTP requests directly.

Docs: https://iii.dev/docs/how-to/use-functions-and-triggers#http-invoked-functions

## Prerequisites

`HttpFunctionsModule` must be enabled in your engine config. See [Configure the Engine](https://iii.dev/docs/how-to/configure-engine).

## Key Concepts

Use the concepts below when they fit the task. Not every HTTP-invoked function needs every option shown here.

- Pass an `HttpInvocationConfig` object as the second argument to `registerFunction` **instead of** a handler function
- The engine forwards trigger payload as the JSON request body and treats non-2xx / network errors as failures
- Auth field values (`token_key`, `secret_key`, `value_key`) are **environment variable names**, not raw secrets — the engine resolves them at invocation time
- HTTP-invoked functions are indistinguishable from handler-based functions to callers — they can be triggered, discovered, and bound to any trigger type

## `HttpInvocationConfig` Fields

| Field        | Type                     | Default  | Description                                 |
| ------------ | ------------------------ | -------- | ------------------------------------------- |
| `url`        | `string`                 | —        | Endpoint URL to call                        |
| `method`     | `string`                 | `"POST"` | HTTP method (GET, POST, PUT, PATCH, DELETE) |
| `timeout_ms` | `number`                 | `30000`  | Request timeout in milliseconds             |
| `headers`    | `Record<string, string>` | —        | Additional headers                          |
| `auth`       | `HttpAuthConfig`         | —        | Auth config: `bearer`, `hmac`, or `api_key` |

## Auth Types

| Type      | Config Fields              | Description                 |
| --------- | -------------------------- | --------------------------- |
| `bearer`  | `token_key`                | Bearer token from env var   |
| `hmac`    | `secret_key`               | HMAC signature via env var  |
| `api_key` | `header_name`, `value_key` | API key header from env var |

## Architecture

```
Worker registers HTTP-invoked functions
  notifications::send     → POST https://hooks.provider.example.com/notify   (bearer auth)
  payments::charge        → POST https://api.stripe.example.com/charges      (api_key auth)
  analytics::track        → POST https://analytics.example.com/events        (no auth)

Trigger bindings
  Cron (hourly)           → analytics::track       (scheduled reporting)
  State change (orders)   → notifications::send     (reactive notification)
  Direct trigger()        → payments::charge        (on-demand from other functions)
```

## iii Primitives Used

| Primitive                                                    | Purpose                                             |
| ------------------------------------------------------------ | --------------------------------------------------- |
| `registerWorker`                                             | Initialize the worker and connect to iii            |
| `registerFunction(meta, HttpInvocationConfig)`               | Register an external endpoint as a function         |
| `trigger({ function_id, payload })`                          | Call HTTP-invoked functions like any other function |
| `trigger({ ..., action: TriggerAction.Void() })`             | Fire-and-forget calls to HTTP endpoints             |
| `trigger({ ..., action: TriggerAction.Enqueue({ queue }) })` | Queue HTTP calls for async processing with retries  |
| `registerTrigger({ type: 'cron' })`                          | Schedule periodic HTTP endpoint calls               |
| `registerTrigger({ type: 'state' })`                         | Call HTTP endpoint on state changes                 |

## Reference Implementation

See [reference.js](reference.js) for the full working example — a multi-service integration
worker that registers a webhook, a payment API, and an analytics endpoint as functions,
then binds them to various triggers.

## Common Patterns

Code using this pattern commonly includes, when relevant:

- `registerWorker(url, { workerName })` — worker initialization
- `registerFunction({ id, description }, { url, method, ... })` — register endpoint with `HttpInvocationConfig` (not a handler)
- `auth` config using env var names (not raw secrets) for any authenticated endpoint
- `trigger({ function_id, payload })` — invoke the HTTP-invoked function like any other function
- At least one trigger binding (`cron`, `state`, or `queue`) showing composition with reactive events

## Adapting This Pattern

Use the adaptations below when they apply to the task.

- Use `HttpInvocationConfig` for any external service you want callable from iii — webhooks, serverless functions, REST APIs, SaaS integrations
- Combine with `TriggerAction.Enqueue({ queue })` for reliable delivery with retries to external services
- Stack triggers: a single HTTP-invoked function can have cron, state, and direct triggers simultaneously
- For endpoints that return useful data, use `trigger()` (await); for fire-and-forget notifications, use `TriggerAction.Void()`
- Prefer `api_key` auth for third-party APIs, `bearer` for OAuth services, `hmac` for webhook receivers that verify signatures
- Group related integrations under a shared `functionId` prefix (e.g. `integrations::slack`, `integrations::stripe`)
