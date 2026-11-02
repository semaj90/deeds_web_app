#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const qdrantUrl = (process.env.QDRANT_URL ?? '').replace(/\/+$/, '');
const collection = process.env.QDRANT_COLLECTION?.trim() ?? '';
const expectedRepresentationId = process.env.ATLAS_EXPECTED_REPRESENTATION_ID ?? 'semantic_768';
const expectedDimension = Number(process.env.ATLAS_EXPECTED_DIMENSION ?? 768);
const expectedDistance = (process.env.ATLAS_EXPECTED_DISTANCE ?? 'Cosine').toLowerCase();
const sampleLimit = Math.max(1, Number(process.env.QDRANT_PROVENANCE_SAMPLE ?? 100));
const reportPath = path.resolve(root, process.env.QDRANT_PROVENANCE_REPORT ?? 'docs/reports/qdrant-embedding-provenance-audit.json');

if (!qdrantUrl) {
  console.error('QDRANT_URL is required; this audit does not guess a service endpoint.');
  process.exit(2);
}
if (!collection) {
  console.error('QDRANT_COLLECTION is required; this audit does not guess a collection owner.');
  process.exit(2);
}

async function getJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(body).slice(0, 500)}`);
  return body;
}

function valuesFor(points, key) {
  return points
    .map((point) => point?.payload?.[key])
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => String(value));
}

function summarizeField(points, key) {
  const values = valuesFor(points, key);
  const distinct = [...new Set(values)].sort();
  return {
    field: key,
    sampled: points.length,
    populated: values.length,
    missing: points.length - values.length,
    coverage: points.length === 0 ? 0 : values.length / points.length,
    distinctValues: distinct.slice(0, 25),
    distinctCount: distinct.length,
    state: values.length === 0 ? 'MISSING' : distinct.length === 1 ? 'CONSISTENT_DECLARATION' : 'MIXED_DECLARATION',
  };
}

function vectorConfig(info) {
  const vectors = info?.result?.config?.params?.vectors;
  if (!vectors) return [];
  if (Array.isArray(vectors)) return vectors;
  if (vectors.size || vectors.distance) return [{ name: 'default', ...vectors }];
  return Object.entries(vectors).map(([name, value]) => ({ name, ...(value ?? {}) }));
}

const info = await getJson(`${qdrantUrl}/collections/${encodeURIComponent(collection)}`);
const scroll = await getJson(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/scroll`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ limit: sampleLimit, with_payload: true, with_vector: false, order_by: null }),
});
const points = Array.isArray(scroll?.result?.points) ? scroll.result.points : [];
const fields = [
  'embedding_model',
  'model_revision',
  'representation_id',
  'representation_name',
  'representation_revision',
  'prompt_revision',
  'embedding_executor',
  'embedding_digest',
  'workspace_revision',
  'source_revision',
];
const fieldSummary = fields.map((field) => summarizeField(points, field));
const byField = Object.fromEntries(fieldSummary.map((item) => [item.field, item]));
const declaredModel = byField.embedding_model?.state === 'CONSISTENT_DECLARATION'
  && byField.model_revision?.state === 'CONSISTENT_DECLARATION'
  && byField.representation_id?.state === 'CONSISTENT_DECLARATION';
const vectors = vectorConfig(info);
const vectorShapeMatches = vectors.some((vector) => Number(vector.size) === expectedDimension
  && String(vector.distance ?? '').toLowerCase() === expectedDistance);
const representationMatches = byField.representation_id?.distinctValues.length === 1
  && byField.representation_id.distinctValues[0] === expectedRepresentationId;

const report = {
  schema: 'atlas.qdrant-embedding-provenance-audit.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  canonicalWriteAttempted: false,
  qdrantUrl,
  collection,
  expectedContract: {
    representationId: expectedRepresentationId,
    dimension: expectedDimension,
    distance: expectedDistance,
  },
  sampleLimit,
  sampledPoints: points.length,
  pointIds: points.map((point) => String(point.id)).slice(0, 25),
  vectorConfiguration: vectors,
  vectorShapeMatches,
  representationMatches,
  payloadLineage: fieldSummary,
  modelProvenance: declaredModel ? 'PAYLOAD_DECLARED_ONLY' : 'PAYLOAD_LINEAGE_MISSING_OR_MIXED',
  executorReceipt: 'NOT_PRESENT_IN_QDRANT_PAYLOAD_AUDIT',
  status: !vectorShapeMatches
    ? 'VECTOR_CONTRACT_MISMATCH'
    : !representationMatches
      ? 'REPRESENTATION_DECLARATION_MISMATCH'
      : declaredModel
        ? 'REPRESENTATION_DECLARED_MODEL_NOT_EXECUTOR_PROVEN'
        : 'MODEL_PROVENANCE_NOT_PROVEN',
  disallowedInference: [
    'Vector dimension does not prove the embedding model.',
    'Collection name does not prove the embedding model.',
    'Payload labels do not prove the executor produced the vector without a linked writer or runtime receipt.',
  ],
};

mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
