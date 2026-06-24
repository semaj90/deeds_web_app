#!/usr/bin/env node

/**
 * Day 3: RabbitMQ Worker Pool for Stages 1 & 2
 *
 * Architecture:
 *   Producer: Enqueue chunks → RabbitMQ (summary.generation + gpu.reranking)
 *   Workers: 4-8 processes, each processes Stage 1 (Gemma4 + Bifrost) + Stage 2 (GPU)
 *   Result: Parallel execution → 4-8× speedup vs sequential
 *
 * Flow:
 *   Chunk → summary.generation queue → Worker (Stage 1: Gemma4 + LangExtract + Bifrost)
 *     → Update Postgres (summary, summary_embedding)
 *     → Enqueue to gpu.reranking queue
 *   GPU Batch → Worker (Stage 2: batchCosineSimilarity on GPU)
 *     → Update Postgres (summary_quality_score)
 *     → ACK and next chunk
 *
 * Performance (estimated):
 *   Sequential (current): 4.0h (cold) → 1.8h (warm)
 *   Parallel (4 workers): 1.0h (cold) → 0.45h (warm) = 4× speedup
 *   Parallel (8 workers): 0.5h (cold) → 0.25h (warm) = 8× speedup (if GPU can handle)
 *
 * GPU constraint:
 *   RTX 3060 Ti processes ~64 chunks/batch in 25ms
 *   1 worker = 1 batch/25ms = ~2,560 chunks/hour = saturated
 *   4 workers batching → 4 batches in flight, GPU serializes → 2,560 total (GPU-bound)
 *   Solution: Increase BATCH_SIZE or GPU pipeline parallelization (future)
 */

import amqplib from 'amqplib';
import pg from 'pg';
import { argv } from 'process';

const MODE = argv.includes('--producer') ? 'producer' : argv.includes('--worker') ? 'worker' : 'both';
const WORKERS = parseInt(process.env.WORKERS || '4');
const RABBIT_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';
const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const pool = new pg.Pool({ connectionString: DB_URL });

const GEMMA4_URL = process.env.GEMMA4_URL || 'http://127.0.0.1:8090';
const BIFROST_URL = process.env.BIFROST_URL || 'http://127.0.0.1:3040';

// ── Helper Functions ──────────────────────────────────────────────────────────

