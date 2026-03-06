---
name: iii-python-sdk
description: Use when creating, configuring, or debugging iii functions, triggers, workers, or backend services in Python with the iii-sdk package. Helps register async functions and event handlers, configure HTTP/queue/cron triggers, build serverless-style workers and microservices, manage state and streams, and wire up complete CRUD APIs — all using the iii-sdk async Python interface.
---

# iii Python SDK

## Overview

The Python SDK (`iii-sdk` on PyPI) provides an async interface to the iii engine via `websockets` + `pydantic`. Functions are async callables. Call `init()` inside an async context — it auto-connects to the engine. No manual `connect()` call needed.

## When to Use

- Building workers or microservices in Python
- Data processing, ML inference, or AI pipelines
- When your team prefers Python over TypeScript/Rust
- Integrating with Python libraries (pandas, scikit-learn, etc.)

## Install

```bash
pip install iii-sdk
```

---

## New Worker Setup Workflow

Follow these steps when creating a new worker from scratch:

1. **Create the file** — e.g. `worker.py`
2. **Add `init()`** inside an `async def main()` with your worker name and address
3. **Register functions** — call `iii.register_function(name, handler)` for each handler
4. **Register triggers** — call `iii.register_trigger(...)` after each function registration
5. **Verify with a test trigger** — call `await iii.trigger(name, payload)` inside `main()` before the keep-alive loop
6. **Check logs** — use `ctx.logger.info/error` inside handlers and watch stdout for connection state changes
7. **Keep the event loop alive** — end `main()` with `while True: await asyncio.sleep(60)`

---

## Initialization

```python
import asyncio
from iii import init, InitOptions

async def main():
    iii = init(
        address='ws://localhost:49134',
        options=InitOptions(
            worker_name='my-python-worker',
            otel={'enabled': True, 'service_name': 'my-worker'},
        ),
    )

    # Register functions and triggers...

    while True:
        await asyncio.sleep(60)

asyncio.run(main())
```

## Register Functions

```python
from iii import get_context

async def greet(input):
    ctx = get_context()
    name = input.get('name', 'world')
    ctx.logger.info('Greeting user', {'name': name})
    return {'message': f'Hello, {name}!'}

iii.register_function('greet', greet)
```

## Register Triggers

```python
iii.register_trigger(
    type='http',
    function_id='greet',
    config={'api_path': '/greet', 'http_method': 'POST'},
)

iii.register_trigger(
    type='queue',
    function_id='order.process',
    config={'topic': 'order.created'},
)

iii.register_trigger(
    type='cron',
    function_id='cleanup.sessions',
    config={'expression': '0 */6 * * *'},
)
```

## Invoke Functions

```python
result = await iii.trigger('greet', {'name': 'Alice'})
print(result)

iii.trigger_void('analytics.track', {'event': 'page_view'})
```

## HTTP API Helper Pattern

```python
from typing import Any, Awaitable, Callable
from iii import III, ApiRequest, ApiResponse, get_context

def use_api(
    iii: III,
    config: dict[str, Any],
    handler: Callable[[ApiRequest, Any], Awaitable[ApiResponse]],
) -> None:
    api_path = config['api_path']
    http_method = config['http_method']
    function_id = f"api.{http_method.lower()}.{api_path}"

    async def wrapped(data):
        req = ApiRequest(**data) if isinstance(data, dict) else data
        ctx = get_context()
        result = await handler(req, ctx)
        return result.model_dump(by_alias=True)

    iii.register_function(function_id, wrapped)
    iii.register_trigger(
        type='http',
        function_id=function_id,
        config={
            'api_path': api_path,
            'http_method': http_method,
            'description': config.get('description'),
            'metadata': config.get('metadata'),
        },
    )

use_api(iii, {
    'api_path': '/users',
    'http_method': 'POST',
    'description': 'Create a user',
}, create_user_handler)
```

## ApiRequest / ApiResponse (Pydantic)

```python
from iii import ApiRequest, ApiResponse

async def handler(req: ApiRequest, ctx):
    user_id = req.path_params.get('id')
    name = req.path_params.get('name')
    body = req.body
    headers = req.headers
    method = req.method

    return ApiResponse(
        statusCode=200,
        body={'id': user_id, 'name': name, 'data': body},
        headers={'Content-Type': 'application/json'},
    )
```

Path params come from route placeholders like `/users/:id` — access via `req.path_params['id']`. The `statusCode` field uses **camelCase** (pydantic alias), not `status_code`.

## Error Handling

### Connection and trigger errors

Wrap `init()` and `trigger()` calls in try/except to recover from connection failures or invalid inputs:

