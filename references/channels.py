"""
Pattern: Channels (Python)
Comparable to: Unix pipes, gRPC streaming, WebSocket data streams

Demonstrates binary streaming between workers: creating channels,
passing refs across functions, writing/reading binary data, and
using text messages for signaling.

How-to references:
  - Channels: https://iii.dev/docs/how-to/use-channels
"""

import json
import os

from iii import InitOptions, Logger, register_worker

engine_url = os.environ.get("III_ENGINE_URL", "ws://localhost:49134")
iii = register_worker(
    address=engine_url,
    options=InitOptions(worker_name="channels-example"),
)

# ---------------------------------------------------------------------------
# 1. Producer — creates a channel and streams data through it
# ---------------------------------------------------------------------------
async def produce(data):
    logger = Logger(service_name="pipeline::produce")

    # Create a channel pair
    channel = await iii.create_channel_async()

    # Pass the reader ref to the consumer via trigger
    await iii.trigger({
        "function_id": "pipeline::consume",
        "payload": {
            "reader_ref": channel.reader_ref.__dict__,
            "record_count": len(data.get("records", [])),
        },
    })

    # Send metadata as a text message
    await channel.writer.send_message_async(
        json.dumps({"type": "metadata", "format": "ndjson", "encoding": "utf-8"})
    )

    # Stream records as binary data (newline-delimited JSON)
    for record in data.get("records", []):
        line = json.dumps(record) + "\n"
        await channel.writer.write(line.encode("utf-8"))

    # Signal end of stream
    await channel.writer.close_async()
    logger.info("Producer finished streaming", {"records": len(data.get("records", []))})

    return {"status": "streaming"}

iii.register_function("pipeline::produce", produce)

# ---------------------------------------------------------------------------
# 2. Consumer — receives a channel ref and reads the stream
# ---------------------------------------------------------------------------
async def consume(data):
    logger = Logger(service_name="pipeline::consume")

    # Reconstruct reader from the ref passed in the payload
    reader = iii.create_channel_reader(data["reader_ref"])

    # Listen for text messages (metadata, signaling)
    messages = []
    reader.on_message(lambda msg: messages.append(json.loads(msg)))

    # Read entire binary stream
    raw = await reader.read_all()
    lines = raw.decode("utf-8").strip().split("\n")
    records = [json.loads(line) for line in lines]

    logger.info("Consumer processed records", {"count": len(records)})
    return {"processed": len(records)}

iii.register_function("pipeline::consume", consume)

# ---------------------------------------------------------------------------
# 3. HTTP trigger to kick off the pipeline
# ---------------------------------------------------------------------------
iii.register_trigger({
    "type": "http",
    "function_id": "pipeline::produce",
    "config": {"api_path": "pipeline/start", "http_method": "POST"},
})
