/**
 * Gated creator for a new dense+BM25 Qdrant collection.
 * Default mode is a no-write plan. It never copies points or mutates the
 * existing canonical collection.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPORT_DIR = path.resolve(process.env.QDRANT_READINESS_REPORT_DIR ?? path.join(ROOT, 'docs', 'reports'));
const PLAN_PATH = path.join(REPORT_DIR, 'qdrant-768-bm25-migration-plan.json');
const OUTPUT_PATH = path.join(REPORT_DIR, 'qdrant-768-bm25-migration-apply-receipt.json');
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
const SOURCE_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768_v2';
const TARGET_COLLECTION = process.env.QDRANT_BM25_PROPOSED_COLLECTION ?? 'codebase_chunks_768_bm25_v1';
const APPLY = process.argv.includes('--apply');
const EXPECTED_PLAN_SHA256 = process.env.QDRANT_BM25_EXPECTED_PLAN_SHA256 ?? null;
const INDEXES = {
  packet_key: 'keyword', source_ref: 'keyword', workspace_revision: 'integer', source_revision: 'keyword',
  representation_revision: 'integer', domain_class: 'keyword', node_kind: 'keyword', document_id: 'keyword',
  evidence_kind: 'keyword', tree_node_id: 'keyword', symbol_version_id: 'keyword',
};

function sha256(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
async function request(pathname, init = {}) {
  const response = await fetch(`${QDRANT_URL}${pathname}`, { ...init, signal: AbortSignal.timeout(15_000) });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
  if (!response.ok) throw new Error(`HTTP_${response.status}:${pathname}:${text.slice(0, 300)}`);
  return body;
}

async function main() {
  const planText = await readFile(PLAN_PATH, 'utf8');
  const plan = JSON.parse(planText);
  const planSha256 = sha256(planText);
  const receipt = {
    schema: 'atlas.qdrant-768-bm25-migration-apply.v1', generatedAt: new Date().toISOString(),
    sourceCollection: SOURCE_COLLECTION, targetCollection: TARGET_COLLECTION, planSha256,
    readOnly: !APPLY, qdrantWritesAttempted: false, pointsCopied: 0, indexesCreated: 0,
    status: 'DRY_RUN_PLAN_ONLY',
  };
  if (TARGET_COLLECTION === SOURCE_COLLECTION) throw new Error('TARGET_COLLECTION_MUST_NOT_EQUAL_SOURCE_COLLECTION');
  if (!plan.readOnly || plan.applyAuthorized !== false) throw new Error('PLAN_NOT_FAIL_CLOSED');
  if (!APPLY) {
    receipt.desiredCreateRequest = {
      vectors: { content: { size: 768, distance: 'Cosine' } },
      sparse_vectors: { bm25: { modifier: 'idf' } },
    };
    receipt.desiredPayloadIndexes = INDEXES;
  } else {
    if (process.env.ATLAS_QDRANT_BM25_APPLY !== '1') throw new Error('EXPLICIT_ATLAS_QDRANT_BM25_APPLY_REQUIRED');
    if (!EXPECTED_PLAN_SHA256 || EXPECTED_PLAN_SHA256 !== planSha256) throw new Error('EXPECTED_PLAN_SHA256_REQUIRED_OR_MISMATCH');
    const existing = await request(`/collections/${encodeURIComponent(TARGET_COLLECTION)}`);
    if (existing?.result) throw new Error('TARGET_COLLECTION_ALREADY_EXISTS');
    await request(`/collections/${encodeURIComponent(TARGET_COLLECTION)}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vectors: { content: { size: 768, distance: 'Cosine' } }, sparse_vectors: { bm25: { modifier: 'idf' } } }),
    });
    for (const [field_name, field_schema] of Object.entries(INDEXES)) {
      await request(`/collections/${encodeURIComponent(TARGET_COLLECTION)}/index`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ field_name, field_schema }),
      });
      receipt.indexesCreated += 1;
    }
    receipt.qdrantWritesAttempted = true;
    receipt.readOnly = false;
    receipt.status = 'TARGET_SCHEMA_CREATED_POINTS_NOT_COPIED';
  }
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
}

await main();
