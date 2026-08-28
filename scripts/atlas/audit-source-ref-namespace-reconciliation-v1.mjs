#!/usr/bin/env node
/** Read-only manifest -> PostgreSQL projection namespace reconciliation. */
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const MANIFEST = resolve(ROOT, '.tmp/atlas/indexable-source-manifest-v1/manifest.jsonl');
const REPORT = resolve(ROOT, 'docs/reports/source-ref-namespace-reconciliation-v1.json');
const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

const clean = (value) => { const text = String(value ?? '').trim(); return text || null; };
const key = (sourceRef, contentHash) => `${clean(sourceRef) ?? ''}\0${clean(contentHash)?.toLowerCase() ?? ''}`;

async function readManifest() {
  if (!existsSync(MANIFEST)) throw new Error(`MANIFEST_MISSING:${MANIFEST}`);
  const rows = [];
  const input = createInterface({ input: createReadStream(MANIFEST), crlfDelay: Infinity });
  for await (const line of input) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.canonicalAdmission === true && row.status === 'HASHED') rows.push(row);
  }
  return rows;
}

async function main() {
  const manifest = await readManifest();
  const refs = [...new Set(manifest.map((row) => clean(row.relativePath)).filter(Boolean))];
  const namespaceCandidate = (ref) => ref?.startsWith('sveltekit-frontend/') ? ref.slice('sveltekit-frontend/'.length) : null;
  const projectionRefs = [...new Set(refs.flatMap((ref) => [ref, namespaceCandidate(ref)]).filter(Boolean))];
  const [chunks, graphify] = await Promise.all([
    pool.query(`SELECT source_ref, content_hash FROM public.codebase_chunk_index WHERE source_ref = ANY($1::text[])`, [projectionRefs]),
    pool.query(`SELECT source_ref, content_hash, workspace_revision, code_source_revision FROM public.graphify_files WHERE source_ref = ANY($1::text[])`, [projectionRefs]),
  ]);
  const chunkKeys = new Set(chunks.rows.map((row) => key(row.source_ref, row.content_hash)));
  const graphifyKeys = new Set(graphify.rows.map((row) => key(row.source_ref, row.content_hash)));
  const classifications = { EXACT_CURRENT: 0, NAMESPACE_RULE_HASH_EXACT_REVIEW_ONLY: 0, HASH_TRUNCATED_NOT_PROVABLE: 0, CHUNK_SOURCE_MATCH_HASH_MISMATCH: 0, GRAPHIFY_SOURCE_MATCH_HASH_MISMATCH: 0, MISSING_POSTGRES_CHUNK: 0, MISSING_GRAPHIFY: 0 };
  for (const row of manifest) {
    const k = key(row.relativePath, row.contentHash);
    const aliasRef = namespaceCandidate(row.relativePath);
    const aliasChunk = aliasRef ? chunks.rows.filter((item) => clean(item.source_ref) === aliasRef) : [];
    const aliasGraphify = aliasRef ? graphify.rows.filter((item) => clean(item.source_ref) === aliasRef) : [];
    const aliasChunkExact = aliasChunk.some((item) => key(item.source_ref, item.content_hash) === key(aliasRef, row.contentHash));
    const aliasGraphifyExact = aliasGraphify.some((item) => key(item.source_ref, item.content_hash) === key(aliasRef, row.contentHash));
    if (chunkKeys.has(k) && graphifyKeys.has(k)) classifications.EXACT_CURRENT += 1;
    else if (aliasChunkExact && aliasGraphifyExact) classifications.NAMESPACE_RULE_HASH_EXACT_REVIEW_ONLY += 1;
    else if (aliasChunk.some((item) => clean(row.contentHash)?.toLowerCase().startsWith(clean(item.content_hash)?.toLowerCase() ?? ''))) classifications.HASH_TRUNCATED_NOT_PROVABLE += 1;
    else if (!chunkKeys.has(k) && chunks.rows.some((item) => clean(item.source_ref) === clean(row.relativePath))) classifications.CHUNK_SOURCE_MATCH_HASH_MISMATCH += 1;
    else if (!graphifyKeys.has(k) && graphify.rows.some((item) => clean(item.source_ref) === clean(row.relativePath))) classifications.GRAPHIFY_SOURCE_MATCH_HASH_MISMATCH += 1;
    else if (!chunkKeys.has(k)) classifications.MISSING_POSTGRES_CHUNK += 1;
    else classifications.MISSING_GRAPHIFY += 1;
  }
  const report = {
    schema: 'atlas.source-ref-namespace-reconciliation.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    postgresWrites: false,
    qdrantWrites: false,
    manifest: { path: MANIFEST, admittedRows: manifest.length, distinctSourceRefs: refs.length, namespaceCandidateRule: 'sveltekit-frontend/<path> -> <path>', namespaceCandidateRefs: projectionRefs.length },
    projections: { postgresChunkRows: chunks.rowCount, graphifyRows: graphify.rowCount, qdrant: 'NOT_CHECKED_IN_THIS_READ_ONLY_PASS' },
    classifications,
    exactCurrent: classifications.EXACT_CURRENT,
    promotionEligible: false,
    canonicalAuthority: false,
    rules: ['exact source_ref + content_hash only', 'no basename/normalized/suffix/fuzzy matching', 'Qdrant is not identity authority'],
    nextGate: classifications.EXACT_CURRENT > 0 ? 'RECONCILE_QDRANT_PAYLOAD_IDENTITY_AND_REVISION' : 'SOURCE_BINDING_RECONCILIATION_REQUIRED',
  };
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, readOnly: true, classifications, exactCurrent: report.exactCurrent, nextGate: report.nextGate, report: REPORT }, null, 2));
}

main().catch((error) => { console.error(`[source-ref-namespace] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }).finally(() => pool.end().catch(() => {}));