```python
import asyncio
from iii import init, InitOptions

async def main():
    try:
        iii = init(
            address='ws://localhost:49134',
            options=InitOptions(worker_name='my-worker'),
        )
    except Exception as e:
        print(f'Failed to initialise iii: {e}')
        raise

    # Guard individual trigger calls
    try:
        result = await iii.trigger('greet', {'name': 'Alice'})
    except Exception as e:
        print(f'Trigger failed: {e}')
        result = None

asyncio.run(main())
```

### Handler-level validation

Validate inputs inside handlers and return structured error responses rather than letting exceptions propagate:

```python
async def create_user(req: ApiRequest, ctx):
    body = req.body or {}
    if not body.get('name'):
        return ApiResponse(statusCode=400, body={'error': 'name is required'})
    try:
        user = {**body, 'id': f"user-{int(datetime.now().timestamp())}"}
        await state.set('users', user['id'], user)
        return ApiResponse(statusCode=201, body=user)
    except Exception as e:
        ctx.logger.error('Failed to create user', {'error': str(e)})
        return ApiResponse(statusCode=500, body={'error': 'internal server error'})
```

### Monitoring connection state for recovery

Use `on_connection_state_change` to detect and log `failed` state so you can alert or restart:

```python
def on_state_change(state: str):
    if state == 'failed':
        print('All reconnect attempts exhausted — restart the worker')
    else:
        print(f'Connection state: {state}')

iii.on_connection_state_change(on_state_change)
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `RuntimeError: no running event loop` on `init()` | Called outside async context | Move `init()` inside `async def main()` |
| Connection state stuck at `connecting` | Wrong address or engine not running | Verify `ws://localhost:49134` and that the iii engine is up |
| Connection state goes to `failed` | Engine unreachable after all retries | Check network/firewall; restart the worker once engine is available |
| Trigger returns `None` unexpectedly | Function not registered before trigger | Ensure `register_function` is called before `trigger` |
| `ValidationError` on `ApiResponse` | Using `status_code` instead of `statusCode` | Use camelCase `statusCode` (pydantic alias) |
| Handler never called for HTTP trigger | Trigger not registered | Call `register_trigger` after `register_function` |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `init()` outside async context | Call inside `async def` — `init()` requires a running event loop |
| Forgetting `await` on `trigger()` | `result = await iii.trigger(...)` — it's async |
| `ApiResponse` field name | Use `statusCode` (camelCase) not `status_code` in Python |
| Not keeping the event loop alive | End with `while True: await asyncio.sleep(60)` |
| Blocking sync code in handlers | Use `asyncio.to_thread()` for CPU-heavy sync work |

---

## Reference: State Management

