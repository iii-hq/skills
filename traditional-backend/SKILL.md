---
name: traditional-backend
description: >-
  Wraps and adapts traditional and legacy backends into the iii engine. Use
  when migrating or integrating an existing REST API, framework, or service so
  iii can register its functionality, add logging and observability, and expose
  existing behavior through iii primitives with minimal changes.
---

# Traditional and Legacy Backend Adaptation

Comparable to: Ruby on Rails, Java Spring Boot, Express.js, FastAPI
Always first confirm with the user on the adaptation approach. The user has the information on whether or not an existing backend
can be modified and by how much.

## Key Concepts

Start from the existing backend behavior. Adapt the smallest amount of code needed so iii can register it as a worker, register functions, trigger them, and add iii observability.

- **Middleware** is an adaptation layer when the backend can be lightly modified. Use it to register existing functionality with iii, attach iii logging and observability, and bridge existing auth or request flow into iii primitives. This can also take the form of wrappers, hooks, or init steps.
- **Functions** registered with `registerFunction` are regular iii functions. They are not limited to helpers or route handlers.
- **HTTP triggers** expose those functions as routes when iii can own the endpoint. Do not use them when only light or no modification of existing systems is allowed.
- **State operations** are optional and only belong here when the application truly has shared application state that benefits from iii state.
- **Cron triggers** are for scheduled work. iii does not have a separate "background jobs" primitive.

## Architecture

```text
Existing backend
  route/controller/service
    → optional iii-aware middleware or wrapper
    → registerFunction(existing operation)
    → optional registerTrigger({ type: 'http' }) when iii owns the route

If the backend cannot take middleware
  existing HTTP endpoint or third-party service
    → adapt it into a triggerable iii function
    → prefer the HTTP-invoked-functions pattern for that case
```

## iii Primitives Used

| Primitive                                         | Purpose                                                     |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `registerWorker`                                  | Initialize the worker and connect to iii                    |
| `registerFunction`                                | Register existing backend behavior as regular iii functions |
| `trigger({ function_id, payload })`               | Call other iii functions from adapted backend code          |
| `trigger({ function_id: 'state::...', payload })` | Optional shared application state, only when it truly fits  |
| `trigger({ ..., action: TriggerAction.Void() })`  | Optional fire-and-forget side effect                        |
| `registerTrigger({ type: 'http' })`               | Map an HTTP endpoint to a registered iii function           |
| `registerTrigger({ type: 'cron' })`               | Optional scheduled work                                     |
| `registerTrigger({ type: 'state' })`              | Optional reactions to shared application state changes      |

## Reference Implementation

See [reference.js](reference.js) for a larger adaptation example. It includes optional state-backed persistence and scheduled work as examples, not defaults.

## Common Patterns

Start with these defaults:

- `registerWorker(url, { workerName })` — worker initialization
- `registerFunction({ id }, handler)` with `category::action` function IDs for the business operation you want iii to know about and workers to be able to use
- `registerTrigger({ type: 'http', function_id, config: { api_path, http_method } })` only when iii should expose the HTTP route
- `const logger = new Logger()` — iii logging with trace correlation from adapted backend code

Add these only if the task needs them:

- Middleware, wrappers, hooks, or init steps that register existing routes or services with iii without rewriting the backend
- `trigger({ function_id: 'state::...', payload: { scope, key } })` only for real shared application state
- `registerTrigger({ type: 'state' })` when existing backend behavior should react to shared application state changes
- Auth or other cross-cutting concerns as reusable iii functions called via `await iii.trigger({ function_id: 'auth-fn', payload: { token } })`
- 7-position cron for scheduled work: `0 0 3 * * * *`
- If the backend or third-party service cannot be modified, use the `http-invoked-functions` pattern to adapt that HTTP endpoint into a triggerable iii function

## Adapting This Pattern

Apply the smallest adaptation that satisfies the request. Omit every bullet below unless the task clearly needs it.

- Preserve the backend's existing architecture where possible and add iii at the edges
- Group related functions under a shared `functionId` prefix (e.g. `blog::posts::list`, `blog::posts::create`)
- Keep comparison snippets behaviorally parallel: same resource, payload, auth location, validation, and response shape across variants
- Use middleware as an ingestion and observability layer when the backend can be modified
- Split auth into its own function only when more than one adapted path needs the same check
- For RESTful resources, follow the convention: `resource::X::list`, `resource::X::get`, `resource::X::create`, `resource::X::update`, `resource::X::delete`
- Add cron only when scheduled work is part of the task; use 7-position numeric format like `0 0 3 * * * *`

## Common Misunderstandings

- Do not default to `state::` operations. They are only for cases where shared application state is actually needed.
- Do not describe `registerFunction` as registering only helpers or route handlers. It registers regular iii functions.
- Do not describe cron as "background jobs." Say scheduled work or cron-triggered work instead.
