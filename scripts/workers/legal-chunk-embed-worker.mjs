#!/usr/bin/env node
/**
 * RabbitMQ CPU worker: embeds legal_chunks with embeddinggemma:latest (768-d) and writes Postgres.
 * Consumes legal.chunk.embed ({ chunkIds: uuid[] }); text is read from Postgres, never from the message.
 * Run it against a SEPARATE CPU-only Ollama instance (OLLAMA_URL=http://127.0.0.1:11435), started with
 *   OLLAMA_HOST=127.0.0.1:11435 CUDA_VISIBLE_DEVICES=-1 OLLAMA_MODELS=<same dir as the main instance> ollama serve
 * so it uses the identical embeddinggemma:latest blob (verify digest) but never shares a scheduler with the
 * main :11434 instance. The app embeds queries on :11434; sharing it with a busy CPU runner (even under another
 * model name) starved those queries into 504s. The GPU stays free for llama-server :8090.
 * Hard fail (-> legal.chunk.embed.dlq): non-768 or non-finite vectors. Never coerced.
 *
 *   node --env-file=.env scripts/workers/legal-chunk-embed-worker.mjs
 *   env: OLLAMA_URL, RABBITMQ_URL, EMBED_THREADS (default 6)
 */
import amqp from 'amqplib';
import pg from 'pg';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL is required (run with --env-file=.env)'); process.exit(1); }
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const THREADS = Number(process.env.EMBED_THREADS || 6);
const EMBED_MODEL = process.env.LEGAL_EMBED_MODEL || 'embeddinggemma:latest';
const QUEUE = 'legal.chunk.embed';
const DIM = 768;

const pool = new pg.Pool({ connectionString: DB_URL, max: 2 });

async function embed(texts) {
	const res = await fetch(`${OLLAMA_URL}/api/embed`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: EMBED_MODEL, input: texts, truncate: true, keep_alive: '10m',
			options: { num_gpu: 0, num_thread: THREADS },
		}),
		signal: AbortSignal.timeout(180_000),
	});
	if (!res.ok) throw new Error(`OLLAMA_HTTP_${res.status}`);
	const { embeddings } = await res.json();
	if (!Array.isArray(embeddings) || embeddings.length !== texts.length) throw new Error('EMBED_COUNT_MISMATCH');
	for (const v of embeddings) {
		if (!Array.isArray(v) || v.length !== DIM || !v.every(Number.isFinite)) throw new Error('EMBED_DIM_INVALID');
	}
	return embeddings;
}

async function handle(ch, msg) {
	if (!msg) return;
	try {
		const { chunkIds } = JSON.parse(msg.content.toString());
		if (!Array.isArray(chunkIds) || !chunkIds.length) throw new Error('BAD_MESSAGE');
		const { rows } = await pool.query(
			`SELECT id, chunk_text FROM legal_chunks WHERE id = ANY($1::uuid[]) AND embedding IS NULL`, [chunkIds]);
		if (rows.length) {
			const vecs = await embed(rows.map((r) => r.chunk_text));
			await pool.query(
				`UPDATE legal_chunks c SET embedding = v.e::vector
				 FROM unnest($1::uuid[], $2::text[]) AS v(id, e) WHERE c.id = v.id AND c.embedding IS NULL`,
				[rows.map((r) => r.id), vecs.map((v) => `[${v.join(',')}]`)]);
		}
		ch.ack(msg);
	} catch (e) {
		console.error('[legal-embed]', e.message);
		// first failure requeues once; a redelivered failure goes to the DLQ
		ch.nack(msg, false, !msg.fields.redelivered);
	}
}

const conn = await amqp.connect(RABBITMQ_URL);
const ch = await conn.createChannel();
await ch.assertQueue(`${QUEUE}.dlq`, { durable: true });
await ch.assertQueue(QUEUE, { durable: true, arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': `${QUEUE}.dlq` } });
await ch.prefetch(1);
console.log(`[legal-embed] consuming ${QUEUE} (CPU, ${THREADS} threads)`);
await ch.consume(QUEUE, (m) => handle(ch, m), { noAck: false });
process.on('SIGINT', async () => { await ch.close(); await conn.close(); await pool.end(); process.exit(0); });
