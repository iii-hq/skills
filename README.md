# iii Skills

[Agent Skills](https://agentskills.io) for building with the [iii engine](https://github.com/iii-hq/iii) — functions, triggers, workers, state, streams, and more.

Works with Claude Code, Cursor, Gemini CLI, OpenCode, Amp, Goose, Roo Code, GitHub Copilot, VS Code, OpenAI Codex, and [30+ other agents](https://agentskills.io).

## Install

### One command

```bash
npx skills add iii-hq/skills
```

### SkillKit

```bash
# Install all iii skills
npx skillkit install iii-hq/skills

# Install a single skill
npx skillkit install iii-rest-api

# Translate to another agent format
npx skillkit translate iii-rest-api --agent cursor
npx skillkit translate iii-rest-api --agent gemini-cli

# Sync skills across all your agents
npx skillkit sync
```

### Git clone

```bash
# Claude Code
git clone https://github.com/iii-hq/skills.git ~/.claude/skills/iii

# Cursor
git clone https://github.com/iii-hq/skills.git .cursor/skills/iii

# Gemini CLI
git clone https://github.com/iii-hq/skills.git .gemini/skills/iii

# Or symlink individual skills
ln -s /path/to/skills/iii-rest-api ~/.claude/skills/iii-rest-api
```

### Multi-agent sync

If you use multiple agents, SkillKit keeps skills in sync across all of them:

```bash
# Install once, sync to Claude Code + Cursor + Gemini CLI
npx skillkit install iii-hq/skills
npx skillkit sync --agents claude-code,cursor,gemini-cli

# Or translate all skills to a specific agent
npx skillkit translate iii-hq/skills --agent cursor
```

Supports 32+ agents including Claude Code, Cursor, Codex, Gemini CLI, OpenCode, Amp, Goose, Roo Code, GitHub Copilot, and more.

## Skills

### SDK Reference

| Skill | What it does |
|-------|-------------|
| [iii-python-sdk](./iii-python-sdk) | Register async functions, triggers, state, and streams in Python |
| [iii-rust-sdk](./iii-rust-sdk) | Native async Rust — closures, Streams helper, UpdateBuilder, TriggerHandler |

### Core Patterns

| Skill | What it does |
|-------|-------------|
| [iii-rest-api](./iii-rest-api) | HTTP endpoints, route handlers, CORS, path params, error responses |
| [iii-background-jobs](./iii-background-jobs) | Queue triggers, job chaining, retry patterns, dead-letter handling |
| [iii-cron-tasks](./iii-cron-tasks) | Cron expressions, scheduled tasks, timezone handling |
| [iii-workflows](./iii-workflows) | Multi-step pipelines, fan-out/fan-in, saga compensation |
| [iii-state-management](./iii-state-management) | Key-value state, streams, custom adapters, atomic updates |
| [iii-realtime-streaming](./iii-realtime-streaming) | WebSocket/SSE streaming, browser clients, React hooks |
| [iii-pubsub](./iii-pubsub) | Topic broadcasting, fan-out, state triggers, cross-service events |
| [iii-channels](./iii-channels) | Binary data streaming between workers, 64KB frame protocol |

### Advanced

| Skill | What it does |
|-------|-------------|
| [iii-multi-trigger](./iii-multi-trigger) | Multiple triggers on one function, ctx.match() routing |
| [iii-custom-triggers](./iii-custom-triggers) | TriggerHandler interface, webhooks, file watchers, polling |
| [iii-ai-agents](./iii-ai-agents) | ReAct loops, RAG pipelines, multi-agent orchestration |
| [iii-testing](./iii-testing) | Mock init(), vitest setup, step testing |

### Operations

| Skill | What it does |
|-------|-------------|
| [iii-deployment](./iii-deployment) | Docker, config.yaml, production checklist |
| [iii-observability](./iii-observability) | OpenTelemetry, Prometheus, custom spans/metrics |

## Format

Each skill follows the [Agent Skills specification](https://agentskills.io/specification):

```
iii-rest-api/
└── SKILL.md    # YAML frontmatter (name + description) + markdown instructions
```

Skills are activated automatically when the agent detects a matching task based on the description field.

## Contributing

1. Fork this repo
2. Add or edit a skill in its own folder
3. Submit a PR

## License

Apache-2.0
