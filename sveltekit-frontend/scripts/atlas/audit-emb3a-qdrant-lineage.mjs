#!/usr/bin/env node
/**
 * EMB3 F1A — read-only, collection-qualified Qdrant lineage audit.
 *
 * This script NEVER writes Postgres, Qdrant, Valkey, RabbitMQ, or canonical
 * Graphify state. It answers one question: where is each lineage field first
 * absent or unpopulated on the path into a specific Qdrant collection?
 *
 * Default target: codebase_chunks_768_v2 / semantic_768 / 768 dimensions.
 * Existing payload indexes are observed state only and never count as payload
 * population proof.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const REPORT_DIR = path.resolve(REPO_ROOT, 'docs/reports');

const COLLECTION = process.env.ATLAS_EMB3A_COLLECTION ?? 'codebase_chunks_768_v2';
const EXPECTED_REPRESENTATION = process.env.ATLAS_EMB3A_REPRESENTATION ?? 'semantic_768';
const EXPECTED_DIMENSION = Number(process.env.ATLAS_EMB3A_DIMENSION ?? '768');
const SAMPLE_LIMIT = Math.max(1, Math.min(1000, Number(process.env.ATLAS_EMB3A_SAMPLE_LIMIT ?? '250')));
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, '');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('[EMB3-F1A] DATABASE_URL is required for a read-only lineage audit.');
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

const FIELD_SPECS = [
  {
    field: 'canonical_id',
    payloadKey: 'postgres_id',
    canonicalCandidates: [
      { table: 'codebase_chunk_index', column: 'id', semantic: 'NON_NULL' },
      { table: 'atlas_packets', column: 'packet_id', semantic: 'NON_NULL' },
    ],
    snapshotCandidates: [{ table: 'codebase_chunk_index', column: 'id', semantic: 'NON_NULL' }],
  },
  {
    field: 'packet_key',
    payloadKey: 'packet_key',
    conditional: true,
    canonicalCandidates: [{ table: 'atlas_packets', column: 'packet_key', semantic: 'NON_EMPTY' }],
    snapshotCandidates: [],
  },
  {
    field: 'source_ref',
    payloadKey: 'source_ref',
    canonicalCandidates: [
      { table: 'codebase_chunk_index', column: 'source_ref', semantic: 'NON_EMPTY' },
      { table: 'codebase_chunk_index', column: 'relative_path', semantic: 'NON_EMPTY' },
      { table: 'atlas_packets', column: 'source_ref', semantic: 'NON_EMPTY' },
    ],
    snapshotCandidates: [
      { table: 'codebase_chunk_index', column: 'source_ref', semantic: 'NON_EMPTY' },
      { table: 'codebase_chunk_index', column: 'relative_path', semantic: 'NON_EMPTY' },
    ],
  },
  {
    field: 'tree_node_id',
    payloadKey: 'tree_node_id',
    conditional: true,
    canonicalCandidates: [
      { table: 'atlas_packets', column: 'tree_node_id', semantic: 'NON_EMPTY' },
      { table: 'atlas_ast_nodes', column: 'tree_node_id', semantic: 'NON_EMPTY' },
    ],
    snapshotCandidates: [],
  },
  {
    field: 'symbol_version_id',
    payloadKey: 'symbol_version_id',
    conditional: true,
    canonicalCandidates: [{ table: 'atlas_symbol_versions', column: 'symbol_version_id', semantic: 'NON_EMPTY' }],
    snapshotCandidates: [],
  },
  {
    field: 'workspace_revision',
    payloadKey: 'workspace_revision',
    canonicalCandidates: [
      { table: 'atlas_symbol_versions', column: 'workspace_revision', semantic: 'NON_EMPTY' },
      { table: 'atlas_packets', column: 'workspace_revision', semantic: 'NON_ZERO' },
    ],
    snapshotCandidates: [],
  },
  {
    field: 'source_revision',
    payloadKey: 'source_revision',
    canonicalCandidates: [
      { table: 'atlas_symbol_versions', column: 'source_revision', semantic: 'NON_EMPTY' },
      { table: 'atlas_ast_nodes', column: 'source_revision', semantic: 'NON_EMPTY' },
    ],
    snapshotCandidates: [],
  },
  {
    field: 'representation_id',
    payloadKey: 'representation_id',
    canonicalCandidates: [{ table: 'atlas_packets', column: 'source_representation_id', semantic: 'NON_EMPTY' }],
    snapshotCandidates: [],
  },
  {
    field: 'representation_revision',
    payloadKey: 'representation_revision',
    canonicalCandidates: [{ table: 'atlas_packets', column: 'representation_revision', semantic: 'NON_ZERO' }],
    snapshotCandidates: [],
  },
  {
    field: 'embedding_model_revision',
    payloadKey: 'model_revision',
    aliases: ['encoder_revision'],
    canonicalCandidates: [{ table: 'atlas_packets', column: 'encoder_revision', semantic: 'NON_EMPTY' }],
    snapshotCandidates: [],
  },
];

const BUILDER_SPECS = [
  {
    id: '768_v2_direct_backfill',
    path: 'sveltekit-frontend/scripts/atlas/backfill-qdrant-768-v2-uuid.mjs',
    collection: 'codebase_chunks_768_v2',
    transport: 'DIRECT_POSTGRES_TO_QDRANT',
  },
  {
    id: 'qdrant_sync_payload',
    path: 'sveltekit-frontend/src/lib/server/retrieval/qdrant-sync-payload.ts',
    collection: 'codebase_chunks_768',
    transport: 'PACKET_TO_QDRANT_SYNC',
  },
  {
    id: 'legacy_projection_worker',
    path: 'sveltekit-frontend/scripts/atlas/atlas-qdrant-projection-worker.mjs',
    collection: 'codebase_chunks_384_hybrid',
    transport: 'RABBITMQ_PROJECTION_JOB',
  },
];

const OUTBOX_CANDIDATES = [
  'atlas_projection_jobs',
  'integration_event_outbox',
  'atlas_outbox',
  'projection_outbox',
];

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function meaningfulExpression(column, semantic) {
  const quoted = `"${column.replaceAll('"', '""')}"`;
  if (semantic === 'NON_ZERO') return `${quoted} IS NOT NULL AND ${quoted} <> 0`;
  if (semantic === 'NON_EMPTY') return `${quoted} IS NOT NULL AND btrim(${quoted}::text) <> ''`;
  return `${quoted} IS NOT NULL`;
}

async function tableColumnExists(table, column) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

async function tableExists(table) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1 LIMIT 1`,
    [table],
  );
  return rows.length > 0;
}

async function coverage(candidate) {
  const exists = await tableColumnExists(candidate.table, candidate.column);
  if (!exists) {
    return { ...candidate, exists: false, total: null, populated: null, coveragePct: null };
  }
  const table = `"${candidate.table.replaceAll('"', '""')}"`;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::bigint AS total, COUNT(*) FILTER (WHERE ${meaningfulExpression(candidate.column, candidate.semantic)})::bigint AS populated FROM ${table}`,
  );
  const total = Number(rows[0]?.total ?? 0);
  const populated = Number(rows[0]?.populated ?? 0);
  return {
    ...candidate,
    exists: true,
    total,
    populated,
    coveragePct: total > 0 ? Number(((populated / total) * 100).toFixed(2)) : 0,
  };
}

function strongestCoverage(rows) {
  const existing = rows.filter((row) => row.exists);
  if (existing.length === 0) return { state: 'NOT_OWNED_UPSTREAM', owner: null, coveragePct: null, populated: 0, total: 0 };
  const best = [...existing].sort((a, b) => (b.coveragePct ?? 0) - (a.coveragePct ?? 0))[0];
  return {
    state: best.populated > 0 ? 'POPULATED' : 'OWNER_PRESENT_UNPOPULATED',
    owner: `${best.table}.${best.column}`,
    coveragePct: best.coveragePct,
    populated: best.populated,
    total: best.total,
  };
}

async function readBuilders() {
  const out = [];
  for (const spec of BUILDER_SPECS) {
    try {
      const text = await readFile(path.resolve(REPO_ROOT, spec.path), 'utf8');
      out.push({ ...spec, present: true, text, sha256: sha256(text) });
    } catch {
      out.push({ ...spec, present: false, text: '', sha256: null });
    }
  }
  return out;
}

function builderObservation(fieldSpec, builders) {
  const relevant = builders.filter((builder) => builder.collection === COLLECTION);
  if (relevant.length === 0) return { state: 'NO_COLLECTION_QUALIFIED_BUILDER', builders: [] };
  const tokens = [fieldSpec.payloadKey, fieldSpec.field, ...(fieldSpec.aliases ?? [])];
  const observations = relevant.map((builder) => ({
    id: builder.id,
    path: builder.path,
    transport: builder.transport,
    present: builder.present,
    mentionsField: builder.present && tokens.some((token) => builder.text.includes(token)),
    sourceSha256: builder.sha256,
  }));
  return {
    state: observations.some((item) => item.mentionsField) ? 'FIELD_REFERENCED' : 'FIELD_NOT_REFERENCED',
    builders: observations,
  };
}

async function qdrantJson(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`QDRANT_HTTP_${response.status}:${(await response.text()).slice(0, 300)}`);
  return response.json();
}

async function readQdrantState() {
  const info = await qdrantJson(`${QDRANT_URL}/collections/${encodeURIComponent(COLLECTION)}`);
  const scroll = await qdrantJson(`${QDRANT_URL}/collections/${encodeURIComponent(COLLECTION)}/points/scroll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      limit: SAMPLE_LIMIT,
      with_payload: true,
      with_vector: false,
      filter: { must_not: [{ key: '_atlas_system_record', match: { value: true } }] },
    }),
  });
  const points = scroll?.result?.points ?? [];
  const payloadSchema = info?.result?.payload_schema ?? {};
  const vectors = info?.result?.config?.params?.vectors ?? {};
  return { info: info?.result ?? null, payloadSchema, vectors, points };
}

function payloadValue(payload, fieldSpec) {
  const keys = [fieldSpec.payloadKey, ...(fieldSpec.aliases ?? [])];
  for (const key of keys) {
    const value = payload?.[key];
    if (value !== undefined && value !== null && value !== '' && value !== 0) return { key, value };
  }
  return null;
}

function qdrantFieldObservation(fieldSpec, qdrant) {
  const sampleTotal = qdrant.points.length;
  let populated = 0;
  const exampleKeys = new Set();
  for (const point of qdrant.points) {
    const hit = payloadValue(point.payload ?? {}, fieldSpec);
    if (hit) {
      populated += 1;
      exampleKeys.add(hit.key);
    }
  }
  const indexedKeys = [fieldSpec.payloadKey, ...(fieldSpec.aliases ?? [])]
    .filter((key) => Object.prototype.hasOwnProperty.call(qdrant.payloadSchema, key));
  return {
    sampleTotal,
    populated,
    coveragePct: sampleTotal > 0 ? Number(((populated / sampleTotal) * 100).toFixed(2)) : 0,
    observedKeys: [...exampleKeys].sort(),
    payloadIndexPresent: indexedKeys.length > 0,
    indexedKeys,
  };
}

function classify({ canonical, snapshot, builder, live, indexed, directTransport }) {
  if (canonical.state === 'NOT_OWNED_UPSTREAM' || canonical.state === 'OWNER_PRESENT_UNPOPULATED') {
    return 'EMB3A_BLOCKED_BY_UPSTREAM_LINEAGE';
  }
  if (snapshot.state === 'OWNER_PRESENT_UNPOPULATED') return 'EMB3A_BLOCKED_BY_SNAPSHOT_PROPAGATION';
  if (builder.state === 'FIELD_NOT_REFERENCED') return 'EMB3A_BLOCKED_BY_PROJECTION_BUILDER';
  if (live.coveragePct < 100) return 'EMB3A_BLOCKED_BY_PAYLOAD_POPULATION';
  if (!indexed && live.coveragePct === 100) return 'EMB3A_BLOCKED_BY_INDEX_CONFIGURATION';
  if (!directTransport) return 'EMB3A_BLOCKED_BY_OUTBOX_PROPAGATION';
  return 'EMB3A_LINEAGE_PROVEN';
}

function vectorDimensions(vectors) {
  if (typeof vectors?.size === 'number') return [{ name: 'default', size: vectors.size }];
  return Object.entries(vectors ?? {}).map(([name, value]) => ({ name, size: value?.size ?? null }));
}

let qdrant;
let builders;
try {
  [qdrant, builders] = await Promise.all([readQdrantState(), readBuilders()]);
} catch (error) {
  await pool.end();
  console.error('[EMB3-F1A] preflight failed:', error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const relevantBuilders = builders.filter((builder) => builder.collection === COLLECTION && builder.present);
const directTransport = relevantBuilders.some((builder) => builder.transport === 'DIRECT_POSTGRES_TO_QDRANT');
const outboxTables = [];
for (const table of OUTBOX_CANDIDATES) {
  if (await tableExists(table)) outboxTables.push(table);
}

const fieldRows = [];
for (const spec of FIELD_SPECS) {
  const canonicalCoverage = await Promise.all(spec.canonicalCandidates.map(coverage));
  const snapshotCoverage = await Promise.all((spec.snapshotCandidates ?? []).map(coverage));
  const canonical = strongestCoverage(canonicalCoverage);
  const snapshot = snapshotCoverage.length > 0
    ? strongestCoverage(snapshotCoverage)
    : { state: 'NOT_APPLICABLE_OR_NOT_PROJECTED', owner: null, coveragePct: null, populated: 0, total: 0 };
  const builder = builderObservation(spec, builders);
  const live = qdrantFieldObservation(spec, qdrant);
  const classification = classify({
    canonical,
    snapshot,
    builder,
    live,
    indexed: live.payloadIndexPresent,
    directTransport,
  });
  fieldRows.push({
    field: spec.field,
    payloadKey: spec.payloadKey,
    conditional: Boolean(spec.conditional),
    canonicalSources: canonicalCoverage,
    canonical,
    snapshotSources: snapshotCoverage,
    snapshot,
    outbox: directTransport
      ? { state: 'NOT_APPLICABLE_DIRECT_BACKFILL', tablesObserved: outboxTables }
      : { state: outboxTables.length > 0 ? 'OBSERVED_UNTRACED' : 'NO_OUTBOX_TABLE_OBSERVED', tablesObserved: outboxTables },
    builder,
    livePayload: live,
    indexed: live.payloadIndexPresent,
    classification,
  });
}

const representationPayload = qdrant.points
  .map((point) => point.payload ?? {})
  .filter((payload) => payload.representation_name || payload.representation_id)
  .slice(0, 20)
  .map((payload) => ({
    representation_name: payload.representation_name ?? null,
    representation_id: payload.representation_id ?? null,
    representation_revision: payload.representation_revision ?? null,
    projection_revision: payload.projection_revision ?? null,
    embedding_model: payload.embedding_model ?? null,
    model_revision: payload.model_revision ?? null,
  }));

const vectorSchema = vectorDimensions(qdrant.vectors);
const dimensionMatches = vectorSchema.some((entry) => entry.size === EXPECTED_DIMENSION);
const representationNameCoverage = qdrant.points.length > 0
  ? qdrant.points.filter((point) => point.payload?.representation_name === EXPECTED_REPRESENTATION).length / qdrant.points.length
  : 0;

const blockingOrder = [
  'EMB3A_BLOCKED_BY_UPSTREAM_LINEAGE',
  'EMB3A_BLOCKED_BY_SNAPSHOT_PROPAGATION',
  'EMB3A_BLOCKED_BY_OUTBOX_PROPAGATION',
  'EMB3A_BLOCKED_BY_PROJECTION_BUILDER',
  'EMB3A_BLOCKED_BY_STALE_FIXTURE',
  'EMB3A_BLOCKED_BY_PAYLOAD_POPULATION',
  'EMB3A_BLOCKED_BY_INDEX_CONFIGURATION',
];
const firstBlockingClass = blockingOrder.find((state) => fieldRows.some((row) => row.classification === state)) ?? null;

const reportCore = {
  schema: 'atlas.emb3a-qdrant-lineage-audit.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  collection: COLLECTION,
  expectedRepresentation: {
    name: EXPECTED_REPRESENTATION,
    dimension: EXPECTED_DIMENSION,
    source: 'collection-qualified writer/projection contract',
  },
  observedCollection: {
    status: qdrant.info?.status ?? null,
    pointsCount: qdrant.info?.points_count ?? null,
    sampleSize: qdrant.points.length,
    vectorSchema,
    dimensionMatches,
    representationNameCoveragePct: Number((representationNameCoverage * 100).toFixed(2)),
    payloadSchemaKeys: Object.keys(qdrant.payloadSchema).sort(),
  },
  writers: builders.map(({ text, ...builder }) => builder),
  outboxTablesObserved: outboxTables,
  fields: fieldRows,
  representationSamples: representationPayload,
  firstBlockingClass,
  status: firstBlockingClass ? firstBlockingClass : 'EMB3A_LINEAGE_PROVEN',
  invariants: [
    'payloadIndexPresent != qdrantPayloadPresent',
    'vectorDimension does not synthesize representation_id',
    'workspace_revision/source_revision are never inferred from timestamps, hashes, or representation metadata',
    'collection qualification is required before representation assertions',
    'audit performs no canonical or projection writes',
  ],
};

const report = { ...reportCore, outputChecksum: sha256(reportCore) };
const jsonPath = path.resolve(REPORT_DIR, 'emb3a-qdrant-lineage-audit.json');
const mdPath = path.resolve(REPORT_DIR, 'emb3a-qdrant-lineage-audit.md');
await mkdir(REPORT_DIR, { recursive: true });
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const tableRows = fieldRows.map((row) =>
  `| \`${row.field}\` | ${row.canonical.state}${row.canonical.owner ? ` (${row.canonical.owner}, ${row.canonical.coveragePct}%)` : ''} | ${row.snapshot.state} | ${row.outbox.state} | ${row.builder.state} | ${row.livePayload.coveragePct}% | ${row.indexed ? 'YES' : 'NO'} | ${row.classification} |`,
);
await writeFile(mdPath, [
  '# EMB3A Qdrant lineage audit',
  '',
  `- status: **${report.status}**`,
  `- mode: **${report.mode}**`,
  `- collection: \`${COLLECTION}\``,
  `- expected representation: \`${EXPECTED_REPRESENTATION}\` (${EXPECTED_DIMENSION}d)`,
  `- sampled live payloads: ${qdrant.points.length}`,
  `- first blocking class: ${firstBlockingClass ?? 'none'}`,
  `- output checksum: \`${report.outputChecksum}\``,
  '',
  '> Existing Qdrant payload indexes are observed configuration only. They do not prove that any sampled point contains a populated value.',
  '',
  '| Field | Canonical source | Snapshot | Outbox | Builder | Live payload coverage | Indexed | Classification |',
  '|---|---|---|---|---|---:|---|---|',
  ...tableRows,
  '',
  '## Representation qualification',
  '',
  `- dimension matches expected collection contract: ${dimensionMatches ? 'YES' : 'NO'}`,
  `- representation_name exact-match coverage: ${(representationNameCoverage * 100).toFixed(2)}%`,
  '- representation_id is never inferred from vector dimension.',
  '- source_revision/workspace_revision are never synthesized when canonical ownership is absent or unpopulated.',
  '',
  '## Safe next action',
  '',
  'Patch only the first broken boundary identified above, then rerun this read-only audit and Qdrant readback before changing payload indexes.',
  '',
].join('\n'), 'utf8');

await pool.end();
console.log(JSON.stringify({
  status: report.status,
  collection: COLLECTION,
  sampleSize: qdrant.points.length,
  firstBlockingClass,
  jsonPath,
  mdPath,
  outputChecksum: report.outputChecksum,
}, null, 2));

process.exitCode = report.status === 'EMB3A_LINEAGE_PROVEN' ? 0 : 3;