async function callGemma4(prompt, intent) {
  const systemPrompt = {
    debug: 'You are a code debugger. Explain what this code does and identify potential bugs.',
    refactor: 'You are a refactoring expert. Suggest how to improve this code.',
    optimize: 'You are a performance optimizer. Identify optimization opportunities.',
    explain: 'You are a code explainer. Briefly explain what this code does.',
    general: 'You are a code assistant. Provide a concise summary of this code.'
  }[intent] || 'You are a code assistant. Provide a concise summary.';

  try {
    const res = await fetch(`${GEMMA4_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-iq4xs-direct.gguf',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        stream: false,
        temperature: 0.3,
        max_tokens: 200
      }),
      signal: AbortSignal.timeout(90_000)
    });

    if (!res.ok) {
      console.error(`Gemma4 error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    let content = data.choices?.[0]?.message?.content?.trim() || null;

    // Strip Gemma4 thinking blocks
    if (content && content.includes('<|channel>')) {
      const lines = content.split('\n').filter(line => {
        const trimmed = line.trim();
        return trimmed && !trimmed.startsWith('<|') && !trimmed.includes('Thinking') && !trimmed.includes('thinking') && trimmed.length > 5;
      });
      content = lines.join('\n').trim();
    }

    return content || null;
  } catch (e) {
    console.error(`Gemma4 fetch error: ${e.message}`);
    return null;
  }
}

async function callLangExtract(text) {
  const intents = {
    debug: ['bug', 'error', 'fix', 'catch', 'throw', 'validate'],
    refactor: ['refactor', 'clean', 'simplify', 'improve', 'restructure'],
    optimize: ['performance', 'optimize', 'cache', 'batch', 'parallel', 'speed'],
    explain: ['what does', 'explain', 'how does', 'understand'],
    general: []
  };

  for (const [intent, keywords] of Object.entries(intents)) {
    if (keywords.some(k => text.toLowerCase().includes(k))) {
      return intent;
    }
  }
  return 'general';
}

function validSummary(summary) {
  if (!summary || typeof summary !== 'string') return false;
  const trimmed = summary.trim();
  const banned = [
    '<|channel>',
    'Thinking Process',
    'Reasoning:',
    'Analysis:',
    'thought\n',
    '<|end_header_id|>'
  ];
  return trimmed.length > 10 && !banned.some(x => trimmed.includes(x));
}

async function callEmbeddingGemma(text) {
  try {
    const res = await fetch('http://127.0.0.1:5173/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(30_000)
    });

    if (!res.ok) {
      console.error(`/api/embed error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const embedding = data.embedding;

    if (!embedding || !Array.isArray(embedding) || embedding.length !== 768) {
      console.error(`Embedding response invalid: expected 768-dim array, got length=${embedding?.length}`);
      return null;
    }

    return embedding;
  } catch (e) {
    console.error(`Embedding fetch error: ${e.message}`);
    return null;
  }
}

// ── Queue Configuration ──────────────────────────────────────────────────────

const QUEUES = {
  summary_generation: {
    name: 'summary.generation',
    durable: true,
    prefetch: 1,  // Fair dispatch: 1 chunk per worker at a time
  },
  gpu_reranking: {
    name: 'gpu.reranking',
    durable: true,
    prefetch: 1,
  },
};

const EXCHANGES = {
  summary: { name: 'summary.exchange', type: 'direct', durable: true },
  gpu: { name: 'gpu.exchange', type: 'direct', durable: true },
};

// ── Producer: Enqueue chunks ─────────────────────────────────────────────────

async function produceChunks(connection, limit = 4000) {
  const channel = await connection.createChannel();

  // Declare infrastructure
  for (const [key, config] of Object.entries(EXCHANGES)) {
    await channel.assertExchange(config.name, config.type, { durable: config.durable });
  }
  for (const [key, config] of Object.entries(QUEUES)) {
    await channel.assertQueue(config.name, { durable: config.durable });
  }

  // Bind queues to exchanges
  await channel.bindQueue(QUEUES.summary_generation.name, EXCHANGES.summary.name, 'generate');
  await channel.bindQueue(QUEUES.gpu_reranking.name, EXCHANGES.gpu.name, 'rerank');

  // Fetch chunks needing summaries
  console.log('📦 Producer: Fetching chunks needing summaries...');
  const result = await pool.query(`
    SELECT id, relative_path, content_embedding, summary
    FROM codebase_chunk_index
    WHERE summary IS NULL OR summary = ''
    LIMIT $1
  `, [limit]);

  const chunks = result.rows;
  console.log(`  Found ${chunks.length} chunks needing summaries\n`);

  let enqueued = 0;
  for (const chunk of chunks) {
    const message = JSON.stringify({
      chunk_id: chunk.id,
      relative_path: chunk.relative_path,
      content_embedding: chunk.content_embedding,
    });

    await channel.publish(
      EXCHANGES.summary.name,
      'generate',
      Buffer.from(message),
      { persistent: true }
    );
    enqueued++;

    if (enqueued % 100 === 0) {
      console.log(`  Enqueued ${enqueued}/${chunks.length}`);
    }
  }

  console.log(`\n✅ Producer: ${enqueued} chunks enqueued to ${QUEUES.summary_generation.name}`);
  await channel.close();
}

// ── Worker: Process Stages 1 & 2 ─────────────────────────────────────────────

async function startWorkers(connection, workerId) {
  const channel = await connection.createChannel();

  // Setup infrastructure (idempotent)
  for (const [key, config] of Object.entries(EXCHANGES)) {
    await channel.assertExchange(config.name, config.type, { durable: config.durable });
  }
  for (const [key, config] of Object.entries(QUEUES)) {
    await channel.assertQueue(config.name, { durable: config.durable });
  }

  await channel.bindQueue(QUEUES.summary_generation.name, EXCHANGES.summary.name, 'generate');
  await channel.bindQueue(QUEUES.gpu_reranking.name, EXCHANGES.gpu.name, 'rerank');

  // Prefetch (fair dispatch)
  await channel.prefetch(QUEUES.summary_generation.prefetch);

  console.log(`🔄 Worker ${workerId}: Listening on ${QUEUES.summary_generation.name}\n`);

  // Consumer: Summary generation
  await channel.consume(QUEUES.summary_generation.name, async (msg) => {
    if (!msg) return;

    const { chunk_id, relative_path, content_embedding } = JSON.parse(msg.content.toString());

    try {
      console.log(`  [Worker ${workerId}] Processing chunk ${chunk_id.substring(0, 8)}... (${relative_path})`);

      // Stage 1: Generate summary via Gemma4
      const contentPreview = Buffer.isBuffer(content_embedding)
        ? content_embedding.toString('utf8').substring(0, 1000)
        : 'Content unavailable';

      const intent = await callLangExtract(contentPreview);
      const summary = await callGemma4(
        `Summarize this code:\n${contentPreview}`,
        intent
      );

      if (!summary || !validSummary(summary)) {
        console.log(`    ⚠️  Invalid summary, skipping`);
        channel.nack(msg, false, true); // Requeue
        return;
      }

      // Stage 1b: Generate embedding via /api/embed
      const embedding = await callEmbeddingGemma(summary);
      if (!embedding || embedding.length !== 768) {
        console.log(`    ⚠️  Invalid embedding, skipping`);
        channel.nack(msg, false, true); // Requeue
        return;
      }

      // Convert to PostgreSQL halfvec format
      const vecStr = `[${embedding.join(',')}]`;

      // Update Postgres with summary + embedding
      await pool.query(
        `UPDATE codebase_chunk_index
         SET summary = $1, summary_embedding = $2::halfvec, updated_at = now()
         WHERE id = $3`,
        [summary, vecStr, chunk_id]
      );

      // Enqueue for GPU reranking (Stage 2)
      const rerank_msg = JSON.stringify({
        chunk_id,
        relative_path,
        summary: mockSummary,
        summary_embedding: Array.from(mockEmbedding),
        content_embedding,
      });

      await channel.publish(
        EXCHANGES.gpu.name,
        'rerank',
        Buffer.from(rerank_msg),
        { persistent: true }
      );

      console.log(`    ✅ Enqueued to gpu.reranking`);
      channel.ack(msg);
    } catch (e) {
      console.error(`    ❌ Error: ${e.message}`);
      channel.nack(msg, false, true); // Requeue
    }
  }, { noAck: false });

  // Consumer: GPU reranking (mock)
  console.log(`  Listening on ${QUEUES.gpu_reranking.name}\n`);

  await channel.consume(QUEUES.gpu_reranking.name, async (msg) => {
    if (!msg) return;

    const { chunk_id, relative_path, summary_embedding, content_embedding } = JSON.parse(msg.content.toString());

    try {
      console.log(`  [Worker ${workerId}] GPU reranking chunk ${chunk_id.substring(0, 8)}...`);

      // Stage 2: GPU quality scoring via cosine similarity
      // Score = cosine(summary_embedding, content_embedding)
      const { summary_embedding, content_embedding } = JSON.parse(msg.content.toString());

      if (!summary_embedding || !content_embedding) {
        console.log(`    ⚠️  Missing embeddings, skipping`);
        channel.nack(msg, false, true);
        return;
      }

      // Cosine similarity: dot(a,b) / (||a|| * ||b||)
      const summaryVec = Array.isArray(summary_embedding)
        ? summary_embedding
        : JSON.parse(summary_embedding);
      const contentVec = Array.isArray(content_embedding)
        ? content_embedding
        : JSON.parse(content_embedding);

      let dotProduct = 0;
      let normSummary = 0;
      let normContent = 0;

      for (let i = 0; i < summaryVec.length; i++) {
        dotProduct += summaryVec[i] * contentVec[i];
        normSummary += summaryVec[i] * summaryVec[i];
        normContent += contentVec[i] * contentVec[i];
      }

      const denominator = Math.sqrt(normSummary) * Math.sqrt(normContent);
      const qualityScore = denominator === 0 ? 0 : dotProduct / denominator;

      await pool.query(
        `UPDATE codebase_chunk_index
         SET summary_quality_score = $1, updated_at = now()
         WHERE id = $2`,
        [qualityScore, chunk_id]
      );

      console.log(`    ✅ Quality score: ${qualityScore.toFixed(3)}`);
      channel.ack(msg);
    } catch (e) {
      console.error(`    ❌ Error: ${e.message}`);
      channel.nack(msg, false, true); // Requeue
    }
  }, { noAck: false });

  // Keep process alive
  console.log(`Worker ${workerId}: Ready`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Day 3: RabbitMQ Worker Pool (Stages 1 & 2)');
  console.log(`Mode: ${MODE} | Workers: ${WORKERS}\n`);

  try {
    const connection = await amqplib.connect(RABBIT_URL);
    console.log('✅ Connected to RabbitMQ\n');

    if (MODE === 'producer' || MODE === 'both') {
      console.log('📤 PRODUCER MODE\n');
      await produceChunks(connection, 4000);

      if (MODE === 'both') {
        console.log('\n⏳ Waiting 2 seconds before starting workers...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    if (MODE === 'worker' || MODE === 'both') {
      console.log('👷 WORKER MODE\n');
      const workers = [];
      for (let i = 0; i < WORKERS; i++) {
        workers.push(startWorkers(connection, i + 1));
      }
      await Promise.all(workers);
      console.log('\n✅ All workers started and listening');

      // Keep process alive
      process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down...');
        await connection.close();
        await pool.end();
        process.exit(0);
      });
    } else {
      // Producer-only mode: exit after enqueueing
      await connection.close();
      await pool.end();
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

main();
