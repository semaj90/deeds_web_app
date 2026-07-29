#!/usr/bin/env node
/**
 * Phase 108E Step 5: Qdrant payload indexes for codebase_chunks_768_v2.
 *
 * This script:
 * - audits live payload coverage
 * - builds a deterministic dry-run plan
 * - applies only compatible indexes
 * - rejects legacy collection targets
 *
 * Usage:
 *   node scripts/atlas/phase108e-step5-payload-indexes.mjs
 *   node scripts/atlas/phase108e-step5-payload-indexes.mjs --apply
 *   node scripts/atlas/phase108e-step5-payload-indexes.mjs --collection codebase_chunks_768_v2
 */

import { pathToFileURL } from 'node:url';

export const TARGET_COLLECTION = 'codebase_chunks_768_v2';
export const CANDIDATE_FIELDS = [
  'postgres_id',
  'source_ref',
  'chunk_id',
  'content_hash',
  'representation_name',
  'representation_id',
  'embedding_model',
  'model_revision',
  'model_revision_state',
  'projection_revision',
  'corpus_revision',
  'domain',
  'language',
  'kind',
  'artifact_kind',
  'semantic_tags',
  'feature_ids',
  'community_id',
  'page_rank_score',
  'evidence_state',
  'qdrant_point_id',
  'indexed_at',
];

const DEFAULT_QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(
  /^0\.0\.0\.0/,
  '127.0.0.1'
);

export function assertAllowedCollection(collectionName) {
  if (collectionName !== TARGET_COLLECTION) {
    throw new Error(
      `Refusing to index ${collectionName}; this step only targets ${TARGET_COLLECTION}`
    );
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const dryRun = !argv.includes('--apply');
  const collectionIndex = argv.indexOf('--collection');
  const collection =
    collectionIndex >= 0 && argv[collectionIndex + 1] ? argv[collectionIndex + 1] : TARGET_COLLECTION;
  return { dryRun, collection };
}

function inferFieldSchema(typeCounts) {
  const entries = Object.entries(typeCounts ?? {}).filter(([type, count]) => type !== 'null' && count > 0);
  if (entries.length === 0) return null;

  const uniqueTypes = new Set(entries.map(([type]) => type));
  if (uniqueTypes.size > 1) {
    throw new Error(
      `Unsupported mixed payload types: ${entries.map(([type, count]) => `${type}:${count}`).join(', ')}`
    );
  }

  const [type] = entries[0];
  if (type === 'integer') return 'integer';
  if (type === 'float' || type === 'number') return 'float';
  if (type === 'string' || type === 'boolean' || type === 'object') return 'keyword';
  throw new Error(`Unsupported payload type: ${type}`);
}

function emptyFieldStat() {
  return { nonNull: 0, coveragePct: 0, typeCounts: {}, distinct: 0, samples: [] };
}

export async function getCollectionInfo(fetchImpl, qdrantUrl, collectionName) {
  const response = await fetchImpl(`${qdrantUrl}/collections/${collectionName}`);
  if (!response.ok) {
    throw new Error(
      `Unable to read collection ${collectionName}: HTTP ${response.status} ${await response.text()}`
    );
  }
  const json = await response.json();
  return json.result ?? {};
}

export async function collectPayloadCoverage(fetchImpl, qdrantUrl, collectionName) {
  const fieldStats = Object.fromEntries(
    CANDIDATE_FIELDS.map((field) => [field, { ...emptyFieldStat(), distinctValues: new Set() }])
  );
  let pointsCount = 0;
  let offset = null;

  while (true) {
    const body = { limit: 1000, with_payload: true, with_vector: false };
    if (offset !== null) body.offset = offset;

    const response = await fetchImpl(`${qdrantUrl}/collections/${collectionName}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Qdrant scroll failed: HTTP ${response.status} ${await response.text()}`);
    }

    const json = await response.json();
    const points = json.result?.points ?? [];
    pointsCount += points.length;

    for (const point of points) {
      const payload = point.payload ?? {};
      for (const field of CANDIDATE_FIELDS) {
        const value = payload[field];
        if (value === undefined || value === null) continue;

        const stat = fieldStats[field];
        stat.nonNull += 1;
        const type = Array.isArray(value)
          ? `array:${value.length}`
          : typeof value === 'number'
            ? Number.isInteger(value)
              ? 'integer'
              : 'float'
            : typeof value;
        stat.typeCounts[type] = (stat.typeCounts[type] ?? 0) + 1;
        stat.distinctValues.add(typeof value === 'object' ? JSON.stringify(value) : String(value));
        if (stat.samples.length < 3) stat.samples.push(value);
      }
    }

    offset = json.result?.next_page_offset ?? null;
    if (offset === null) break;
  }

  for (const field of CANDIDATE_FIELDS) {
    const stat = fieldStats[field];
    stat.coveragePct = pointsCount ? Number(((stat.nonNull * 100) / pointsCount).toFixed(2)) : 0;
    stat.distinct = stat.distinctValues?.size ?? stat.nonNull;
    delete stat.distinctValues;
  }

  return { pointsCount, fieldStats };
}

