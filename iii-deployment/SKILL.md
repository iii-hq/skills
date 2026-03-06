---
name: iii-deployment
description: Configures Docker containers, sets up OpenTelemetry monitoring and Prometheus metrics, and tunes engine parameters for iii (a Rust-based event engine) deployments. Generates production-ready config.yaml, Docker Compose files, worker Dockerfiles, and SDK telemetry initialization code. Use when deploying iii to production, containerizing iii with Docker, configuring observability, logging, or metrics collection, setting up Redis adapters for multi-instance scaling, or performance tuning iii-sdk or motia engine configuration.
---

# Deploying iii to Production

## Overview

iii runs as a single Rust binary (`iii` or `iii-cli`) with a YAML config. Workers connect via WebSocket. Deploy the engine, point workers at it, configure modules for your infrastructure.

## When to Use

- Deploying iii engine to production
- Setting up Docker/Docker Compose for iii
- Configuring OpenTelemetry observability
- Setting up Redis adapters for multi-instance
- Production-hardening engine configuration

## Quick Start

```bash
curl -fsSL https://install.iii.dev/iii/main/install.sh | sh
iii-cli start
iii-cli console
```

## Production config.yaml

```yaml
modules:
  - class: modules::api::RestApiModule
    config:
      port: ${API_PORT:3111}
      host: 0.0.0.0
      default_timeout: 30000
      concurrency_request_limit: 1024
      cors:
        allowed_origins:
          - ${FRONTEND_URL:http://localhost:3000}
        allowed_methods: [GET, POST, PUT, DELETE, OPTIONS]

  - class: modules::state::StateModule
    config:
      adapter:
        class: modules::state::adapters::KvStore
        config:
          store_method: file_based
          file_path: ${STATE_PATH:./data/state_store.db}

  - class: modules::stream::StreamModule
    config:
      port: ${STREAMS_PORT:3112}
      host: 0.0.0.0
      adapter:
        class: modules::stream::adapters::RedisAdapter
        config:
          redis_url: ${REDIS_URL:redis://localhost:6379}

  - class: modules::event::EventModule
    config:
      adapter:
        class: modules::event::RedisAdapter
        config:
          redis_url: ${REDIS_URL:redis://localhost:6379}

  - class: modules::cron::CronModule
    config:
      adapter:
        class: modules::cron::KvCronAdapter

  - class: modules::pubsub::PubSubModule
    config:
      adapter:
        class: modules::pubsub::LocalAdapter

  - class: modules::kv_server::KvServer
    config:
      store_method: file_based
      file_path: ${KV_PATH:./data/kv_store}
      save_interval_ms: 5000

  - class: modules::observability::OtelModule
    config:
      enabled: ${OTEL_ENABLED:true}
      service_name: ${OTEL_SERVICE_NAME:iii-engine}
      service_version: ${SERVICE_VERSION:1.0.0}
      exporter: ${OTEL_EXPORTER_TYPE:both}
      endpoint: ${OTEL_EXPORTER_OTLP_ENDPOINT:http://localhost:4317}
      sampling_ratio: ${OTEL_SAMPLING_RATIO:1.0}
      metrics_enabled: true
      metrics_exporter: ${OTEL_METRICS_EXPORTER:both}
      prometheus_port: ${PROMETHEUS_PORT:9464}
      logs_enabled: true
      logs_exporter: ${OTEL_LOGS_EXPORTER:both}
      worker_metrics:
        enabled: true
        collection_interval_seconds: 5
        history_size: 60
```

> **Multi-instance note:** For multi-instance deployments, switch `EventModule`, `StreamModule`, and `PubSubModule` adapters to their Redis variants (as shown above). `LocalAdapter` only works within a single engine process.

## Docker Compose

```yaml
version: '3.8'

services:
  iii-engine:
    image: iiidev/iii:latest
    ports:
      - "3111:3111"
      - "3112:3112"
      - "49134:49134"
      - "9464:9464"
    volumes:
      - ./config.yaml:/app/config.yaml
      - iii-data:/app/data
    environment:
      - REDIS_URL=redis://redis:6379
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
    depends_on:
      - redis

  worker:
    build: .
    environment:
      - III_BRIDGE_URL=ws://iii-engine:49134
    depends_on:
      - iii-engine

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    ports:
      - "4317:4317"
      - "4318:4318"
    volumes:
      - ./otel-collector-config.yaml:/etc/otel/config.yaml

volumes:
  iii-data:
```

## Worker Dockerfile

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
ENV III_BRIDGE_URL=ws://iii-engine:49134
CMD ["node", "dist/index.js"]
```

## SDK Telemetry Setup

```typescript
import { init } from 'iii-sdk'

const iii = init(process.env.III_BRIDGE_URL ?? 'ws://localhost:49134', {
  otel: {
    enabled: true,
    serviceName: 'my-worker',
    serviceVersion: '1.0.0',
    metricsEnabled: true,
    metricsExportIntervalMs: 10000,
    reconnectionConfig: { maxRetries: 10 },
  },
})
```

## Ports Reference

| Port | Service | Description |
|------|---------|-------------|
| 3111 | REST API | HTTP endpoints |
| 3112 | Streams | WebSocket/SSE streaming |
| 49134 | Engine WS | Worker connections |
| 9464 | Prometheus | Metrics scraping |
| 4317 | OTLP gRPC | OpenTelemetry traces/metrics |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `III_BRIDGE_URL` | `ws://localhost:49134` | Engine WebSocket URL |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `OTEL_ENABLED` | `true` | Enable OpenTelemetry |
| `OTEL_SERVICE_NAME` | `iii-engine` | Service name for traces |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OTLP collector endpoint |

## Health Check

```bash
curl http://localhost:3111/health
```

## Validating a Deployment

After starting the stack with `docker compose up -d`, verify each layer in order:

```bash
# 1. Engine is healthy
curl -f http://localhost:3111/health

# 2. Prometheus metrics endpoint is reachable
curl -s http://localhost:9464/metrics | head -5

# 3. Redis is accepting connections
docker compose exec redis redis-cli ping   # expected: PONG

# 4. Worker logs show a successful connection
docker compose logs worker | grep -i "connected"
```

Expected outcomes:
- `/health` returns HTTP 200
- `/metrics` returns Prometheus-formatted text
- Redis responds `PONG`
- Worker logs contain a line confirming the WebSocket connection to the engine

## Troubleshooting Worker Connections

If workers fail to connect to the engine:

1. **Check engine logs** — confirm the engine started and is listening on port 49134:
   ```bash
   docker compose logs iii-engine | grep 49134
   ```
2. **Verify network connectivity** — the worker container must reach the engine host:
   ```bash
   docker compose exec worker wget -q --spider ws://iii-engine:49134 || echo "unreachable"
   ```
3. **Confirm `III_BRIDGE_URL`** — ensure the env var in the worker matches the engine's host and port (use the Docker service name, not `localhost`, when running inside Compose).
4. **Check `depends_on` ordering** — workers starting before the engine is ready will fail to connect; add a health check to the engine service and use `depends_on: condition: service_healthy` in Compose.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Binding to `127.0.0.1` in Docker | Use `0.0.0.0` for host in container |
| Using LocalAdapter in multi-instance | Switch to RedisAdapter for events/streams/pubsub |
| Missing volume for state data | Mount `./data` to persist KV store across restarts |
| Workers connecting before engine ready | Add `depends_on` + health check in Docker Compose |
| Not setting `OTEL_ENABLED=false` in dev | Disable telemetry locally to reduce noise |
