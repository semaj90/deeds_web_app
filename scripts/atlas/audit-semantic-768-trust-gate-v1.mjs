#!/usr/bin/env node

/**
 * Read-only semantic_768 trust-gate audit.
 *
 * This records live provider/collection dimensions and the active reader's
 * collection owner without changing PostgreSQL, Qdrant, Valkey, or source
 * data. Legacy 384 declarations are reported separately and are not treated
 * as an active retrieval failure by themselves.
 */

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.resolve(process.env.ATLAS_SEMANTIC_TRUST_REPORT ?? path.join(ROOT, 'docs/reports/semantic-768-trust-gate-v1.json'));
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
const ACTIVE_COLLECTION = 'codebase_chunks_768_v2';
const LEGACY_COLLECTIONS = ['codebase_chunks_384', 'codebase_chunks_384_hybrid'];

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

async function fetchJson(url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: null, error: error instanceof Error ? error.message : String(error), body: null };
  }
}

async function probeEmbedding() {
  const response = await fetchJson(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt: 'semantic_768 trust gate probe' }),
  });
  const vector = response.body?.embedding;
  return {
    reachable: response.ok,
    status: response.status,
    model: MODEL,
    dimension: Array.isArray(vector) ? vector.length : null,
    dimensionProven: Array.isArray(vector) && vector.length === 768,
  };
}

async function probeCollection(name) {
  const response = await fetchJson(`${QDRANT_URL}/collections/${encodeURIComponent(name)}`);
  const vectors = response.body?.result?.config?.params?.vectors;
  const entries = Array.isArray(vectors)
    ? vectors.map((entry) => ({ name: entry.name ?? '__default__', size: entry.size ?? null }))
    : vectors && typeof vectors === 'object'
      ? Object.entries(vectors).map(([vectorName, entry]) => ({ name: vectorName, size: entry?.size ?? null }))
      : [];
  return {
    name,
    reachable: response.ok,
    status: response.status,
    vectors: entries,
    dimension768: entries.some((entry) => entry.size === 768),
    dimension384: entries.some((entry) => entry.size === 384),
  };
}

async function probePostgres() {
  const repoEnv = loadRepoEnv(process.env);
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(repoEnv), max: 1 });
  try {
    const columns = await pool.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name IN ('content_embedding_768', 'content_embedding_384', 'embedding')
      ORDER BY table_name, column_name
    `);
    const hasCanonical = columns.rows.some((row) => row.table_name === 'codebase_chunk_index' && row.column_name === 'content_embedding_768');
    let sampleDimension = null;
    if (hasCanonical) {
      const sample = await pool.query(`
        SELECT vector_dims(content_embedding_768::vector) AS dimension
        FROM public.codebase_chunk_index
        WHERE content_embedding_768 IS NOT NULL
        LIMIT 1
      `);
      sampleDimension = sample.rows[0]?.dimension == null ? null : Number(sample.rows[0].dimension);
    }
    return {
      reachable: true,
      canonicalColumnPresent: hasCanonical,
      canonicalSampleDimension: sampleDimension,
      canonical768Proven: hasCanonical && sampleDimension === 768,
      columns: columns.rows,
    };
  } catch (error) {
    return { reachable: false, canonicalColumnPresent: false, canonicalSampleDimension: null, canonical768Proven: false, columns: [], error: error instanceof Error ? error.message : String(error) };
  } finally {
    await pool.end().catch(() => {});
  }
}

const activeReader = readText('sveltekit-frontend/src/lib/server/search/qdrant-search.ts');
const activeEmbeddingConfig = readText('sveltekit-frontend/src/lib/server/config/embedding-config.ts');
const activeContract = readText('sveltekit-frontend/src/lib/server/embedding/embedding-contract-768.ts');
const activeRetrievalFiles = [activeReader, activeEmbeddingConfig, activeContract];
const activeRetrieval384References = activeRetrievalFiles.reduce((count, text) => count + (text.match(/\b384\b/g) ?? []).length, 0);
const activeReader384References = (activeReader.match(/\b384\b/g) ?? []).length;
const legacy384Explicit = /legacy|REFERENCE_ONLY|MIGRATION_ONLY|retired/i.test(activeContract) && /384/.test(activeContract);

const [embedding, activeCollection, ...legacyCollections] = await Promise.all([
  probeEmbedding(),
  probeCollection(ACTIVE_COLLECTION),
  ...LEGACY_COLLECTIONS.map(probeCollection),
]);
const postgres = await probePostgres();

const report = {
  schema: 'atlas.semantic-768-trust-gate.v1',
  generatedAt: new Date().toISOString(),
  status: embedding.dimensionProven && activeCollection.dimension768 && postgres.canonical768Proven
    ? 'SEMANTIC_768_DIMENSION_PROVEN_ACTIVE_LINEAGE_REMAINING'
    : 'SEMANTIC_768_TRUST_GATE_BLOCKED',
  contract: {
    representationId: 'semantic_768',
    dimensions: 768,
    model: MODEL,
    activeReaderCollection: ACTIVE_COLLECTION,
    canonicalStore: 'PostgreSQL',
    canonicalAuthority: false,
  },
  evidence: {
    embedding,
    qdrant: { activeCollection, legacyCollections },
    postgres,
    activeRetrieval384References,
    activeReader384References,
    legacy384Explicit,
    activeReaderUses384: activeReader384References > 0,
  },
  interpretation: {
    dimensionParity: embedding.dimensionProven && activeCollection.dimension768 && postgres.canonical768Proven,
    legacy384Status: legacy384Explicit ? 'EXPLICIT_LEGACY_REFERENCE_ONLY' : 'NOT_OBSERVED',
    collectionOwnerReconciliation: activeCollection.dimension768 ? 'ACTIVE_READER_OWNER_PROVEN_DIMENSION_ONLY' : 'ACTIVE_COLLECTION_DIMENSION_UNPROVEN',
    remainingGates: [
      'source_revision_and_packet_lineage_coverage',
      'qdrant_payload_lineage_readback',
      'L1_L2_PRECOMPUTED_VECTOR_CACHE_DIMENSION_READBACK',
      'active_collection_owner_reconciliation',
    ],
  },
  writesPerformed: false,
  postgresWrites: false,
  qdrantWrites: false,
  valkeyWrites: false,
  canonicalAuthority: false,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, reportPath: OUT, writesPerformed: false, dimensions: { embedding: embedding.dimension, qdrant: activeCollection.vectors, postgres: postgres.canonicalSampleDimension }, activeRetrieval384References }, null, 2));
