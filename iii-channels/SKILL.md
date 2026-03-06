---
name: iii-channels
description: Creates WebSocket-based readable/writable stream pipes between iii worker functions, enabling high-throughput data transfer without JSON serialization. Use when streaming large files between functions, piping binary data (images, audio, video) across workers, building producer-consumer data pipelines, transferring files between functions, piping data between workers, or streaming inter-worker communication — especially when data is too large or too binary for standard trigger payloads.
---

# Channels: Worker-to-Worker Data Transfer

## Overview

iii Channels provide a WebSocket-based pipe between functions running on different workers. One function gets a **ChannelWriter** (Writable stream), another gets a **ChannelReader** (Readable stream). Pass channel refs in function invocation data to connect them. Use for large file transfers, streaming responses, or inter-worker communication.

## When to Use

- Streaming large files between functions (avoid serializing to JSON)
- Piping binary data (images, audio, video) between workers
- Building producer-consumer patterns across workers
- Long-running streaming responses

## Architecture

```
[Worker A: Writer] ──WebSocket──→ [iii Engine Channel] ──WebSocket──→ [Worker B: Reader]
                                        ↑
                         Channel created via engine::channels::create
```

## TypeScript: Create and Use Channels

```typescript
import { init } from 'iii-sdk'

const iii = init('ws://localhost:49134')

iii.registerFunction({ id: 'file.process' }, async (input) => {
  const channel = await iii.createChannel()

  iii.triggerVoid('file.compress', {
    inputRef: channel.readerRef,
  })

  channel.writer.stream.write(Buffer.from('Hello, World!'))
  channel.writer.stream.write(Buffer.from(' More data...'))
  channel.writer.close()

  return { channelId: channel.writerRef.channel_id }
})

iii.registerFunction({ id: 'file.compress' }, async (input) => {
  const chunks: Buffer[] = []

  return new Promise((resolve) => {
    input.inputRef.stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })

    input.inputRef.stream.on('end', () => {
      const total = Buffer.concat(chunks)
      resolve({ size: total.length, compressed: true })
    })
  })
})
```

## TypeScript: ChannelWriter API

```typescript
const channel = await iii.createChannel(bufferSize?)

channel.writer.stream        // Node.js Writable stream
channel.writer.sendMessage(msg: string)  // Send text message
channel.writer.close()       // Close the channel

channel.writerRef            // StreamChannelRef to pass to other functions
// { channel_id: string, access_key: string }
```

## TypeScript: ChannelReader API

```typescript
channel.reader.stream        // Node.js Readable stream
channel.reader.onMessage(callback: (msg: string) => void)  // Listen for text messages

channel.readerRef            // StreamChannelRef to pass to other functions
// { channel_id: string, access_key: string }
```

## Pattern: Large File Transfer

```typescript
import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

iii.registerFunction({ id: 'file.upload' }, async (input) => {
  const channel = await iii.createChannel()

  iii.triggerVoid('file.store', { ref: channel.readerRef })

  const fileStream = createReadStream(input.filePath)
  await pipeline(fileStream, channel.writer.stream)

  return { uploaded: true }
})

iii.registerFunction({ id: 'file.store' }, async (input) => {
  const outPath = `/tmp/received-${Date.now()}`
  const writeStream = createWriteStream(outPath)

  await pipeline(input.ref.stream, writeStream)

  return { stored: outPath }
})
```

## Pattern: Streaming Text Messages

```typescript
iii.registerFunction({ id: 'chat.producer' }, async (input) => {
  const channel = await iii.createChannel()

  iii.triggerVoid('chat.consumer', { ref: channel.readerRef })

  for (const msg of input.messages) {
    channel.writer.sendMessage(JSON.stringify(msg))
  }
  channel.writer.close()

  return { sent: input.messages.length }
})

iii.registerFunction({ id: 'chat.consumer' }, async (input) => {
  const messages: any[] = []

  return new Promise((resolve) => {
    input.ref.onMessage((msg: string) => {
      messages.push(JSON.parse(msg))
    })

    input.ref.stream.on('end', () => {
      resolve({ received: messages.length, messages })
    })
  })
})
```

