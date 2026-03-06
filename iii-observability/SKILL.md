---
name: iii-observability
description: Configures OpenTelemetry exporters, instruments code with custom tracing spans and metrics, sets up Prometheus scraping, and integrates iii workers and engine with observability backends such as Jaeger, Grafana, Datadog, and Honeycomb. Use when setting up distributed tracing, metrics collection, or structured logging for iii workers and engine; connecting to an OTel Collector; debugging latency across function chains; or adding custom spans, counters, and histograms via the TypeScript, Python, or Rust SDK.
---

# Observability with iii

## Overview

iii has built-in OpenTelemetry support across all three SDKs. The engine exports traces, metrics, and logs via OTLP. Workers automatically propagate W3C trace context across function invocations. Prometheus metrics are available on port 9464.

## When to Use

- Setting up distributed tracing across iii functions
- Configuring Prometheus metrics scraping
- Adding custom spans, metrics, or log events
- Debugging latency issues across function chains
- Connecting to Grafana, Jaeger, Datadog, or Honeycomb

## Architecture

```
[Worker] ──traces/metrics──→ [iii Engine] ──OTLP──→ [OTel Collector] ──→ [Jaeger/Grafana/Datadog]
                                  ↓
                          [Prometheus :9464]
```

## Engine Config (config.yaml)

```yaml
modules:
  - class: modules::observability::OtelModule
    config:
      enabled: ${OTEL_ENABLED:true}
      service_name: ${OTEL_SERVICE_NAME:iii-engine}
      service_version: ${SERVICE_VERSION:1.0.0}
      service_namespace: ${SERVICE_NAMESPACE:production}
      service_instance_id: ${SERVICE_INSTANCE_ID:auto-generated}

      exporter: ${OTEL_EXPORTER_TYPE:both}
      endpoint: ${OTEL_EXPORTER_OTLP_ENDPOINT:http://localhost:4317}

      sampling_ratio: 1.0

      memory_max_spans: ${OTEL_MEMORY_MAX_SPANS:10000}

      metrics_enabled: true
      metrics_exporter: ${OTEL_METRICS_EXPORTER:both}
      prometheus_port: ${PROMETHEUS_PORT:9464}
      metrics_retention_seconds: 3600
      metrics_max_count: 10000

      logs_enabled: ${OTEL_LOGS_ENABLED:true}
      logs_exporter: ${OTEL_LOGS_EXPORTER:both}
      logs_max_count: ${OTEL_LOGS_MAX_COUNT:1000}
      logs_retention_seconds: ${OTEL_LOGS_RETENTION_SECONDS:3600}

      worker_metrics:
        enabled: true
        collection_interval_seconds: 5
        history_size: 60
```

### Exporter Types

| Value | Destination |
|-------|-------------|
| `otlp` | OTLP gRPC endpoint only |
| `memory` | In-memory (for console/debug) |
| `both` | OTLP + in-memory |

## TypeScript: SDK Telemetry Setup

```typescript
import { init } from 'iii-sdk'

const iii = init('ws://localhost:49134', {
  otel: {
    enabled: true,
    serviceName: 'my-worker',
    serviceVersion: '1.0.0',
    serviceNamespace: 'production',
    metricsEnabled: true,
    metricsExportIntervalMs: 10000,
    reconnectionConfig: {
      maxRetries: 10,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      jitterFactor: 0.3,
    },
  },
})
```

### Custom Spans

```typescript
import { withSpan, getTracer, getMeter, currentTraceId, currentSpanId } from 'iii-sdk'

iii.registerFunction({ id: 'order.process' }, async (input) => {
  return withSpan('process-payment', { kind: SpanKind.INTERNAL }, async (span) => {
    span.setAttribute('order.id', input.orderId)
    span.setAttribute('order.amount', input.amount)

    const result = await chargeCard(input)

    span.setStatus({ code: SpanStatusCode.OK })
    return result
  })
})
```

### Custom Metrics

```typescript
import { getMeter } from 'iii-sdk'

const meter = getMeter()
const orderCounter = meter.createCounter('orders.processed', {
  description: 'Number of orders processed',
})
const latencyHistogram = meter.createHistogram('order.latency_ms', {
  description: 'Order processing latency',
})

iii.registerFunction({ id: 'order.process' }, async (input) => {
  const start = Date.now()

  const result = await processOrder(input)

  orderCounter.add(1, { status: 'success', type: input.type })
  latencyHistogram.record(Date.now() - start, { type: input.type })

  return result
})
```

### Trace Context Propagation

