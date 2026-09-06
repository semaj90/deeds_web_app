#!/usr/bin/env node
/**
 * RETRIEVAL-01L-06 fixture export -- bounded, one-off, read-only.
 *
 * Exports the 434 PKT-LINEAGE-08A cohort vectors + the same frozen query vector already used in
 * RETRIEVAL-01L-04/05 (retrieval-01l-08a-semantic-query-parity-v1.json) into a single JSON fixture
 * so a WSL2/cuVS Python process can run a brute-force exact GPU oracle without needing its own
 * Postgres client/credentials.
 *
 * This is a deliberate, scoped exception to this repo's general "don't serialize bulk vectors
 * through JSON" wire-format rule: that rule targets production/canonical data pipelines, not a
 * single bounded 434x768 (~1.3MB) one-off proof fixture. Matches this repo's own
 * GPU-MINI-FABRIC-01 precedent (frozen JSON fixtures of comparable size for bounded GPU proving
 * grounds, e.g. its 16,384-node/64-dim fixture). Not a pattern to reuse for full-corpus (55k+ row)
 * exports.
 *
 * Read-only against Postgres. Writes only the fixture file.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cohortAuditPath = path.join(root, 'docs', 'reports', 'retrieval-01l-08a-cohort-audit-v1.json');
const queryParityPath = path.join(root, 'docs', 'reports', 'retrieval-01l-08a-semantic-query-parity-v1.json');
const outPath = path.join(root, 'docs', 'reports', 'retrieval-01l-08a-cuvs-fixture-v1.json');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;

const audit = JSON.parse(fs.readFileSync(cohortAuditPath, 'utf8'));
const queryParity = JSON.parse(fs.readFileSync(queryParityPath, 'utf8'));
if (audit.status !== 'RETRIEVAL_01L_CANARY_READY') {
  console.error(`BLOCKED: cohort audit status=${audit.status}`);
  process.exit(1);
}
if (queryParity.status !== 'EXACT_SET_PARITY') {
  console.error(`BLOCKED: query parity status=${queryParity.status}`);
  process.exit(1);
}

const cohortIds = audit.retrievalCohort.candidates.map((c) => c.chunkRowId);

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 30000 });
let rows;
try {
  const result = await pool.query(
    `SELECT id::text AS id, content_embedding::text AS emb_text FROM public.codebase_chunk_index WHERE id = ANY($1::uuid[])`,
    [cohortIds],
  );
  rows = result.rows;
} finally {
  await pool.end();
}

if (rows.length !== cohortIds.length) {
  console.error(`BLOCKED: expected ${cohortIds.length} rows, got ${rows.length}`);
  process.exit(1);
}

// Preserve the same ordering as the audited RetrievalCohortV1 (candidateOrdinal), not row-fetch order.
const byId = new Map(rows.map((r) => [r.id, JSON.parse(r.emb_text)]));
const ordered = audit.retrievalCohort.candidates.map((c) => ({ chunkRowId: c.chunkRowId, candidateOrdinal: c.candidateOrdinal, vector: byId.get(c.chunkRowId) }));

for (const item of ordered) {
  if (!Array.isArray(item.vector) || item.vector.length !== 768) {
    console.error(`BLOCKED: bad vector for ${item.chunkRowId}`);
    process.exit(1);
  }
}

const populationChecksum = sha256(JSON.stringify(ordered.map((o) => o.chunkRowId).sort()));
if (populationChecksum !== queryParity.populationChecksum) {
  console.error('BLOCKED: population checksum does not match the RETRIEVAL-01L-04/05 fixture population');
  process.exit(1);
}

const fixture = {
  schema: 'atlas.retrieval-01l-08a-cuvs-fixture.v1',
  generatedAt: new Date().toISOString(),
  note: 'Bounded one-off proof fixture (see file header) -- not a production vector export pattern.',
  populationChecksum,
  queryEmbeddingChecksum: queryParity.queryFixture.queryEmbeddingChecksum,
  queryText: queryParity.queryFixture.queryText,
  postgresExactTopKForComparison: queryParity.postgres.topK,
  queryVector: JSON.parse(fs.readFileSync(queryParityPath, 'utf8')).queryFixture ? null : null, // placeholder, replaced below
  population: ordered,
};

// The query vector itself isn't persisted in retrieval-01l-08a-semantic-query-parity-v1.json (only
// its checksum, by design, to avoid duplicating large vectors across every receipt) -- refetch it
// fresh from Ollama using the identical frozen query text so the checksum can be verified to match.
const OLLAMA_URL_RAW = (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const OLLAMA_URL = OLLAMA_URL_RAW.startsWith('http') ? OLLAMA_URL_RAW : `http://${OLLAMA_URL_RAW}:11434`;
const embedRes = await fetch(`${OLLAMA_URL}/api/embed`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'embeddinggemma:latest', input: fixture.queryText }),
});
const embedData = await embedRes.json();
const queryVector = embedData.embeddings?.[0];
const recomputedChecksum = sha256(JSON.stringify(queryVector));
if (recomputedChecksum !== fixture.queryEmbeddingChecksum) {
  console.error(`BLOCKED: re-embedding the frozen query text produced a different checksum (${recomputedChecksum} != ${fixture.queryEmbeddingChecksum}) -- embedding model may not be deterministic or has changed`);
  process.exit(1);
}
fixture.queryVector = queryVector;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(fixture), 'utf8');
console.log(JSON.stringify({ populationSize: ordered.length, populationChecksum, queryEmbeddingChecksum: fixture.queryEmbeddingChecksum, out: outPath }, null, 2));