## Pattern: Error Handling and Data Integrity

```typescript
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

iii.registerFunction({ id: 'file.upload.safe' }, async (input) => {
  const channel = await iii.createChannel()

  // Compute checksum before sending
  const hash = createHash('sha256')
  const fileStream = createReadStream(input.filePath)
  for await (const chunk of fileStream) {
    hash.update(chunk)
  }
  const checksum = hash.digest('hex')

  iii.triggerVoid('file.store.safe', {
    ref: channel.readerRef,
    checksum,
    size: input.expectedSize,
  })

  const sendStream = createReadStream(input.filePath)
  sendStream.on('error', (err) => {
    channel.writer.close()
    throw err
  })

  try {
    await pipeline(sendStream, channel.writer.stream)
  } catch (err) {
    // pipeline calls close on the writable automatically on error
    throw new Error(`Upload failed mid-transfer: ${err.message}`)
  }

  return { uploaded: true, checksum }
})

iii.registerFunction({ id: 'file.store.safe' }, async (input) => {
  const outPath = `/tmp/received-${Date.now()}`
  const writeStream = createWriteStream(outPath)
  const hash = createHash('sha256')
  let bytesReceived = 0

  return new Promise((resolve, reject) => {
    input.ref.stream.on('data', (chunk: Buffer) => {
      hash.update(chunk)
      bytesReceived += chunk.length
    })

    input.ref.stream.on('error', (err) => {
      reject(new Error(`Stream error after ${bytesReceived} bytes: ${err.message}`))
    })

    input.ref.stream.on('end', () => {
      const receivedChecksum = hash.digest('hex')
      if (receivedChecksum !== input.checksum) {
        reject(new Error(`Checksum mismatch: expected ${input.checksum}, got ${receivedChecksum}`))
        return
      }
      resolve({ stored: outPath, size: bytesReceived, verified: true })
    })

    pipeline(input.ref.stream, writeStream).catch(reject)
  })
})
```

## Python: Channels

```python
from iii import III, init, ChannelWriter, ChannelReader

iii_client = init('ws://localhost:49134')

async def file_sender(input):
    channel = await iii_client.create_channel()

    iii_client.trigger_void('file.receiver', {'ref': channel.reader_ref})

    await channel.writer.write(b'Hello from Python!')
    await channel.writer.close()

    return {'sent': True}

iii_client.register_function('file.sender', file_sender)
```

## Rust: Channels

```rust
use iii_sdk::{III, ChannelWriter, ChannelReader, init, InitOptions};
use serde_json::json;

let iii = init("ws://127.0.0.1:49134", InitOptions::default())?;

iii.register_function("file.sender", move |input| {
    let iii = iii.clone();
    async move {
        let channel = iii.create_channel(None).await?;

        iii.trigger_void("file.receiver", json!({
            "ref": channel.reader_ref
        }))?;

        channel.writer.write(b"Hello from Rust!").await?;
        channel.writer.close().await?;

        Ok(json!({"sent": true}))
    }
});
```

## Internals

- Channels use WebSocket at `ws://<engine>/ws/channels/<channel_id>?key=<access_key>&dir=read|write`
- Frame size: 64KB chunks (auto-chunked by ChannelWriter)
- Channel refs (`StreamChannelRef`) are auto-detected in invocation data via `is_channel_ref()`
- Close codes: `1000` with reason `stream_complete` or `channel_close`

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Passing the Channel object instead of ref | Pass `channel.readerRef` / `channel.writerRef` in trigger data |
| Not closing the writer | Always call `channel.writer.close()` when done writing |
| Reading before writer connects | Reader auto-connects on first `.read()` — no race condition |
| Using channels for small JSON data | Use `trigger()` for small data — channels are for streams/binary |
