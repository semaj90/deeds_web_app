#!/usr/bin/env node
/**
 * QDRANT 768 PROV 00-02 — read-only historical embedding provenance census.
 *
 * This script intentionally does not request vector bytes and never writes to
 * Qdrant/Postgres/Valkey/Neo4j. It separates three evidence classes:
 *
 *   PROV 00 collection contract/config observation
 *   PROV 01 repository writer census
 *   PROV 02 payload provenance census grouped by historical point-id generation
 *
 * It does NOT perform exact packet lineage (PROV 03) or numerical recreation
 * (PROV 05), and therefore cannot emit full PROVEN embedding provenance.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildEmbeddingProvenanceCohortV1,
  type EmbeddingProvenanceCohortInputV1,
} from '../../../packages/parent-atlas/src/core/qdrant-embedding-provenance-v1.js';
import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
const REPORT_DIR = path.resolve(REPO_ROOT, 'docs/reports');
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, '');
const SAMPLE_LIMIT = Math.max(
  1,
  Math.min(1000, Number(process.env.ATLAS_QDRANT_768_PROV_SAMPLE_LIMIT ?? '250')),
);
const COLLECTIONS = (process.env.ATLAS_QDRANT_768_PROV_COLLECTIONS ??
  'codebase_chunks_768_v2,codebase_chunks_768')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const REPORT_JSON = path.resolve(REPORT_DIR, 'qdrant-768-provenance-census.json');
const REPORT_MD = path.resolve(REPORT_DIR, 'qdrant-768-provenance-census.md');

const WRITER_SPECS = [
  {
    id: 'v2_uuid_clean_backfill',
    path: 'sveltekit-frontend/scripts/atlas/backfill-qdrant-768-v2-uuid.mjs',
    collections: ['codebase_chunks_768_v2'],
  },
  {
    id: 'v2_keyset_backfill',
    path: 'sveltekit-frontend/scripts/atlas/backfill-qdrant-768-keyset.mjs',
    collections: ['codebase_chunks_768', 'codebase_chunks_768_v2'],
  },
  {
    id: 'phase109_pointwise_backfill',
    path: 'scripts/atlas/phase109-qdrant-pointwise-backfill.mts',
    collections: ['codebase_chunks_768', 'codebase_chunks_768_v2'],
  },
  {
    id: 'qdrant_manager',
    path: 'sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts',
    collections: ['codebase_chunks_768', 'codebase_chunks_768_v2'],
  },
  {
    id: 'qdrant_sync_payload',
    path: 'sveltekit-frontend/src/lib/server/retrieval/qdrant-sync-payload.ts',
    collections: ['codebase_chunks_768', 'codebase_chunks_768_v2'],
  },
] as const;

const OBSERVED_PAYLOAD_KEYS = [
  'representation_id',
  'representation_name',
  'representation_revision',
  'embedding_model',
  'embedding_model_id',
  'embedding_model_digest',
  'model_artifact_digest',
  'model_revision',
  'model_revision_state',
  'embedding_runtime',
  'embedding_runtime_revision',
  'prompt_mode',
  'prompt_revision',
  'normalization',
  'normalization_revision',
  'writer_revision',
  'projection_revision',
  'workspace_revision',
  'workspace_world_revision',
  'source_revision',
  'packet_key',
  'canonical_id',
  'symbol_version_id',
  'tree_node_id',
  'source_ref',
] as const;

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value: unknown): string {
  const normalize = (child: unknown): unknown => {
    if (Array.isArray(child)) return child.map(normalize);
    if (child && typeof child === 'object') {
      return Object.fromEntries(
        Object.entries(child as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => [key, normalize(value)]),
      );
    }
    return child;
  };
  return JSON.stringify(normalize(value));
}

async function qdrantJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`QDRANT_HTTP_${response.status}:${(await response.text()).slice(0, 300)}`);
  }
  return response.json();
}

function pointIdGeneration(id: unknown): string {
  if (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0) return 'NUMERIC';
  const text = String(id ?? '');
  if (/^[0-9]+$/.test(text)) return 'NUMERIC_STRING';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    return 'UUID';
  }
  if (text.startsWith('card:')) return 'CARD_PREFIX';
  if (/^[0-9a-f]{64}$/i.test(text)) return 'SHA256_HEX';
  if (text.includes(':')) return 'PREFIXED_STRING';
  return text ? 'OPAQUE_STRING' : 'MISSING_ID';
}

function meaningful(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function observedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    OBSERVED_PAYLOAD_KEYS
      .filter((key) => meaningful(payload[key]))
      .map((key) => [key, payload[key]]),
  );
}

function scalarString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function firstString(payload: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = scalarString(payload[key]);
    if (value !== null) return value;
  }
  return null;
}

function distinctValues(points: any[], keys: readonly string[]): string[] {
  const values = new Set<string>();
  for (const point of points) {
    const payload = (point?.payload ?? {}) as Record<string, unknown>;
    for (const key of keys) {
      const value = scalarString(payload[key]);
      if (value !== null) values.add(`${key}=${value}`);
    }
  }
  return [...values].sort();
}

function mixedField(points: any[], keys: readonly string[]): boolean {
  const semanticValues = new Set<string>();
  for (const point of points) {
    const payload = (point?.payload ?? {}) as Record<string, unknown>;
    const value = firstString(payload, keys);
    if (value !== null) semanticValues.add(value);
  }
  return semanticValues.size > 1;
}

function vectorConfigRows(vectors: unknown): Array<Record<string, unknown>> {
  if (!vectors || typeof vectors !== 'object') return [];
  const record = vectors as Record<string, any>;
  if (typeof record.size === 'number') {
    return [{
      vector_name: 'default',
      size: record.size,
      distance: record.distance ?? null,
      datatype: record.datatype ?? null,
      on_disk: record.on_disk ?? null,
    }];
  }
  return Object.entries(record).map(([name, value]) => ({
    vector_name: name,
    size: value?.size ?? null,
    distance: value?.distance ?? null,
    datatype: value?.datatype ?? null,
    on_disk: value?.on_disk ?? null,
  }));
}

async function readCollection(collection: string): Promise<{
  contract: Record<string, unknown>;
  points: any[];
}> {
  const infoJson = await qdrantJson(
    `${QDRANT_URL}/collections/${encodeURIComponent(collection)}`,
  );
  const info = infoJson?.result ?? {};
  const params = info?.config?.params ?? {};
  const scrollJson = await qdrantJson(
    `${QDRANT_URL}/collections/${encodeURIComponent(collection)}/points/scroll`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        limit: SAMPLE_LIMIT,
        with_payload: true,
        with_vector: false,
      }),
    },
  );
  const points = scrollJson?.result?.points ?? [];

  return {
    contract: {
      collection,
      status: info?.status ?? null,
      points_count: info?.points_count ?? null,
      indexed_vectors_count: info?.indexed_vectors_count ?? null,
      vectors: vectorConfigRows(params?.vectors),
      sparse_vectors: Object.keys(params?.sparse_vectors ?? {}).sort(),
      hnsw_config: info?.config?.hnsw_config ?? null,
      quantization_config: info?.config?.quantization_config ?? null,
      strict_mode_config: info?.config?.strict_mode_config ?? null,
      metadata: info?.config?.metadata ?? info?.metadata ?? null,
      payload_schema_keys: Object.keys(info?.payload_schema ?? {}).sort(),
    },
    points,
  };
}

async function readWriterCensus(): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const spec of WRITER_SPECS) {
    const absolutePath = path.resolve(REPO_ROOT, spec.path);
    try {
      const text = await readFile(absolutePath, 'utf8');
      const vectorNames = ['content', 'error', 'signature']
        .filter((name) => text.includes(`'${name}'`) || text.includes(`\"${name}\"`));
      rows.push({
        writer_generation: spec.id,
        path: spec.path,
        source_sha256: sha256(text),
        present: true,
        declared_collections: spec.collections,
        collection_mentions: COLLECTIONS.filter((collection) => text.includes(collection)),
        vector_name_mentions: vectorNames,
        provenance_field_mentions: OBSERVED_PAYLOAD_KEYS.filter((key) => text.includes(key)),
        embedding_endpoint_mentions: [...text.matchAll(/https?:\/\/[^'"`\s]+|127\.0\.0\.1:\d+|localhost:\d+/g)]
          .map((match) => match[0])
          .filter((value, index, all) => all.indexOf(value) === index)
          .slice(0, 20),
      });
    } catch {
      rows.push({
        writer_generation: spec.id,
        path: spec.path,
        present: false,
        declared_collections: spec.collections,
      });
    }
  }
  return rows;
}

function buildPayloadCohorts(
  collection: string,
  collectionPointCount: number,
  points: any[],
): Array<ReturnType<typeof buildEmbeddingProvenanceCohortV1> & {
  vector_membership_observed: false;
  observed_payload_values: Record<string, string[]>;
}> {
  const byGeneration = new Map<string, any[]>();
  for (const point of points) {
    const generation = pointIdGeneration(point?.id);
    const bucket = byGeneration.get(generation) ?? [];
    bucket.push(point);
    byGeneration.set(generation, bucket);
  }

  return [...byGeneration.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([generation, cohortPoints]) => {
      const payloads = cohortPoints.map((point) => (point?.payload ?? {}) as Record<string, unknown>);
      const valuesFor = (keys: readonly string[]) => distinctValues(cohortPoints, keys);
      const mixedFields = [
        ['writer_revision', ['writer_revision'] as const],
        ['projection_revision', ['projection_revision'] as const],
        ['representation_id', ['representation_id', 'representation_name'] as const],
        ['representation_revision', ['representation_revision'] as const],
        ['model_id', ['embedding_model_id', 'embedding_model'] as const],
        ['prompt_mode', ['prompt_mode'] as const],
        ['prompt_revision', ['prompt_revision'] as const],
        ['normalization', ['normalization'] as const],
        ['normalization_revision', ['normalization_revision'] as const],
      ]
        .filter(([, keys]) => mixedField(cohortPoints, keys as readonly string[]))
        .map(([name]) => name as string)
        .sort();

      const first = payloads[0] ?? {};
      const input: EmbeddingProvenanceCohortInputV1 = {
        collection,
        // Payload-only scroll deliberately cannot prove which named vector on
        // a multi-vector point a provenance field belongs to.
        vector_name: '__collection_payload__',
        point_id_generation: generation,
        writer_generation:
          firstString(first, ['projection_revision', 'writer_revision']) ?? 'UNKNOWN_WRITER_GENERATION',
        writer_revision: firstString(first, ['writer_revision']),
        projection_revision: firstString(first, ['projection_revision']),
        representation_id: firstString(first, ['representation_id', 'representation_name']),
        representation_revision: firstString(first, ['representation_revision']),
        point_count: collectionPointCount,
        sample_count: cohortPoints.length,
        model_id: firstString(first, ['embedding_model_id', 'embedding_model']),
        // embedding_digest is intentionally NOT treated as a model artifact
        // digest; existing Atlas vocabulary can use it for vector/content bytes.
        model_artifact_digest: firstString(first, [
          'model_artifact_digest',
          'embedding_model_digest',
        ]),
        embedding_runtime: firstString(first, ['embedding_runtime']),
        embedding_runtime_revision: firstString(first, ['embedding_runtime_revision']),
        prompt_mode: firstString(first, ['prompt_mode']),
        prompt_revision: firstString(first, ['prompt_revision']),
        normalization: firstString(first, ['normalization']),
        normalization_revision: firstString(first, ['normalization_revision']),
        exact_packet_links: 0,
        unresolved_links: cohortPoints.length,
        evidence_level: 'PAYLOAD_OBSERVED',
        mixed_fields: mixedFields,
      };

      const cohort = buildEmbeddingProvenanceCohortV1(input);
      return {
        ...cohort,
        vector_membership_observed: false as const,
        observed_payload_values: Object.fromEntries(
          [
            ['representation', ['representation_id', 'representation_name']],
            ['representation_revision', ['representation_revision']],
            ['model', ['embedding_model_id', 'embedding_model']],
            ['model_revision', ['model_revision', 'model_revision_state']],
            ['prompt', ['prompt_mode', 'prompt_revision']],
            ['normalization', ['normalization', 'normalization_revision']],
            ['writer', ['writer_revision', 'projection_revision']],
            ['world', ['workspace_world_revision', 'workspace_revision', 'source_revision']],
            ['identity', ['packet_key', 'canonical_id', 'symbol_version_id', 'tree_node_id', 'source_ref']],
          ].map(([name, keys]) => [name, valuesFor(keys as readonly string[])]),
        ),
      };
    });
}

const startedAt = new Date().toISOString();
let collectionReads: Array<{
  contract: Record<string, unknown>;
  points: any[];
}>;
let writers: Array<Record<string, unknown>>;

try {
  [collectionReads, writers] = await Promise.all([
    Promise.all(COLLECTIONS.map(readCollection)),
    readWriterCensus(),
  ]);
} catch (error) {
  console.error(
    '[QDRANT-768-PROV] read-only preflight failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exit(2);
}

const payloadCohorts = collectionReads.flatMap(({ contract, points }) =>
  buildPayloadCohorts(
    String(contract.collection),
    Number(contract.points_count ?? points.length),
    points,
  ),
);

const reportWithoutChecksum = {
  schema_id: 'atlas.qdrant.768.provenance.census.v1',
  status: 'QDRANT_768_PROVENANCE_CENSUS_COMPLETE',
  observed_at: startedAt,
  qdrant_url: QDRANT_URL,
  sample_limit: SAMPLE_LIMIT,
  collections: collectionReads.map(({ contract }) => contract),
  writers,
  payload_cohorts: payloadCohorts,
  proof_scope: {
    prov_00_collection_contract: true,
    prov_01_writer_census: true,
    prov_02_payload_census: true,
    prov_03_exact_packet_lineage: false,
    prov_04_generation_cohort_promotion: false,
    prov_05_numerical_corroboration: false,
  },
  invariants: {
    canonical_authority: false,
    qdrant_writes_attempted: false,
    postgres_writes_attempted: false,
    vectors_requested: false,
    payload_only_scroll: true,
    collection_contract_is_not_historical_provenance: true,
    collection_payload_is_not_vector_specific_provenance: true,
  },
};
const report = {
  ...reportWithoutChecksum,
  checksum: sha256(canonicalJson(reportWithoutChecksum)),
};

await mkdir(REPORT_DIR, { recursive: true });
await writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const statusCounts = new Map<string, number>();
for (const cohort of payloadCohorts) {
  statusCounts.set(cohort.status, (statusCounts.get(cohort.status) ?? 0) + 1);
}

const markdown = `# Qdrant 768 historical embedding provenance census\n\n` +
  `Status: **${report.status}**\n\n` +
  `This is a read-only PROV 00-02 census. It requested payloads but no vector bytes and performed no store writes.\n\n` +
  `## Collections\n\n` +
  collectionReads.map(({ contract }) =>
    `- \`${contract.collection}\`: points=${contract.points_count ?? 'unknown'}, vectors=${JSON.stringify(contract.vectors)}`,
  ).join('\n') +
  `\n\n## Payload cohort status\n\n` +
  [...statusCounts.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `- ${status}: ${count}`)
    .join('\n') +
  `\n\n## Promotion boundary\n\n` +
  `PROV 03 exact packet lineage and PROV 05 numerical corroboration are intentionally not performed here. ` +
  `A 768/Cosine collection or an embedding_model string is not sufficient evidence for full model/prompt/runtime provenance.\n`;

await writeFile(REPORT_MD, markdown, 'utf8');

console.log(JSON.stringify({
  status: report.status,
  collections: COLLECTIONS,
  sampled_points: collectionReads.reduce((sum, item) => sum + item.points.length, 0),
  cohort_status_counts: Object.fromEntries(statusCounts),
  vectors_requested: false,
  writes_attempted: false,
  report_json: path.relative(REPO_ROOT, REPORT_JSON),
  report_md: path.relative(REPO_ROOT, REPORT_MD),
  checksum: report.checksum,
}, null, 2));
