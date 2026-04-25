// ops/indexer/indexer.ts
// Minimal Node.js TypeScript skeleton for an embedding indexer worker.
// Responsibilities:
// - Listen for new documents (RabbitMQ / NATS)
// - Call Triton / ONNX to compute embeddings
// - Write embeddings + metadata to Postgres (pgvector via Drizzle) and/or Qdrant
// - Publish "documents.processed" event

import amqp from 'amqplib';
import fetch from 'node-fetch';

const RABBIT_URL = process.env.RABBIT_URL || 'amqp://localhost';
const TRITON_URL = process.env.TRITON_URL || 'http://localhost:8000/v2/models/legal_embedding/infer';

async function callTriton(texts: string[]) {
  // Triton HTTP v2 simple payload - adapt to your model's signature
  const payload = {
    inputs: [
      {
        name: 'input__0',
        shape: [texts.length],
        datatype: 'BYTES',
        contents: { bytes: texts }
      }
    ]
  } as any;

  const res = await fetch(TRITON_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error(`Triton error: ${res.status} ${res.statusText}`);
  const body = await res.json();
  // TODO: map body to Float32Array embeddings based on your model outputs
  return body.outputs || [];
}

async function start() {
  const conn = await amqp.connect(RABBIT_URL);
  const ch = await conn.createChannel();
  const q = 'documents.uploaded';
  await ch.assertQueue(q, { durable: true });
  console.log('Indexer: waiting for messages...');

  ch.consume(q, async (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      // expected payload: { documentId, chunks: [{ id, text }] }
      const texts = (payload.chunks || []).map((c: any) => c.text || '');
      const embeddings = await callTriton(texts);
      // TODO: write embeddings to Postgres/pgvector and/or Qdrant
      console.log(`Indexed document ${payload.documentId} -> ${embeddings.length} embeddings`);
      // TODO: publish documents.processed event with metadata
      ch.ack(msg);
    } catch (err) {
      console.error('Indexer error', err);
      // optionally nack and requeue
      ch.nack(msg, false, false);
    }
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
