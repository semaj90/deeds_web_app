/**
 * Produce a no-write migration plan for canonical dense + BM25 Qdrant.
 * This intentionally does not create collections, indexes, or points.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPORT_DIR = path.resolve(process.env.QDRANT_READINESS_REPORT_DIR ?? path.join(ROOT, 'docs', 'reports'));
const OUTPUT_PATH = path.join(REPORT_DIR, 'qdrant-768-bm25-migration-plan.json');
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
const SOURCE_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768_v2';
const PROPOSED_COLLECTION = process.env.QDRANT_BM25_PROPOSED_COLLECTION ?? 'codebase_chunks_768_bm25_v1';
const INDEXES = {
  packet_key: 'keyword', source_ref: 'keyword', workspace_revision: 'integer', source_revision: 'keyword',
  representation_revision: 'integer', domain_class: 'keyword', node_kind: 'keyword', document_id: 'keyword',
  evidence_kind: 'keyword', tree_node_id: 'keyword', symbol_version_id: 'keyword',
};

async function main() {
  const response = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(SOURCE_COLLECTION)}`, { signal: AbortSignal.timeout(15_000) });
  const body = await response.json();
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const result = body?.result ?? {};
  const vectors = result.config?.params?.vectors ?? {};
  const sparse = result.config?.params?.sparse_vectors ?? result.config?.params?.sparseVectors ?? {};
  const currentDensePass = vectors.content?.size === 768 && vectors.content?.distance === 'Cosine';
  const currentSparsePass = Boolean(sparse.bm25);
  const plan = {
    schema: 'atlas.qdrant-768-bm25-migration-plan.v1',
    generatedAt: new Date().toISOString(),
    sourceCollection: SOURCE_COLLECTION,
    proposedCollection: PROPOSED_COLLECTION,
    readOnly: true,
    applyAuthorized: false,
    qdrantWritesAttempted: false,
    current: {
      denseContent768Cosine: currentDensePass,
      sparseBm25Idf: currentSparsePass,
      existingPayloadIndexCount: Object.keys(result.payload_schema ?? {}).length,
    },
    desired: {
      vectors: { content: { size: 768, distance: 'Cosine' } },
      sparseVectors: { bm25: { modifier: 'idf' } },
      payloadIndexes: INDEXES,
      identityPolicy: 'packet_key and qdrant point identity must be proven before projection',
      revisionPolicy: 'workspace/source revision authority must be proven before promotion',
    },
    gates: [
      'SPARSE_OWNER_PROVEN',
      'S512_PAYLOAD_IDENTITY_PROVEN',
      'REVISION_OWNER_PROVEN',
      'SAME_CORPUS_DENSE_SPARSE_RECALL_PROVEN',
      'NEW_COLLECTION_READBACK_PROVEN',
      'OLD_COLLECTION_SUPERSESSION_APPROVED',
    ],
    status: currentDensePass && currentSparsePass
      ? 'SCHEMA_PRESENT_MIGRATION_GATES_PENDING'
      : 'BLOCKED_EXISTING_COLLECTION_REQUIRES_NO_WRITE_MIGRATION',
  };
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(plan, null, 2));
}

await main();
