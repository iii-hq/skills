/**
 * Pattern: Channels (Rust)
 * Comparable to: Unix pipes, gRPC streaming, WebSocket data streams
 *
 * Demonstrates binary streaming between workers: creating channels,
 * passing refs across functions, writing/reading binary data, and
 * using text messages for signaling.
 *
 * How-to references:
 *   - Channels: https://iii.dev/docs/how-to/use-channels
 */

use iii_sdk::{
    register_worker, InitOptions, RegisterFunction, TriggerRequest,
    ChannelReader, ChannelWriter, extract_channel_refs,
};
use serde_json::json;

// ---------------------------------------------------------------------------
// 1. Producer — creates a channel and streams binary data
// ---------------------------------------------------------------------------
async fn produce(iii: iii_sdk::III, records: Vec<serde_json::Value>) -> Result<serde_json::Value, String> {
    // Create a channel pair
    let channel = iii.create_channel(None).await.map_err(|e| e.to_string())?;

    // Pass the reader ref to the consumer via trigger
    iii.trigger(TriggerRequest {
        function_id: "pipeline::consume".into(),
        payload: json!({
            "reader_ref": channel.reader_ref,
            "record_count": records.len(),
        }),
        action: None,
        timeout_ms: None,
    })
    .await
    .map_err(|e| e.to_string())?;

    // Send metadata as a text message
    channel
        .writer
        .send_message(&serde_json::to_string(&json!({
            "type": "metadata",
            "format": "ndjson",
            "encoding": "utf-8",
        })).unwrap())
        .await
        .map_err(|e| e.to_string())?;

    // Stream records as binary data (newline-delimited JSON)
    for record in &records {
        let mut line = serde_json::to_string(record).unwrap();
        line.push('\n');
        channel
            .writer
            .write(line.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
    }

    // Signal end of stream
    channel.writer.close().await.map_err(|e| e.to_string())?;

    Ok(json!({ "status": "streaming", "records": records.len() }))
}

// ---------------------------------------------------------------------------
// 2. Consumer — receives a channel ref and reads the stream
// ---------------------------------------------------------------------------
async fn consume(iii: &iii_sdk::III, input: serde_json::Value) -> Result<serde_json::Value, String> {
    // Extract channel refs from the payload
    let refs = extract_channel_refs(&input);
    let reader_ref = refs
        .iter()
        .find(|(k, _)| k == "reader_ref")
        .map(|(_, r)| r.clone())
        .ok_or("missing reader_ref")?;

    // Create reader from the ref
    let reader = ChannelReader::new(iii.address(), &reader_ref);

    // Listen for text messages
    reader
        .on_message(|msg| {
            println!("Metadata: {}", msg);
        })
        .await;

    // Read entire binary stream
    let raw = reader.read_all().await.map_err(|e| e.to_string())?;
    let text = String::from_utf8(raw).map_err(|e| e.to_string())?;
    let records: Vec<serde_json::Value> = text
        .trim()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();

    Ok(json!({ "processed": records.len() }))
}
