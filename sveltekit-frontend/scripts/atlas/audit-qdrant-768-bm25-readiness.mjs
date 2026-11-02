/** Read-only audit of the canonical dense + BM25 Qdrant collection. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPORT_DIR = path.resolve(process.env.QDRANT_READINESS_REPORT_DIR ?? path.join(ROOT, 'docs', 'reports'));
const OUTPUT_PATH = path.join(REPORT_DIR, 'qdrant-768-bm25-readiness.json');
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
const COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768_v2';
const EXPECTED_INDEXES = [
  ['packet_key', 'keyword'], ['source_ref', 'keyword'], ['workspace_revision', 'integer'],
  ['source_revision', 'keyword'], ['representation_revision', 'integer'], ['domain_class', 'keyword'],
  ['node_kind', 'keyword'], ['document_id', 'keyword'], ['evidence_kind', 'keyword'],
  ['tree_node_id', 'keyword'], ['symbol_version_id', 'keyword'],
];

async function get(pathname) {
  const response = await fetch(`${QDRANT_URL}${pathname}`, { signal: AbortSignal.timeout(15_000) });
  const body = await response.json();
  if (!response.ok) throw new Error(`HTTP_${response.status}:${pathname}`);
  return body;
}

async function main() {
  const info = await get(`/collections/${encodeURIComponent(COLLECTION)}`);
  const result = info?.result ?? {};
  const vectors = result.config?.params?.vectors ?? {};
  const sparse = result.config?.params?.sparse_vectors ?? result.config?.params?.sparseVectors ?? {};
  const payloadSchema = result.payload_schema ?? {};
  const content = vectors.content ?? null;
  const actualIndexes = Object.fromEntries(EXPECTED_INDEXES.map(([field, schema]) => [
    field,
    payloadSchema[field]?.data_type ?? payloadSchema[field]?.schema ?? null,
  ]));
  const missingIndexes = EXPECTED_INDEXES.filter(([field]) => !Object.prototype.hasOwnProperty.call(payloadSchema, field)).map(([field]) => field);
  const receipt = {
    schema: 'atlas.qdrant-768-bm25-readiness.v1',
    generatedAt: new Date().toISOString(),
    collection: COLLECTION,
    readOnly: true,
    qdrantWritesAttempted: false,
    dense: {
      vectorName: 'content',
      present: Boolean(content),
      size: content?.size ?? null,
      distance: content?.distance ?? null,
      contractPass: content?.size === 768 && content?.distance === 'Cosine',
    },
    sparse: {
      vectorName: 'bm25',
      present: Boolean(sparse.bm25),
      config: sparse.bm25 ?? null,
      contractPass: Boolean(sparse.bm25),
    },
    payloadIndexes: {
      existingCount: Object.keys(payloadSchema).length,
      expectedCount: EXPECTED_INDEXES.length,
      missing: missingIndexes,
      fields: actualIndexes,
    },
    status: content?.size === 768 && content?.distance === 'Cosine' && Boolean(sparse.bm25)
      ? (missingIndexes.length === 0 ? 'QDRANT_768_BM25_INDEX_READY' : 'QDRANT_768_BM25_PAYLOAD_INDEXES_PENDING')
      : 'QDRANT_768_BM25_SCHEMA_PENDING',
  };
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
}

await main();
