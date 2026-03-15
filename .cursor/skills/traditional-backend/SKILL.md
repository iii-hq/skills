---
name: traditional-backend
description: >-
  Reference implementation for traditional REST API backends in iii. Use when
  building CRUD APIs with routes, model layers, authentication middleware,
  and scheduled background jobs — familiar patterns from Rails, Spring Boot,
  or Express.
---

# Traditional Backend Framework

Comparable to: Ruby on Rails, Java Spring Boot, Express.js

## Key Concepts

Use the concepts below when they fit the task. Not every traditional backend needs every supporting pattern shown here.

- **Routes** are HTTP-triggered functions (GET, POST, etc.)
- **Models** are helper functions wrapping `state::` operations (find, list, save, delete)
- **Middleware** (auth, logging) is implemented as composable functions called at the start of a handler
- **Background jobs** run on cron triggers

## Architecture

```
HTTP routes
  POST /posts → authenticate → savePost → publish(created)
  GET  /posts → listPosts
  GET  /posts/show → findPost
  POST /posts/update → authenticate → findPost → savePost
  POST /posts/delete → authenticate → findPost → deletePost

Cron (3 AM daily) → generate-sitemap
```

## iii Primitives Used

| Primitive                                         | Purpose                                     |
| ------------------------------------------------- | ------------------------------------------- |
| `registerWorker`                                  | Initialize the worker and connect to iii    |
| `registerFunction`                                | Route handlers, middleware, background jobs |
| `trigger({ function_id, payload })`               | Call middleware (auth) from handlers        |
| `trigger({ function_id: 'state::...', payload })` | Model layer                                 |
| `trigger({ ..., action: TriggerAction.Void() })`  | Fire-and-forget domain event broadcast      |
| `registerTrigger({ type: 'http' })`               | Route definitions                           |
| `registerTrigger({ type: 'cron' })`               | Scheduled jobs                              |

## Reference Implementation

See [reference.js](reference.js) for the full working example — a blog REST API with
CRUD routes, token-based auth middleware, model helpers, and a cron-driven sitemap generator.

## Common Patterns

Code using this pattern commonly includes, when relevant:

- `registerWorker(url, { workerName })` — worker initialization
- `registerFunction({ id }, handler)` with `category::action` function IDs
- `trigger({ function_id: 'state::...', payload: { scope, key } })` — model-layer state ops
- `registerTrigger({ type: 'http', function_id, config: { api_path, http_method } })` — route wiring
- `const { logger } = getContext()` — structured logging inside handlers
- Auth as a composable function called via `await iii.trigger({ function_id: 'auth-fn', payload: { token } })`
- 7-position cron for background jobs: `0 0 3 * * * *`

## Adapting This Pattern

Use the adaptations below when they apply to the task.

- Group related routes under a shared `functionId` prefix (e.g. `blog::list-posts`, `blog::create-post`)
- Auth middleware is just a function — call it via `await iii.trigger({ function_id: 'your::auth-fn', payload: { token } })` at the start of protected handlers
- Model helpers are plain async functions wrapping state operations — keep them outside `registerFunction` for reuse
- For RESTful resources, follow the convention: `domain::list-X`, `domain::get-X`, `domain::create-X`, `domain::update-X`, `domain::delete-X`
- Cron expressions use 7-position numeric format: `0 0 3 * * * *` (3 AM daily)