export function buildIndexPlan({ collectionName, pointsCount, fieldStats, existingSchema = {} }) {
  assertAllowedCollection(collectionName);

  const plannedIndexes = [];
  const skippedFields = [];

  for (const field of CANDIDATE_FIELDS) {
    const stats = fieldStats[field] ?? emptyFieldStat();
    const existingIndex = existingSchema[field]?.data_type ?? null;
    const proposedSchema = inferFieldSchema(stats.typeCounts);

    if (!proposedSchema || stats.nonNull === 0) {
      skippedFields.push({
        field,
        observed_type: proposedSchema,
        coverage: stats.nonNull,
        coverage_pct: stats.coveragePct ?? 0,
        existing_index: existingIndex,
        proposed_schema: proposedSchema,
        action: 'SKIP',
        reason: 'coverage zero or no indexable type observed',
      });
      continue;
    }

    if (existingIndex && existingIndex !== proposedSchema) {
      throw new Error(`Index conflict for ${field}: existing=${existingIndex} proposed=${proposedSchema}`);
    }

    plannedIndexes.push({
      field,
      observed_type: proposedSchema,
      coverage: stats.nonNull,
      coverage_pct: stats.coveragePct ?? 0,
      distinct: stats.distinct ?? 0,
      existing_index: existingIndex,
      proposed_schema: proposedSchema,
      action: existingIndex ? 'KEEP' : 'CREATE',
    });
  }

  return {
    collection: collectionName,
    points_count: pointsCount,
    planned_indexes: plannedIndexes,
    skipped_fields: skippedFields,
  };
}

export async function createPayloadIndex(fetchImpl, qdrantUrl, collectionName, field, schema) {
  const response = await fetchImpl(`${qdrantUrl}/collections/${collectionName}/index`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field_name: field, field_schema: schema }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (response.status === 409 || /already exists/i.test(text)) {
      return { field, schema, status: 'exists', body: text };
    }
    throw new Error(`Failed to create payload index ${field} (${schema}): HTTP ${response.status} ${text}`);
  }

  return { field, schema, status: 'created' };
}

export async function runStep5({
  fetchImpl = globalThis.fetch,
  qdrantUrl = DEFAULT_QDRANT_URL,
  collectionName = TARGET_COLLECTION,
  dryRun = true,
} = {}) {
  assertAllowedCollection(collectionName);

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available in this runtime');
  }

  const collectionInfo = await getCollectionInfo(fetchImpl, qdrantUrl, collectionName);
  const coverage = await collectPayloadCoverage(fetchImpl, qdrantUrl, collectionName);
  const existingSchema = collectionInfo.payload_schema ?? {};
  const plan = buildIndexPlan({
    collectionName,
    pointsCount: coverage.pointsCount,
    fieldStats: coverage.fieldStats,
    existingSchema,
  });

  const dryRunPlan = {
    collection: collectionName,
    points_count: coverage.pointsCount,
    collection_status: collectionInfo.status ?? null,
    optimizer_status: collectionInfo.optimizer_status ?? null,
    vectors: collectionInfo.config?.params?.vectors ?? collectionInfo.vectors ?? null,
    planned_indexes: plan.planned_indexes,
    skipped_fields: plan.skipped_fields,
  };

  if (dryRun) {
    return { mode: 'dry-run', ...dryRunPlan };
  }

  const applied = [];
  for (const indexSpec of plan.planned_indexes) {
    if (indexSpec.action === 'KEEP') {
      applied.push({ ...indexSpec, status: 'existing' });
      continue;
    }
    const result = await createPayloadIndex(
      fetchImpl,
      qdrantUrl,
      collectionName,
      indexSpec.field,
      indexSpec.proposed_schema
    );
    applied.push({ ...indexSpec, status: result.status });
  }

  const verified = await getCollectionInfo(fetchImpl, qdrantUrl, collectionName);
  return {
    mode: 'apply',
    ...dryRunPlan,
    applied_indexes: applied,
    verified_payload_schema: verified.payload_schema ?? {},
  };
}

export async function main(argv = process.argv.slice(2), fetchImpl = globalThis.fetch) {
  const { dryRun, collection } = parseArgs(argv);
  const report = await runStep5({
    fetchImpl,
    qdrantUrl: DEFAULT_QDRANT_URL,
    collectionName: collection,
    dryRun,
  });
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
