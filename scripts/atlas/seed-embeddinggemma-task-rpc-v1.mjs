#!/usr/bin/env node
/**
 * scripts/atlas/seed-embeddinggemma-task-rpc-v1.mjs
 *
 * Replaces SYNTHETIC_TEST_VECTOR with real dense 768-D embeddings from local EmbeddingGemma:
 * 1. Streams tasks from docs/reports/openspec-task-concept-tie-v2.20261107T214110Z.rows.jsonl.
 * 2. Batches text strings to Ollama /api/embed (model: embeddinggemma:latest).
 * 3. Computes Matryoshka Representation Learning (MRL) 64-D low-rank slice:
 *    latent_64 = L2_normalize(embedding[0..64]).
 * 4. Writes binary float32-le buffer to .tmp/atlas/openspec-task-lowrank-keyframes.embeddinggemma.latent64.f32le.bin.
 * 5. Emits Qualified RPC Result Envelope with cryptographic SHA-256 integrity digest.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';

const ROOT = process.cwd();
const INPUT = path.join(ROOT, 'docs/reports/openspec-task-concept-tie-v2.20261107T214110Z.rows.jsonl');
const OUT_BIN = path.join(ROOT, '.tmp/atlas/openspec-task-lowrank-keyframes.embeddinggemma.latent64.f32le.bin');
const OUT_RECEIPT = path.join(ROOT, 'docs/reports/openspec-embeddinggemma-lowrank-rpc-receipt-v1.json');
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const MODEL = process.env.EMBEDDING_MODEL || 'embeddinggemma:latest';
const BATCH_SIZE = 64;

const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 6527;

function sha256Hex(buf) {
  return 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex');
}

async function embedBatch(texts) {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!res.ok) {
    throw new Error(`Ollama embed error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.embeddings;
}

function normalizeSlice64(vec768) {
  const slice64 = vec768.slice(0, 64);
  let norm = 0;
  for (let i = 0; i < 64; i++) norm += slice64[i] * slice64[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < 64; i++) slice64[i] /= norm;
  }
  return slice64;
}

async function main() {
  console.log(`Loading tasks from ${INPUT} (limit: ${LIMIT})...`);
  const tasks = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    tasks.push(JSON.parse(line));
    if (tasks.length >= LIMIT) break;
  }

  console.log(`Loaded ${tasks.length} tasks. Generating EmbeddingGemma dense embeddings on ${OLLAMA_URL}...`);
  fs.mkdirSync(path.dirname(OUT_BIN), { recursive: true });

  const totalBytes = tasks.length * 64 * 4; // float32 = 4 bytes
  const binBuffer = Buffer.alloc(totalBytes);
  let offset = 0;
  const startTime = Date.now();

  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(t => `${t.task_id} ${t.matched_term || ''} ${t.concept_id || ''}`);
    const embeddings = await embedBatch(texts);

    for (let j = 0; j < embeddings.length; j++) {
      const slice64 = normalizeSlice64(embeddings[j]);
      for (let k = 0; k < 64; k++) {
        binBuffer.writeFloatLE(slice64[k], offset);
        offset += 4;
      }
    }

    if ((i + BATCH_SIZE) % 512 === 0 || i + BATCH_SIZE >= tasks.length) {
      const progress = Math.min(i + BATCH_SIZE, tasks.length);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  Processed ${progress}/${tasks.length} tasks (${elapsed}s)...`);
    }
  }

  fs.writeFileSync(OUT_BIN, binBuffer);
  const binSha = sha256Hex(binBuffer);

  const receipt = {
    schema: 'atlas.openspec-embeddinggemma-lowrank-rpc.v1',
    status: 'REAL_MODEL_EMBEDDING_COMPLETE',
    canonicalAuthority: false,
    model: MODEL,
    endpoint: OLLAMA_URL,
    numTasks: tasks.length,
    embeddingDim: 768,
    mrlDim: 64,
    dtype: 'float32-le',
    totalBytes,
    binarySha256: binSha,
    binaryPath: OUT_BIN,
    durationMs: Date.now() - startTime,
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(OUT_RECEIPT, JSON.stringify(receipt, null, 2) + '\n');
  console.log(`\nReceipt written to ${OUT_RECEIPT}`);
  console.log(`Binary written to ${OUT_BIN} (${totalBytes} bytes, ${binSha})`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
