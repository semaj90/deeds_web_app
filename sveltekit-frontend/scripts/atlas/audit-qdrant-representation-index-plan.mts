#!/usr/bin/env npx tsx
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  QDRANT_CODEBASE_768_INDEX_PLAN,
  compareQdrantSchemaToPlan,
  qdrantRepresentationIndexPlanDigest,
  type QdrantSchemaObservationV1,
} from '../../src/lib/server/atlas/qdrant/qdrant-representation-index-plan-v1.js';

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const collectionArg = process.argv.find((arg) => arg.startsWith('--collection='));
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const sampleArg = process.argv.find((arg) => arg.startsWith('--sample='));
const COLLECTION = collectionArg?.split('=')[1] || QDRANT_CODEBASE_768_INDEX_PLAN.collection;
const SAMPLE = Math.max(1, Math.min(1000, Number(sampleArg?.split('=')[1] ?? 100)));
const OUTPUT = resolve(outputArg?.split('=')[1] ?? 'docs/reports/qdrant-representation-index-audit.json');

async function getJson(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(`${QDRANT_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Qdrant ${response.status} ${path}: ${(await response.text()).slice(0, 500)}`);
  return response.json();
}

function normalizePayloadType(value: unknown): string {
  if (typeof value === 'string') return value.toLowerCase();
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const dataType = record.data_type ?? record.type ?? record.field_type;
    if (typeof dataType === 'string') return dataType.toLowerCase();
  }
  return 'unknown';
}

function normalizeDistance(value: unknown): string {
  return typeof value === 'string' ? value : 'unknown';
}

function normalizeModifier(value: unknown): string | null {
  if (typeof value === 'string') return value.toLowerCase();
  return null;
}

function normalizeCollectionInfo(raw: any): QdrantSchemaObservationV1 {
  const result = raw?.result ?? raw;
  const params = result?.config?.params ?? result?.config?.collection_params ?? {};
  const vectors = params?.vectors ?? {};
  const sparse = params?.sparse_vectors ?? {};
  const payloadSchema = result?.payload_schema ?? result?.config?.payload_schema ?? {};

  const denseVectors: QdrantSchemaObservationV1['denseVectors'] = {};
  if (vectors && typeof vectors === 'object' && !Array.isArray(vectors)) {
    if (typeof vectors.size === 'number') {
      denseVectors.default = { size: vectors.size, distance: normalizeDistance(vectors.distance) };
    } else {
      for (const [name, config] of Object.entries(vectors)) {
        if (!config || typeof config !== 'object') continue;
        const record = config as Record<string, unknown>;
        if (typeof record.size === 'number') denseVectors[name] = { size: record.size, distance: normalizeDistance(record.distance) };
      }
    }
  }

  const sparseVectors: QdrantSchemaObservationV1['sparseVectors'] = {};
  if (sparse && typeof sparse === 'object') {
    for (const [name, config] of Object.entries(sparse)) {
      const record = (config && typeof config === 'object') ? config as Record<string, unknown> : {};
      sparseVectors[name] = { modifier: normalizeModifier(record.modifier) };
    }
  }

  const normalizedPayloadSchema: Record<string, string> = {};
  if (payloadSchema && typeof payloadSchema === 'object') {
    for (const [field, config] of Object.entries(payloadSchema)) normalizedPayloadSchema[field] = normalizePayloadType(config);
  }

  return { denseVectors, sparseVectors, payloadSchema: normalizedPayloadSchema };
}

async function samplePayloadCoverage(): Promise<Record<string, { present: number; total: number }>> {
  const response = await getJson(`/collections/${encodeURIComponent(COLLECTION)}/points/scroll`, {
    method: 'POST',
    body: JSON.stringify({ limit: SAMPLE, with_payload: true, with_vector: false }),
  });
  const points = response?.result?.points ?? [];
  const fields = QDRANT_CODEBASE_768_INDEX_PLAN.payloadIndexes.map((field) => field.fieldName);
  const coverage: Record<string, { present: number; total: number }> = Object.fromEntries(fields.map((field) => [field, { present: 0, total: points.length }]));
  for (const point of points) {
    const payload = point?.payload ?? {};
    for (const field of fields) {
      if (payload[field] !== undefined && payload[field] !== null) coverage[field].present += 1;
    }
  }
  return coverage;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function main(): Promise<void> {
  if (COLLECTION !== QDRANT_CODEBASE_768_INDEX_PLAN.collection) {
    throw new Error(`QDRANT_PLAN_COLLECTION_MISMATCH:${COLLECTION}:${QDRANT_CODEBASE_768_INDEX_PLAN.collection}`);
  }

  const collectionInfo = await getJson(`/collections/${encodeURIComponent(COLLECTION)}`);
  const observation = normalizeCollectionInfo(collectionInfo);
  const drift = compareQdrantSchemaToPlan(observation);
  const payloadCoverage = await samplePayloadCoverage();

  const receipt = {
    schema: 'atlas.qdrant-representation-index-audit.v1',
    auditedAt: new Date().toISOString(),
    qdrantUrl: QDRANT_URL,
    collection: COLLECTION,
    planRevision: QDRANT_CODEBASE_768_INDEX_PLAN.planRevision,
    planSha256: qdrantRepresentationIndexPlanDigest(),
    observation,
    drift,
    payloadCoverageSample: {
      sampleRequested: SAMPLE,
      fields: payloadCoverage,
    },
    modelProvenance: {
      content: 'UNPROVEN_HISTORICAL_MODEL',
      error: 'UNPROVEN_HISTORICAL_MODEL',
      signature: 'UNPROVEN_HISTORICAL_MODEL',
      inferenceFromDimensionForbidden: true,
    },
    sparseStatus: {
      bm25RequiredForTargetReady: true,
      minicoilChallengerOnly: true,
      spladeChallengerOnly: true,
      sparseDerivedFromDenseForbidden: true,
    },
    invariants: {
      canonicalTruthOwner: 'POSTGRES',
      qdrantProjectionOnly: true,
      oneVotePerLogicalLane: true,
      laneExecutorSeparation: true,
      payloadIndexesDoNotCreateIdentity: true,
    },
    mutations: {
      qdrantWritesAttempted: false,
      payloadIndexesCreated: false,
      vectorSchemaChanged: false,
      pointPayloadsChanged: false,
      canonicalWritesAttempted: false,
    },
  };

  const finalReceipt = { ...receipt, receiptSha256: digest(receipt) };
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(finalReceipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(finalReceipt, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
