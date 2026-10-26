#!/usr/bin/env node
import 'dotenv/config';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const SOURCE = args.find(a => a.startsWith('--source='))?.split('=')[1];
const WRITE = args.includes('--write');
const RUN_ID = args.find(a => a.startsWith('--runId='))?.split('=')[1];

const CHUNK_DIR = resolve(process.cwd(), 'data/external-docs/chunks');
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';

// Validate a 768D vector: finite values, correct length, nonzero norm. Never accept a placeholder.
function assertValidVector(vector) {
  if (!Array.isArray(vector) || vector.length !== 768) throw new Error(`EMBEDDING_DIMENSION_MISMATCH:${vector?.length}`);
  let norm = 0;
  for (const v of vector) {
    if (!Number.isFinite(v)) throw new Error('EMBEDDING_NON_FINITE_VALUE');
    norm += v * v;
  }
  if (!(norm > 0)) throw new Error('EMBEDDING_ZERO_NORM');
  return vector;
}

// Get 768d embedding from local Ollama. Fails closed: no zero-vector fallback.
async function getEmbedding(text, model = 'embeddinggemma:latest') {
  const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const errors = [];
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(2000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.embedding) return assertValidVector(data.embedding);
    } else errors.push(`/api/embeddings HTTP ${res.status}`);
  } catch (e) {
    errors.push(`/api/embeddings ${e.message}`);
  }

  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text }),
      signal: AbortSignal.timeout(2000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.embeddings && data.embeddings[0]) return assertValidVector(data.embeddings[0]);
      if (data.embedding) return assertValidVector(data.embedding);
    } else errors.push(`/api/embed HTTP ${res.status}`);
  } catch (e) {
    errors.push(`/api/embed ${e.message}`);
  }

  throw new Error(`EMBEDDING_UNAVAILABLE: ${errors.join('; ')}`);
}

// Frozen v5 namespace for docs point IDs (proposal, not yet migrated). Changing it changes every ID.
export const DOCS_POINT_NAMESPACE_V1 = '5b7a0f3e-8c1d-5e2a-9f64-2d0c7e4b1a93';
export const DOCS_POINT_NAME_VERSION = 'atlas.docs.point.v1';

// UUIDv5 (RFC 9562) over length-framed identity fields. Deterministic: re-running an upsert
// replaces the same point. A lookup key only; it never authorizes an upsert.
export function documentPointIdV5(identity, namespace = DOCS_POINT_NAMESPACE_V1) {
  const fields = ['packetKey', 'chunkId', 'sourceRevision', 'representationRevision', 'embeddingModelRevision'];
  if (fields.some((k) => typeof identity?.[k] !== 'string' || !identity[k].trim())) {
    throw new Error('PROJECTION_IDENTITY_INCOMPLETE');
  }
  const framed = [DOCS_POINT_NAME_VERSION, ...fields.map((k) => identity[k])]
    .map((v) => `${Buffer.byteLength(v, 'utf8')}:${v}`).join('|');
  const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const bytes = crypto.createHash('sha1').update(nsBytes).update(framed, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Legacy point ID (unchanged). Existing Qdrant points use this scheme; switching it without a
// controlled migration would create duplicate points. The V2 ID scheme needs an approved migration.
function deterministicPointId(key) {
  const hash = crypto.createHash('md5').update(key).digest();
  return hash.readUInt32BE(0) % 2147483648;
}

async function index() {
  if (!existsSync(CHUNK_DIR)) return;
  const files = await readdir(CHUNK_DIR);

  for (const file of files) {
    if (SOURCE && file !== `${SOURCE}.jsonl`) continue;
    if (file.endsWith('.jsonl')) {
      const content = await readFile(join(CHUNK_DIR, file), 'utf8');
      const chunks = content.split('\n').filter(Boolean).map(JSON.parse);

      console.log(`[qdrant] Indexing ${chunks.length} chunks from ${file}... (RunID: ${RUN_ID || 'none'})`);
      
      if (!WRITE) {
        console.log(`[dry-run] Would upsert ${chunks.length} points to external_programming_docs_768`);
        continue;
      }

      for (const chunk of chunks) {
        const pointId = deterministicPointId(chunk.chunkId);
        let vector;
        try {
          vector = await getEmbedding(chunk.text);
        } catch (err) {
          // Fail closed: a chunk without a valid embedding is never written.
          failures += 1;
          console.error(`  ❌ ${chunk.chunkId} skipped: ${err.message}`);
          continue;
        }

        const res = await fetch(`${QDRANT_URL}/collections/external_programming_docs_768/points`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: [{
              id: pointId,
              vector: vector,
              payload: { ...chunk, runId: RUN_ID }
            }]
          })
        });

        if (res.ok) console.log(`  ✅ ${chunk.chunkId} indexed.`);
        else {
          failures += 1;
          console.error(`  ❌ ${chunk.chunkId} failed: ${await res.text()}`);
        }
      }
    }
  }
  if (failures > 0) {
    console.error(`[qdrant] ${failures} chunk(s) not indexed; exiting non-zero.`);
    process.exitCode = 1;
  }
}

let failures = 0;
export { assertValidVector, deterministicPointId };
// Note: the V2 safety helper (Downloads/atlas-docs-indexer-safety-v2) is not wired here.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  index().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
