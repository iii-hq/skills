---
name: iii-ai-agents
description: Creates and configures AI agents, implements RAG pipelines, and builds LLM-powered workflows using iii-sdk or motia primitives — including ReAct reasoning loops, multi-agent orchestration, tool-use patterns, and conversation state management. Use when building AI agents, chatbots, LLM-powered API endpoints, RAG pipelines, multi-step AI workflows (research → analyze → summarize), function-calling patterns, or replacing LangChain, CrewAI, or custom agent code with iii-sdk or motia.
---

# AI Agents on iii

## Overview

Build AI agents using iii primitives: a **Function** wraps each LLM call, **Queue triggers** chain reasoning steps, **State** persists conversation history, and **HTTP triggers** expose the agent as an API. No agent framework needed — iii primitives compose into any agent architecture.

## When to Use

- Building AI agents or chatbots
- LLM-powered API endpoints
- RAG (Retrieval-Augmented Generation) pipelines
- Multi-step AI workflows (research → analyze → summarize)
- Tool-use / function-calling patterns
- Replacing LangChain, CrewAI, or custom agent code

## Quick Reference

| Pattern | Use When |
|---------|----------|
| **Simple AI API** | Single LLM call exposed as an HTTP endpoint |
| **ReAct Agent** | Agent needs iterative reason → tool → reason loops |
| **RAG Pipeline** | Query requires context retrieval before generation |
| **Multi-Agent System** | Task requires parallel specialised sub-agents with a planner/synthesizer |
| **Conversation State** | Chat session must persist message history across requests |

---

## Pattern: Simple AI API

**One HTTP trigger → one LLM call → return reply.** Use this as the baseline; add queue chaining only when multiple steps are needed.

```typescript
import { init } from 'iii-sdk'

const iii = init('ws://localhost:49134')

iii.registerFunction({ id: 'ai.chat' }, async (input) => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: input.message }],
    }),
  })

  const data = await response.json()
  return { reply: data.content[0].text }
})

iii.registerTrigger({
  type: 'http',
  function_id: 'ai.chat',
  config: { api_path: '/chat', http_method: 'POST' },
})
```

---

## Pattern: ReAct Agent (Reason + Act Loop)

**Recursive queue calls drive the think → tool → think cycle.** Always pass `maxSteps` to prevent unbounded loops.

```typescript
iii.registerFunction({ id: 'agent.think' }, async (input) => {
  const { messages, tools, maxSteps = 5, step = 0 } = input

  const response = await callLLM({ messages, tools })

  if (response.tool_use && step < maxSteps) {
    const toolResult = await iii.trigger(`tool.${response.tool_use.name}`, response.tool_use.input)

    messages.push({ role: 'assistant', content: response.raw })
    messages.push({ role: 'user', content: JSON.stringify(toolResult) })

    return iii.trigger('agent.think', { messages, tools, maxSteps, step: step + 1 })
  }

  return { reply: response.text, steps: step }
})

iii.registerTrigger({ type: 'queue', function_id: 'agent.think', config: { topic: 'agent.think' } })
```

---

## Pattern: RAG Pipeline (Motia)

**Three chained queue steps: receive → retrieve → generate.** State tracks each query by `queryId` so results are accessible after the async pipeline completes.

### Step 1 — Receive Query

```typescript
import { z } from 'zod'
import type { Handlers, StepConfig } from 'motia'

export const config = {
  name: 'ReceiveQuery',
  triggers: [{ type: 'http', method: 'POST', path: '/ask',
    bodySchema: z.object({ query: z.string() }) }],
  enqueues: ['rag.retrieve'],
  flows: ['rag'],
} as const satisfies StepConfig

export const handler: Handlers<typeof config> = async (req, { enqueue }) => {
  const queryId = `q-${Date.now()}`
  await enqueue({ topic: 'rag.retrieve', data: { queryId, query: req.body.query } })
  return { status: 202, body: { queryId } }
}
```

### Step 2 — Retrieve Context

```typescript
import { step, queue } from 'motia'

export const stepConfig = {
  name: 'RetrieveContext',
  triggers: [queue('rag.retrieve')],
  enqueues: ['rag.generate'],
  flows: ['rag'],
}

export const { config, handler } = step(stepConfig, async (_input, ctx) => {
  const { queryId, query } = ctx.getData()

  const chunks = await vectorSearch(query, { topK: 5 })
  await ctx.state.set('queries', queryId, { query, chunks, status: 'retrieved' })

  await ctx.enqueue({ topic: 'rag.generate', data: { queryId, query, context: chunks } })
})
```

### Step 3 — Generate Answer

```typescript
export const stepConfig = {
  name: 'GenerateAnswer',
  triggers: [queue('rag.generate')],
  enqueues: [],
  flows: ['rag'],
}

export const { config, handler } = step(stepConfig, async (_input, ctx) => {
  const { queryId, query, context } = ctx.getData()

  const answer = await callLLM({
    messages: [{
      role: 'user',
      content: `Context:\n${context.map(c => c.text).join('\n')}\n\nQuestion: ${query}`,
    }],
  })

  await ctx.state.set('queries', queryId, { query, answer: answer.text, status: 'complete' })
})
```

---

## Pattern: Multi-Agent System

**An orchestrator fans out to specialised agents in parallel, then a synthesizer merges results.** Register a queue trigger for every agent function.

```typescript
iii.registerFunction({ id: 'orchestrator' }, async (input) => {
  const plan = await iii.trigger('agent.planner', { task: input.task })

  const results = await Promise.all(
    plan.steps.map((step) => iii.trigger(`agent.${step.agent}`, step.input))
  )

  return iii.trigger('agent.synthesizer', { task: input.task, results })
})

iii.registerFunction({ id: 'agent.planner' }, async (input) => {
  return callLLM({ messages: [{ role: 'user', content: `Plan steps for: ${input.task}` }] })
})

iii.registerFunction({ id: 'agent.researcher' }, async (input) => {
  return callLLM({ messages: [{ role: 'user', content: `Research: ${input.topic}` }] })
})

iii.registerFunction({ id: 'agent.synthesizer' }, async (input) => {
  return callLLM({
    messages: [{ role: 'user', content: `Synthesize results for "${input.task}": ${JSON.stringify(input.results)}` }],
  })
})

for (const fn of ['orchestrator', 'agent.planner', 'agent.researcher', 'agent.synthesizer']) {
  iii.registerTrigger({ type: 'queue', function_id: fn, config: { topic: fn } })
}
```

---

## Pattern: AI with Conversation State

**Load history from state, append the new turn, call the LLM, persist the updated history.** Keyed by `sessionId` so each conversation is isolated.

```typescript
iii.registerFunction({ id: 'chat.message' }, async (input) => {
  const history = await state.get({ scope: 'conversations', key: input.sessionId }) ?? []

  history.push({ role: 'user', content: input.message })

  const response = await callLLM({ messages: history })
  history.push({ role: 'assistant', content: response.text })

  await state.set({ scope: 'conversations', key: input.sessionId, data: history })

  return { reply: response.text, sessionId: input.sessionId }
})
```

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Putting entire agent loop in one function | Break into steps: think → tool → think. Use queue chaining |
| Not persisting conversation state | Use `state.set()` to save messages between requests |
| Unbounded ReAct loops | Always set `maxSteps` and track `step` counter |
| Blocking on LLM calls in cron | Enqueue LLM work to a queue — don't block the cron handler |
