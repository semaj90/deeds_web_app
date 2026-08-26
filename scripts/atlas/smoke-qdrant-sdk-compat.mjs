import fs from 'node:fs/promises';
import path from 'node:path';
import { QdrantClient } from '@qdrant/js-client-rest';

const root = process.cwd();
const reportPath = path.resolve(root, 'docs/reports/qdrant-sdk-compat-smoke-v1.json');
const url = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const collection = process.env.QDRANT_SMOKE_COLLECTION ?? 'codebase_chunks_768';
const vectorName = process.env.QDRANT_SMOKE_VECTOR ?? 'content';
const vector = new Array(768).fill(0);
const client = new QdrantClient({ url });

const checks = [];
const check = (name, passed, detail = {}) => {
  checks.push({ name, passed: Boolean(passed), ...detail });
  if (!passed) throw new Error(`${name} failed`);
};

const response = await fetch(`${url}/`);
if (!response.ok) throw new Error(`Qdrant root health request failed: HTTP ${response.status}`);
const rootInfo = await response.json();
const serverVersion = String(rootInfo.version ?? 'unknown');
check('server-reachable', true, { serverVersion, url });
check('server-is-supported-upgrade-range', /^1\.(18|19)\./.test(serverVersion), { serverVersion });

const collections = await client.getCollections();
check('collections-list', Array.isArray(collections.collections), {
  collectionCount: collections.collections?.length ?? 0,
});

const collectionInfo = await client.getCollection(collection);
check('collection-read', Boolean(collectionInfo?.config), { collection });

const seed = await client.scroll(collection, { limit: 1, with_payload: true, with_vector: true });
const seedPoint = seed.points?.[0];
check('scroll-read-only-seed', Boolean(seedPoint), { found: Boolean(seedPoint) });

const storedVector = seedPoint?.vector;
const exactVector = Array.isArray(storedVector)
  ? storedVector
  : storedVector && typeof storedVector === 'object'
    ? storedVector[vectorName]
    : undefined;
check('stored-vector-read', Array.isArray(exactVector) && exactVector.length === 768, {
  dimension: Array.isArray(exactVector) ? exactVector.length : null,
});

const dense = await client.query(collection, {
  query: exactVector,
  using: vectorName,
  limit: 16,
  with_payload: false,
  with_vector: false,
});
check('named-vector-self-query', Array.isArray(dense.points) && dense.points.some((point) => String(point.id) === String(seedPoint.id)), {
  pointCount: dense.points.length,
  seedPointId: seedPoint.id,
});

const batch = await client.queryBatch(collection, {
  searches: [
    { query: exactVector, using: vectorName, limit: 1, with_payload: false, with_vector: false },
    { query: exactVector, using: vectorName, limit: 1, with_payload: true, with_vector: false },
  ],
});
check('query-batch', Array.isArray(batch) && batch.length === 2 && batch.every((item) => Array.isArray(item.points)), {
  resultSets: batch.length,
  pointCounts: batch.map((item) => item.points.length),
});

const sourceRef = seedPoint?.payload?.source_ref;
if (typeof sourceRef === 'string' && sourceRef.length > 0) {
  const filtered = await client.query(collection, {
    query: exactVector,
    using: vectorName,
    limit: 1,
    filter: { must: [{ key: 'source_ref', match: { value: sourceRef } }] },
    with_payload: true,
    with_vector: false,
  });
  check('payload-filtered-query', Array.isArray(filtered.points), { pointCount: filtered.points.length });
} else {
  checks.push({ name: 'payload-filtered-query', passed: false, skipped: true, reason: 'seed source_ref unavailable' });
}

if (seedPoint) {
  const recommended = await client.query(collection, {
    query: { recommend: { positive: [seedPoint.id], negative: [], strategy: 'average_vector' } },
    using: vectorName,
    limit: 1,
    with_payload: false,
    with_vector: false,
  });
  check('recommend-query-shape', Array.isArray(recommended.points), { pointCount: recommended.points.length });
}

const report = {
  schema: 'QdrantSdkCompatibilitySmokeV1',
  generatedAt: new Date().toISOString(),
  sdk: '@qdrant/js-client-rest@1.19.0',
  serverVersion,
  collection,
  vectorName,
  dimension: vector.length,
  readOnly: true,
  writesPerformed: false,
  checks,
  status: checks.every((item) => item.passed) ? 'PASS' : 'DEGRADED',
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, serverVersion, checks: checks.length, reportPath }, null, 2));
