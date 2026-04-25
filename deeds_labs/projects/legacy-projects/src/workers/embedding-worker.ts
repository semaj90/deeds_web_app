/**
 * Consolidated embedding worker (TypeScript)
 * - Single set of imports / functions
 * - Uses runtime require for amqplib to avoid missing type declarations in TS builds
 * - Uses global fetch when available, falls back to dynamic import('node-fetch')
 * - Normalizes Triton responses and handles errors robustly
 * - Keeps Rabbit types as any to avoid missing @types/amqplib dependency
 *
 * TODO: replace any types with proper types once @types/amqplib is available,
 *       wire Drizzle/Postgres, Qdrant and Redis integrations.
 */

const amqplib: any = (() => {
  // Require at runtime to avoid TS compile errors when @types/amqplib isn't installed.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('amqplib');
  } catch (e) {
    throw new Error(
      "amqplib is required at runtime. Install 'amqplib' or provide it in the environment."
    );
  }
})();

const RABBIT_URL = process.env.RABBIT_URL || 'amqp://localhost';
const TRITON_URL = process.env.TRITON_URL || 'http://localhost:8000';
const DOCUMENTS_QUEUE = 'documents.uploaded';
const PROCESSED_QUEUE = 'documents.processed';

async function getFetch() {
  // Prefer global fetch (Node 18+ / browsers). Otherwise dynamic import node-fetch.
  const g = globalThis as any;
  if (typeof g.fetch === 'function') return g.fetch.bind(g);
  // dynamic import to avoid duplicate identifier issues at compile time
  const nf = await import('node-fetch');
  return (nf.default ?? nf) as typeof fetch;
}

async function connectRabbit() {
  const conn = await amqplib.connect(RABBIT_URL);
  const ch = await conn.createChannel();
  await ch.assertQueue(DOCUMENTS_QUEUE, { durable: true });
  await ch.assertQueue(PROCESSED_QUEUE, { durable: true });
  // optional exchange usage can be added later
  return { conn, ch };
}

/**
 * Call Triton embedding model and return normalized embeddings array per input.
 * Returns an array where each entry corresponds to a single input embedding (number[]), or empty array on failure.
 */
async function callTritonEmbed(texts: string[]): Promise<number[][]> {
  if (!texts?.length) return [];

  const fetchFn = await getFetch();
  const payload = {
    inputs: [
      {
        name: 'TEXTS',
        shape: [texts.length],
        datatype: 'BYTES',
        data: texts,
      },
    ],
  };

  const url = `${TRITON_URL.replace(/\/$/, '')}/v2/models/legal_embedding/infer`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '<no-body>');
    throw new Error(`Triton error ${res.status}: ${txt}`);
  }

  // parse response and normalize to number[][] if possible
  const body: any = await res.json().catch(() => ({}));
  // Triton typical shapes: body.outputs[0].data or outputs[0].contents etc.
  const out = body?.outputs?.[0] ?? body?.outputs ?? body;
  let raw: any = null;
  if (out == null) raw = body;
  else if (Array.isArray(out)) raw = out;
  else if (out.data) raw = out.data;
  else if (out.contents) raw = out.contents;
  else raw = out;

  // Normalize into array of embeddings: attempt to detect per-item arrays or flattened array
  try {
    if (!raw) return [];
    // If raw is array of arrays -> assume number[][]
    if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0])) {
      return (raw as any[][]).map((r) => r.map((n) => Number(n)).filter((v) => !Number.isNaN(v)));
    }
    // If flattened numeric array and we know dimension (best-effort): try to split evenly by texts.length
    if (Array.isArray(raw) && typeof raw[0] === 'number') {
      const flat = (raw as number[]).map((n) => Number(n)).filter((v) => !Number.isNaN(v));
      // best-effort: if flat length divisible by texts.length, split evenly
      const len = flat.length;
      if (texts.length > 0 && len % texts.length === 0) {
        const dim = len / texts.length;
        const result: number[][] = [];
        for (let i = 0; i < texts.length; i++) {
          result.push(<any>(<any>flat.slice(i * dim, (i + 1) * dim)));
        }
        return result;
      }
      // fallback: return single embedding (wrap)
      return [flat];
    }
    // If outputs field exists and contains nested structure, attempt to extract numeric arrays
    if (Array.isArray(raw)) {
      return (raw as any[]).map((r) => {
        if (Array.isArray(r)) return r.map((n) => Number(n)).filter((v) => !Number.isNaN(v));
        if (r?.data && Array.isArray(r.data))
          return r.data.map((n: any) => Number(n)).filter((v: number) => !Number.isNaN(v));
        return [];
      });
    }
  } catch (e) {
    console.debug('callTritonEmbed normalization failed', e);
  }
  return [];
}

async function processMessage(msg: any, ch: any) {
  if (!msg) return;
  try {
    const payload = JSON.parse(msg.content.toString());
    // Expected shape: { type: 'document.uploaded', documentId, s3Path, parts: [{ id?, text? }] }
    if (payload?.type !== 'document.uploaded') {
      ch.ack(msg);
      return;
    }
    const parts = Array.isArray(payload.parts) ? payload.parts : [];
    const texts = parts.map((p: any) => String(p?.text ?? '')).filter(Boolean);
    if (texts.length === 0) {
      // nothing to embed
      ch.ack(msg);
      return;
    }

    const embeddings = await callTritonEmbed(texts);
    // TODO: persist embeddings to Postgres (Drizzle) and vector DB (Qdrant), update Redis/top-k cache

    // publish a processed message with embeddings metadata (avoid sending huge binary if not needed)
    const out = {
      type: 'document.processed',
      documentId: payload.documentId,
      parts: parts.map((p: any, i: number) => ({
        id: p?.id ?? i,
        embedding: embeddings[i] ?? null,
      })),
      metadata: { source: 'embedding-worker', processedAt: new Date().toISOString() },
    };
    // Using sendToQueue for a simple queue; change to publish if using exchange/topic
    ch.sendToQueue(PROCESSED_QUEUE, Buffer.from(JSON.stringify(out)), { persistent: true });
    ch.ack(msg);
  } catch (err) {
    console.error('Failed processing message', err);
    try {
      ch.nack(msg, false, false);
    } catch (e) {
      // ignore ack/nack failures
    }
  }
}

async function main() {
  const { conn, ch } = await connectRabbit();
  console.log('Embedding worker started, waiting for messages');

  // consume with concurrency pattern if needed (simple one-by-one here)
  await ch.consume(
    DOCUMENTS_QUEUE,
    async (msg: any) => {
      if (!msg) return;
      await processMessage(msg, ch);
    },
    { noAck: false }
  );

  // graceful shutdown
  const shutdown = async () => {
    try {
      console.log('Shutting down embedding worker');
      await ch.close();
      await conn.close();
      process.exit(0);
    } catch (e) {
      console.error('Error during shutdown', e);
      process.exit(1);
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require && require.main === module) {
  main().catch((e) => {
    console.error('Worker failed', e);
    process.exit(1);
  });
}

export {}; // keep module scope