> See also: [Stream Client](#reference-stream-client) · [Custom Stream](#reference-custom-stream-implementation) · [Event Callbacks](#reference-event-callbacks-and-connection-states) · [Complete CRUD Example](#reference-complete-crud-example)

```python
from iii import III

class State:
    def __init__(self, iii: III):
        self._iii = iii

    async def get(self, scope: str, key: str):
        return await self._iii.trigger('state::get', {'scope': scope, 'key': key})

    async def set(self, scope: str, key: str, value):
        return await self._iii.trigger('state::set', {'scope': scope, 'key': key, 'value': value})

    async def delete(self, scope: str, key: str):
        return await self._iii.trigger('state::delete', {'scope': scope, 'key': key})

    async def list(self, scope: str):
        return await self._iii.trigger('state::list', {'scope': scope})

state = State(iii)
user = await state.set('users', 'user-1', {'name': 'Alice', 'email': 'alice@example.com'})
found = await state.get('users', 'user-1')
all_users = await state.list('users')
```

## Reference: Stream Client

```python
from iii import III

class StreamClient:
    def __init__(self, iii: III):
        self._iii = iii

    async def get(self, stream_name: str, group_id: str, item_id: str):
        return await self._iii.trigger('stream::get', {
            'stream_name': stream_name, 'group_id': group_id, 'item_id': item_id,
        })

    async def set(self, stream_name: str, group_id: str, item_id: str, data):
        return await self._iii.trigger('stream::set', {
            'stream_name': stream_name, 'group_id': group_id,
            'item_id': item_id, 'data': data,
        })

    async def delete(self, stream_name: str, group_id: str, item_id: str):
        return await self._iii.trigger('stream::delete', {
            'stream_name': stream_name, 'group_id': group_id, 'item_id': item_id,
        })

    async def list(self, stream_name: str, group_id: str):
        return await self._iii.trigger('stream::list', {
            'stream_name': stream_name, 'group_id': group_id,
        })

    async def list_groups(self, stream_name: str):
        return await self._iii.trigger('stream::list_groups', {'stream_name': stream_name})

streams = StreamClient(iii)
await streams.set('todo', 'inbox', 'todo-1', {'description': 'Buy milk', 'done': False})
```

## Reference: Custom Stream Implementation

```python
from iii import (
    III, IStream, StreamGetInput, StreamSetInput, StreamSetResult,
    StreamDeleteInput, StreamListInput, StreamListGroupsInput, StreamUpdateInput,
)

class TodoStream(IStream[dict]):
    def __init__(self):
        self._todos: list[dict] = []

    async def get(self, input: StreamGetInput):
        return next((t for t in self._todos if t['id'] == input.item_id), None)

    async def set(self, input: StreamSetInput):
        for i, t in enumerate(self._todos):
            if t['id'] == input.item_id:
                updated = {**t, **input.data}
                self._todos[i] = updated
                return StreamSetResult(old_value=t, new_value=updated)

        new = {**input.data, 'id': input.item_id, 'group_id': input.group_id}
        self._todos.append(new)
        return StreamSetResult(old_value=None, new_value=new)

    async def delete(self, input: StreamDeleteInput):
        self._todos = [t for t in self._todos if t['id'] != input.item_id]

    async def list(self, input: StreamListInput):
        return [t for t in self._todos if t.get('group_id') == input.group_id]

    async def list_groups(self, input: StreamListGroupsInput):
        return list({t.get('group_id', '') for t in self._todos})

    async def update(self, input: StreamUpdateInput):
        return None

iii.create_stream('todo', TodoStream())
```

## Reference: Event Callbacks and Connection States

```python
from iii import FunctionInfo

def on_functions(functions: list[FunctionInfo]):
    print(f'Available functions: {len(functions)}')

unsubscribe = iii.on_functions_available(on_functions)

def on_state_change(state: str):
    print(f'Connection: {state}')

iii.on_connection_state_change(on_state_change)
```

| State | Meaning |
|-------|---------|
| `disconnected` | Not connected |
| `connecting` | Initial connection in progress |
| `connected` | Active WebSocket connection |
| `reconnecting` | Lost connection, retrying |
| `failed` | All retries exhausted |

## Reference: Complete CRUD Example

This self-contained example inlines the `State` helper (see [State Management](#reference-state-management)) and the `use_api` hook (see [HTTP API Helper Pattern](#http-api-helper-pattern)).

```python
import asyncio
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable
from iii import III, ApiRequest, ApiResponse, init, InitOptions, get_context


# ── State helper ────────────────────────────────────────────────────────────

class State:
    def __init__(self, iii: III):
        self._iii = iii

    async def get(self, scope: str, key: str):
        return await self._iii.trigger('state::get', {'scope': scope, 'key': key})

    async def set(self, scope: str, key: str, value):
        return await self._iii.trigger('state::set', {'scope': scope, 'key': key, 'value': value})

    async def list(self, scope: str):
        return await self._iii.trigger('state::list', {'scope': scope})


# ── HTTP API hook ────────────────────────────────────────────────────────────

def use_api(
    iii: III,
    config: dict[str, Any],
    handler: Callable[[ApiRequest, Any], Awaitable[ApiResponse]],
) -> None:
    api_path = config['api_path']
    http_method = config['http_method']
    function_id = f"api.{http_method.lower()}.{api_path}"

    async def wrapped(data):
        req = ApiRequest(**data) if isinstance(data, dict) else data
        ctx = get_context()
        result = await handler(req, ctx)
        return result.model_dump(by_alias=True)

    iii.register_function(function_id, wrapped)
    iii.register_trigger(
        type='http',
        function_id=function_id,
        config={
            'api_path': api_path,
            'http_method': http_method,
            'description': config.get('description'),
            'metadata': config.get('metadata'),
        },
    )


# ── Worker entry point ───────────────────────────────────────────────────────

async def main():
    iii = init('ws://localhost:49134', InitOptions(worker_name='crud-api'))
    state = State(iii)

    async def create_user(req: ApiRequest, ctx):
        user = {**req.body, 'id': f"user-{int(datetime.now(timezone.utc).timestamp())}"}
        await state.set('users', user['id'], user)
        ctx.logger.info('User created', {'id': user['id']})
        return ApiResponse(statusCode=201, body=user)

    async def get_user(req: ApiRequest, ctx):
        user = await state.get('users', req.path_params['id'])
        if not user:
            return ApiResponse(statusCode=404, body={'error': 'not found'})
        return ApiResponse(statusCode=200, body=user)

    async def list_users(req: ApiRequest, ctx):
        users = await state.list('users')
        return ApiResponse(statusCode=200, body=users)

    use_api(iii, {'api_path': '/users', 'http_method': 'POST'}, create_user)
    use_api(iii, {'api_path': '/users/:id', 'http_method': 'GET'}, get_user)
    use_api(iii, {'api_path': '/users', 'http_method': 'GET'}, list_users)

    while True:
        await asyncio.sleep(60)

asyncio.run(main())
```
