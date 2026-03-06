---
name: iii-rest-api
description: Creates REST endpoints, defines route handlers, configures CORS, and sets up request/response processing using iii-sdk or motia framework. Handles path parameters, body validation, and structured error responses for both TypeScript and Python. Use when building REST APIs, HTTP endpoints, request handlers, or web servers with iii-sdk or motia framework — including registering triggers, parsing request bodies, returning typed responses, and testing endpoints with curl.
---

# Build REST APIs with iii

## Overview

iii replaces your API framework (Express, Fastify, Flask) with two primitives: a **Function** that handles the request and an **HTTP Trigger** that routes it. No middleware chains, no router setup — register a function, bind a trigger, done.

## When to Use

- Building REST APIs or HTTP endpoints
- Replacing Express/Fastify/Flask with iii
- Adding API routes to an existing iii worker
- Need request validation, path params, CORS

## Quick Reference

| Pattern | iii SDK (low-level) | Motia (framework) |
|---------|--------------------|--------------------|
| GET endpoint | `registerFunction` + `registerTrigger({type:'http'})` | `http('GET', '/path')` in triggers |
| POST with body | Same, parse `req.body` | `bodySchema: z.object({...})` |
| Path params | `req.path_params.id` | `request.path_params.get('id')` |
| Response | `return { status_code, body, headers }` | `return { status, body }` or `ApiResponse(status, body)` |

## iii SDK Pattern (TypeScript)

```typescript
import { init } from 'iii-sdk'

const iii = init('ws://localhost:49134')

iii.registerFunction({ id: 'api::post::orders' }, async (req) => {
  const { item, quantity } = req.body

  if (!item) {
    return { status_code: 400, body: { error: 'item is required' } }
  }

  const order = { id: `order-${Date.now()}`, item, quantity, status: 'placed' }

  return {
    status_code: 201,
    body: order,
    headers: { 'Content-Type': 'application/json' },
  }
})

iii.registerTrigger({
  type: 'http',
  function_id: 'api::post::orders',
  config: {
    api_path: '/orders',
    http_method: 'POST',
    description: 'Create a new order',
  },
})
```

### Helper Pattern (DRY)

```typescript
import { type ApiRequest, type ApiResponse, type Context, getContext, init } from 'iii-sdk'

const iii = init('ws://localhost:49134')

const useApi = <TBody = any>(
  config: { api_path: string; http_method: string; description?: string },
  handler: (req: ApiRequest<TBody>, ctx: Context) => Promise<ApiResponse>,
) => {
  const function_id = `api::${config.http_method.toLowerCase()}::${config.api_path}`
  iii.registerFunction({ id: function_id }, (req) => handler(req, getContext()))
  iii.registerTrigger({ type: 'http', function_id, config })
}

useApi({ api_path: '/users', http_method: 'GET' }, async (req, ctx) => {
  ctx.logger.info('Listing users')
  return { status_code: 200, body: [{ id: 1, name: 'Alice' }] }
})

useApi({ api_path: '/users/:id', http_method: 'GET' }, async (req, ctx) => {
  const userId = req.path_params.id
  return { status_code: 200, body: { id: userId, name: 'Alice' } }
})
```

## Motia Framework Pattern (TypeScript)

```typescript
import type { Handlers, StepConfig } from 'motia'
import { z } from 'zod'

export const config = {
  name: 'CreateOrder',
  description: 'Create a new order via API',
  flows: ['orders'],
  triggers: [
    {
      type: 'http',
      method: 'POST',
      path: '/orders',
      bodySchema: z.object({
        item: z.string(),
        quantity: z.number().min(1),
      }),
      responseSchema: {
        201: z.object({ id: z.string(), item: z.string(), status: z.string() }),
        400: z.object({ error: z.string() }),
      },
    },
  ],
  enqueues: ['order.created'],
} as const satisfies StepConfig

export const handler: Handlers<typeof config> = async (request, { logger, enqueue }) => {
  const { item, quantity } = request.body
  const orderId = `order-${Date.now()}`

  logger.info('Creating order', { item, quantity })

  await enqueue({ topic: 'order.created', data: { orderId, item, quantity } })

  return { status: 201, body: { id: orderId, item, status: 'placed' } }
}
```

## Motia Framework Pattern (Python)

```python
from typing import Any
from motia import ApiRequest, ApiResponse, FlowContext, http

config = {
    "name": "GetUser",
    "description": "Get a user by ID",
    "triggers": [http("GET", "/users/:id")],
    "enqueues": [],
}

async def handler(request: ApiRequest[Any], ctx: FlowContext[Any]) -> ApiResponse[dict]:
    user_id = request.path_params.get("id")
    if not user_id:
        return ApiResponse(status=400, body={"error": "missing id"})

    ctx.logger.info("Fetching user", {"user_id": user_id})
    return ApiResponse(status=200, body={"id": user_id, "name": "Alice"})
```

## Engine Config (config.yaml)

```yaml
modules:
  - class: modules::api::RestApiModule
    config:
      port: 3111
      host: 127.0.0.1
      default_timeout: 30000
      cors:
        allowed_origins:
          - http://localhost:3000
        allowed_methods: [GET, POST, PUT, DELETE, OPTIONS]
```

## Error Handling Patterns

Beyond missing required fields, handle these common failure scenarios explicitly:

```typescript
// iii SDK — common error patterns
iii.registerFunction({ id: 'api::get::orders::id' }, async (req) => {
  const orderId = req.path_params.id

  // Not found
  const order = await db.find(orderId)
  if (!order) {
    return { status_code: 404, body: { error: `Order ${orderId} not found` } }
  }

  // Unexpected / server error
  try {
    const result = await processOrder(order)
    return { status_code: 200, body: result }
  } catch (err) {
    return { status_code: 500, body: { error: 'Internal server error' } }
  }
})
```

```python
# Motia Python — common error patterns
async def handler(request: ApiRequest[Any], ctx: FlowContext[Any]) -> ApiResponse[dict]:
    try:
        user_id = request.path_params.get("id")
        user = await db.find(user_id)
        if not user:
            return ApiResponse(status=404, body={"error": f"User {user_id} not found"})
        return ApiResponse(status=200, body=user)
    except Exception as e:
        ctx.logger.error("Unexpected error", {"error": str(e)})
        return ApiResponse(status=500, body={"error": "Internal server error"})
```

## Validating Endpoints

After registering triggers, verify endpoints are reachable using curl:

```bash
# GET endpoint
curl -s http://127.0.0.1:3111/users/42 | jq .

# POST with JSON body
curl -s -X POST http://127.0.0.1:3111/orders \
  -H 'Content-Type: application/json' \
  -d '{"item":"widget","quantity":3}' | jq .

# Expect a 400 for missing required field
curl -s -X POST http://127.0.0.1:3111/orders \
  -H 'Content-Type: application/json' \
  -d '{}' | jq .

# Check response status code explicitly
curl -o /dev/null -w "%{http_code}" http://127.0.0.1:3111/users/42
```

Use the port and host defined in `config.yaml` (default: `127.0.0.1:3111`).

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting `status_code` in SDK response | Always return `{ status_code: 200, body: ... }` (NOT `status`) |
| Using `status` in SDK | SDK uses `status_code`, Motia uses `status` |
| Missing Content-Type | Add `headers: { 'Content-Type': 'application/json' }` in SDK |
| Path without leading `/` | SDK: `api_path: '/orders'` (with `/`), Motia: `path: '/orders'` |