```typescript
import {
  currentTraceId,
  currentSpanId,
  extractContext,
  injectTraceparent,
  injectBaggage,
} from 'iii-sdk'

iii.registerFunction({ id: 'api.proxy' }, async (input) => {
  const traceId = currentTraceId()
  const spanId = currentSpanId()

  const traceparent = injectTraceparent()
  const baggage = injectBaggage()

  const response = await fetch('https://api.example.com/data', {
    headers: {
      traceparent: traceparent!,
      baggage: baggage!,
    },
  })

  return response.json()
})
```

### Listen for Log Events

```typescript
const unsubscribe = iii.onLog(
  (log) => {
    console.log(`[${log.severity_text}] ${log.body}`)
  },
  { level: 'warn' }
)
```

## Python: SDK Telemetry

```python
from iii import init, InitOptions, OtelConfig

iii = init('ws://localhost:49134', InitOptions(
    worker_name='python-worker',
    otel=OtelConfig(
        enabled=True,
        service_name='my-python-worker',
    ),
))
```

### Custom Spans (Python)

```python
from iii import get_tracer

tracer = get_tracer()

async def process_order(input):
    with tracer.start_as_current_span('process-payment') as span:
        span.set_attribute('order.id', input['orderId'])
        result = await charge_card(input)
        return result
```

### Custom Metrics (Python)

```python
from iii import get_meter

meter = get_meter()
counter = meter.create_counter('orders.processed')
histogram = meter.create_histogram('order.latency_ms')

async def handler(input):
    import time
    start = time.time()
    result = await process(input)
    counter.add(1, {'status': 'success'})
    histogram.record((time.time() - start) * 1000)
    return result
```

## Rust: SDK Telemetry

```rust
use iii_sdk::{init, InitOptions, OtelConfig, with_span, get_tracer, get_meter, execute_traced_request};

let iii = init("ws://127.0.0.1:49134", InitOptions {
    otel: Some(OtelConfig::default()),
    ..Default::default()
})?;
```

### Traced HTTP Requests (Rust)

```rust
use iii_sdk::execute_traced_request;

let client = reqwest::Client::new();
let request = client.get("https://api.example.com/data")
    .build()
    .map_err(|e| IIIError::Handler(e.to_string()))?;

let response = execute_traced_request(&client, request)
    .await
    .map_err(|e| IIIError::Handler(e.to_string()))?;
```

## Disable Telemetry

```bash
export OTEL_ENABLED=false
```

Or in SDK:
```typescript
const iii = init('ws://localhost:49134', { otel: { enabled: false } })
```

## OTel Collector Config (otel-collector-config.yaml)

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

exporters:
  jaeger:
    endpoint: jaeger:14250
  prometheus:
    endpoint: 0.0.0.0:8889

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [jaeger]
    metrics:
      receivers: [otlp]
      exporters: [prometheus]
```

## Validating Telemetry

After starting the engine and workers, confirm each signal is flowing before connecting a backend:

**Prometheus metrics endpoint**
```bash
curl http://localhost:9464/metrics
# Expect lines like: iii_function_invocations_total{...} 42
```

**OTLP / traces** — open the Jaeger UI (default `http://localhost:16686`) and search for the `iii-engine` service. Invoke a registered function and verify a trace appears within a few seconds.

**Logs** — if `logs_exporter` includes `memory`, the engine console will print structured log lines. For OTLP logs, check your collector's output pipeline.

## Troubleshooting: Traces Not Appearing

Follow this sequence before changing any backend config:

1. **Check `OTEL_ENABLED`** — confirm the env var is not set to `false` in the current shell or process environment.
2. **Verify endpoint connectivity** — `curl -v http://localhost:4317` (or the configured OTLP endpoint); a connection refused means the collector is not running or the port is wrong.
3. **Inspect collector logs** — look for receiver errors such as `failed to decode OTLP request` or TLS mismatches.
4. **Confirm Rust feature flag** — if using the Rust SDK, ensure `features = ["otel"]` is present in `Cargo.toml` for `iii-sdk`.
5. **Check sampling ratio** — a `sampling_ratio` below `1.0` will drop spans; set it to `1.0` temporarily to rule out sampling.
6. **Flush on shutdown** — call `shutdown_otel()` before process exit; buffered spans are lost if the process terminates without flushing.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Leaving `sampling_ratio: 1.0` in prod | Reduce to `0.1` or `0.01` for high-traffic |
| Not disabling in dev | Set `OTEL_ENABLED=false` locally to avoid noise |
| Missing `otel` feature flag in Rust | Add `features = ["otel"]` to iii-sdk in Cargo.toml |
| Not flushing on shutdown | Call `shutdown_otel()` before process exit |
| Custom metrics without labels | Always add context labels: `{ status, type, worker }` |
