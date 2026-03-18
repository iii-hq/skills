/**
 * Pattern: Traditional Backend Adaptation
 * Comparable to: Ruby on Rails, Java Spring Boot, Express.js
 *
 * Demonstrates adapting a familiar REST API for a blog into iii,
 * with optional state-backed persistence and middleware-like
 * cross-cutting concerns (auth, logging) via function composition.
 *
 * How-to references:
 *   - HTTP endpoints:   https://iii.dev/docs/how-to/expose-http-endpoint
 *   - State management: https://iii.dev/docs/how-to/manage-state
 *   - Cron:             https://iii.dev/docs/how-to/schedule-cron-task
 */

import { registerWorker, Logger, TriggerAction } from 'iii-sdk'

const iii = registerWorker(process.env.III_ENGINE_URL || 'ws://localhost:49134', {
  workerName: 'traditional-backend',
})

// ---------------------------------------------------------------------------
// "Middleware" adaptation — auth check as a composable function
// ---------------------------------------------------------------------------
iii.registerFunction({ id: 'blog::authenticate' }, async (data) => {
  if (!data.token || data.token !== 'valid-token') {
    throw new Error('Unauthorized')
  }
  return { user_id: 'user-1', role: 'admin' }
})

// ---------------------------------------------------------------------------
// Optional state-backed helpers for the posts collection
// ---------------------------------------------------------------------------
async function findPost(id) {
  return await iii.trigger({ function_id: 'state::get', payload: { scope: 'posts', key: id } })
}

async function listPosts() {
  return await iii.trigger({ function_id: 'state::list', payload: { scope: 'posts' } })
}

async function savePost(post) {
  await iii.trigger({ function_id: 'state::set', payload: {
    scope: 'posts',
    key: post.id,
    value: { _key: post.id, ...post },
  } })
  return post
}

async function deletePost(id) {
  await iii.trigger({ function_id: 'state::delete', payload: { scope: 'posts', key: id } })
}

// ---------------------------------------------------------------------------
// "Routes" — standard REST endpoints
// ---------------------------------------------------------------------------

// GET /posts — index
iii.registerFunction({ id: 'blog::list-posts' }, async () => {
  const posts = await listPosts()
  return posts.map(({ id, title, author, created_at }) => ({ id, title, author, created_at }))
})

// GET /posts/show — show (pass { id } in query/body)
iii.registerFunction({ id: 'blog::get-post' }, async (data) => {
  const post = await findPost(data.id)
  if (!post) throw new Error('NotFound')
  return post
})

// POST /posts — create (authenticated)
iii.registerFunction({ id: 'blog::create-post' }, async (data) => {
  const logger = new Logger()
  const user = await iii.trigger({ function_id: 'blog::authenticate', payload: { token: data.token } })

  const post = {
    id: `post-${Date.now()}`,
    title: data.title,
    body: data.body,
    author: user.user_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  await savePost(post)
  logger.info('Post created', { id: post.id })

  // Broadcast for subscribers (RSS feed, search index, etc.)
  iii.trigger({ function_id: 'publish', payload: { topic: 'blog.post.created', data: post }, action: TriggerAction.Void() })

  return post
})

// POST /posts/update — update (authenticated)
iii.registerFunction({ id: 'blog::update-post' }, async (data) => {
  const user = await iii.trigger({ function_id: 'blog::authenticate', payload: { token: data.token } })
  const post = await findPost(data.id)

  if (!post) throw new Error('NotFound')
  if (post.author !== user.user_id) throw new Error('Forbidden')

  const updated = {
    ...post,
    title: data.title ?? post.title,
    body: data.body ?? post.body,
    updated_at: new Date().toISOString(),
  }

  await savePost(updated)
  return updated
})

// POST /posts/delete — delete (authenticated)
iii.registerFunction({ id: 'blog::delete-post' }, async (data) => {
  const user = await iii.trigger({ function_id: 'blog::authenticate', payload: { token: data.token } })
  const post = await findPost(data.id)

  if (!post) throw new Error('NotFound')
  if (post.author !== user.user_id) throw new Error('Forbidden')

  await deletePost(data.id)
  return { deleted: data.id }
})

// Wire up HTTP routes
iii.registerTrigger({ type: 'http', function_id: 'blog::list-posts', config: { api_path: '/posts', http_method: 'GET' } })
iii.registerTrigger({ type: 'http', function_id: 'blog::get-post', config: { api_path: '/posts/show', http_method: 'GET' } })
iii.registerTrigger({ type: 'http', function_id: 'blog::create-post', config: { api_path: '/posts', http_method: 'POST' } })
iii.registerTrigger({ type: 'http', function_id: 'blog::update-post', config: { api_path: '/posts/update', http_method: 'POST' } })
iii.registerTrigger({ type: 'http', function_id: 'blog::delete-post', config: { api_path: '/posts/delete', http_method: 'POST' } })

// ---------------------------------------------------------------------------
// Scheduled work — sitemap generation (like a Rails cron task)
// ---------------------------------------------------------------------------
iii.registerFunction({ id: 'blog::generate-sitemap' }, async () => {
  const logger = new Logger()
  const posts = await listPosts()

  const urls = posts.map((p) => ({
    url: `/posts/${p.id}`,
    lastmod: p.updated_at,
  }))

  await iii.trigger({ function_id: 'state::set', payload: {
    scope: 'blog-meta',
    key: 'sitemap',
    value: { _key: 'sitemap', urls, generated_at: new Date().toISOString() },
  } })

  logger.info('Sitemap generated', { pages: urls.length })
  return { pages: urls.length }
})

iii.registerTrigger({
  type: 'cron',
  function_id: 'blog::generate-sitemap',
  config: { expression: '0 0 3 * * * *' }, // 3 AM daily
})
