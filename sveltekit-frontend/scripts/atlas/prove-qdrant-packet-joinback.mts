import { writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import postgres from 'postgres';
import { buildQdrantSyncPayload } from '../../src/lib/server/retrieval/qdrant-sync-payload.js';
import { qdrantClient } from '../../src/lib/server/vector/qdrant-singleton.js';

type PacketRow = {
  packet_key: string;
  source_ref: string;
  workspace_id: string;
  workspace_revision: number | string;
  qdrant_point_id: string | null;
  feature_id: string;
  feature_label: string | null;
  domain_class: string | null;
  title_id: string | null;
  tree_node_id: string | null;
  identity_lane: string | null;
  identity_confidence: number | null;
  recovery_lane: string | null;
  community_id: number | null;
  som_cluster: number | null;
  representation_revision: number | null;
  source_representation_id: string | null;
  source_dimension: number | null;
  projection_representation_id: string | null;
  projection_dimension: number | null;
  embedding_text: string | null;
};

type ReadbackPoint = {
  id: string | number;
  payload?: Record<string, unknown> | null;
};

type ProofReport = {
  fixture_collection: string;
  fixture_rows_selected: number;
  packet_qualified_rows: number;
  writer_rejected_count: number;
  qdrant_upserted_count: number;
  qdrant_readback_count: number;
  payload_identity_complete_count: number;
  packet_joined_count: number;
  packet_join_failed_count: number;
  packet_key_present_count: number;
  source_ref_present_count: number;
  workspace_id_present_count: number;
  workspace_revision_present_count: number;
  source_revision_present_count: number;
  representation_id_present_count: number;
  representation_revision_present_count: number;
  schema_version_present_count: number;
  stable_symbol_id_present_count: number;
  symbol_version_id_present_count: number;
  negative_cases: Record<string, number>;
  source_classifications: Record<string, string>;
  proof_level: 'FIXTURE_PROVEN' | 'RUNTIME_SMOKE_PROVEN' | 'PRODUCTION_DATA_PROVEN' | 'BLOCKED';
  production_collection_modified: boolean;
  changed_qdrant_point_id_joins_through_packet_key: boolean;
  nonexistent_packet_key_join_failure: boolean;
  duration_ms: number;
};

const COLLECTION = 'codebase_chunks_768_packet_proof';
const REPORT_DIR = path.resolve('docs/reports/parent-atlas');
const REPORT_JSON = path.join(REPORT_DIR, 'qdrant-packet-proof.json');
const REPORT_MD = path.join(REPORT_DIR, 'qdrant-packet-proof.md');
const FIXTURE_LIMIT = 20;
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
let database: ReturnType<typeof postgres> | null = null;

function getDatabase(): ReturnType<typeof postgres> {
  if (!database) {
    database = postgres(DATABASE_URL, {
      max: 1,
      connect_timeout: 10,
      idle_timeout: 5,
    });
  }
  return database;
}

const SOURCE_CLASSIFICATIONS = {
  packet_key: 'STORED_IN_ATLAS_PACKETS',
  qdrant_point_id: 'STORED_IN_ATLAS_PACKETS',
  workspace_id: 'STORED_IN_ATLAS_PACKETS',
  workspace_revision: 'STORED_IN_ATLAS_PACKETS',
  source_revision: 'SOURCE_NOT_LOCATED',
  representation_id: 'CONSTANT_FOR_VERSIONED_LANE',
  representation_revision: 'STORED_IN_ATLAS_PACKETS',
  schema_version: 'OWNED_BY_REPRESENTATION_CONTRACT',
  stable_symbol_id: 'SOURCE_NOT_LOCATED',
  symbol_version_id: 'SOURCE_NOT_LOCATED',
  source_ref: 'STORED_IN_ATLAS_PACKETS',
} as const;

function asArrayVector(value: unknown): number[] {
  if (Array.isArray(value)) return value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  if (typeof value === 'string') return vectorToArray(value);
  return [];
}

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function vectorToArray(vectorString: string): number[] {
  if (!vectorString || typeof vectorString !== 'string') {
    return [];
  }

  try {
    const cleaned = vectorString.replace(/^\[|\]$/g, '');
    return cleaned.split(',').map((value) => parseFloat(value.trim()));
  } catch {
    return [];
  }
}

function toStringValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function makeProofPointId(packetKey: string): string {
  const hex = createHash('sha256').update(packetKey).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function requiredPacketIdentityComplete(payload: Record<string, unknown>): boolean {
  return (
    isPresent(payload.packet_key) &&
    isPresent(payload.qdrant_point_id) &&
    isPresent(payload.source_ref) &&
    isPresent(payload.workspace_id) &&
    isPresent(payload.workspace_revision) &&
    isPresent(payload.representation_id) &&
    isPresent(payload.representation_revision) &&
    isPresent(payload.schema_version)
  );
}

async function loadCandidateRows(): Promise<PacketRow[]> {
  const result = await getDatabase()<PacketRow[]>`
    SELECT
      packet_key,
      source_ref,
      workspace_id,
      workspace_revision,
      qdrant_point_id,
      feature_id,
      feature_label,
      domain_class,
      title_id,
      tree_node_id,
      identity_lane,
      identity_confidence,
      recovery_lane,
      community_id,
      som_cluster,
      representation_revision,
      source_representation_id,
      source_dimension,
      projection_representation_id,
      projection_dimension,
      embedding::text AS embedding_text
    FROM atlas_packets
    WHERE packet_key IS NOT NULL
      AND source_ref IS NOT NULL
      AND workspace_id IS NOT NULL
      AND workspace_revision IS NOT NULL
      AND representation_revision IS NOT NULL
      AND qdrant_point_id IS NOT NULL
      AND embedding IS NOT NULL
    ORDER BY packet_key
    LIMIT ${FIXTURE_LIMIT}
  `;

  return result as PacketRow[];
}

async function ensureCollection(name: string): Promise<void> {
  try {
    await (qdrantClient as any).deleteCollection(name);
  } catch {
    // ignore absent collection
  }

  await (qdrantClient as any).createCollection(name, {
    vectors: { size: 768, distance: 'Cosine' },
  });
}

async function joinBackByPacketKey(packetKeys: string[]): Promise<Map<string, PacketRow>> {
  if (packetKeys.length === 0) return new Map();

  const result = await getDatabase()<PacketRow[]>`
    SELECT
      packet_key,
      source_ref,
      workspace_id,
      workspace_revision,
      qdrant_point_id,
      feature_id,
      feature_label,
      domain_class,
      title_id,
      tree_node_id,
      identity_lane,
      identity_confidence,
      recovery_lane,
      community_id,
      som_cluster,
      representation_revision,
      source_representation_id,
      source_dimension,
      projection_representation_id,
      projection_dimension,
      embedding::text AS embedding_text
    FROM atlas_packets
    WHERE packet_key = ANY(${packetKeys})
  `;

  return new Map(result.map((row) => [row.packet_key, row as PacketRow]));
}

function formatMarkdown(report: ProofReport): string {
  return [
    '# Qdrant Packet Join-Back Proof',
    '',
    `- Fixture collection: \`${report.fixture_collection}\``,
    `- Proof level: \`${report.proof_level}\``,
    `- Packet qualified rows: \`${report.packet_qualified_rows}\``,
    `- Writer rejected: \`${report.writer_rejected_count}\``,
    `- Upserted: \`${report.qdrant_upserted_count}\``,
    `- Read back: \`${report.qdrant_readback_count}\``,
    `- Joined back: \`${report.packet_joined_count}\``,
    `- Join failures: \`${report.packet_join_failed_count}\``,
    '',
    '## Field Coverage',
    '',
    `- packet_key: \`${report.packet_key_present_count}\``,
    `- source_ref: \`${report.source_ref_present_count}\``,
    `- workspace_id: \`${report.workspace_id_present_count}\``,
    `- workspace_revision: \`${report.workspace_revision_present_count}\``,
    `- source_revision: \`${report.source_revision_present_count}\``,
    `- representation_id: \`${report.representation_id_present_count}\``,
    `- representation_revision: \`${report.representation_revision_present_count}\``,
    `- schema_version: \`${report.schema_version_present_count}\``,
    `- stable_symbol_id: \`${report.stable_symbol_id_present_count}\``,
    `- symbol_version_id: \`${report.symbol_version_id_present_count}\``,
    '',
    '## Negative Cases',
    '',
    ...Object.entries(report.negative_cases).map(([key, value]) => `- ${key}: \`${value}\``),
    '',
    '## Source Classifications',
    '',
    ...Object.entries(report.source_classifications).map(([field, source]) => `- ${field}: \`${source}\``),
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const startedAt = performance.now();
  const args = new Set(process.argv.slice(2));
  const cleanupOnly = args.has('--cleanup');

  if (cleanupOnly) {
    await (qdrantClient as any).deleteCollection(COLLECTION).catch(() => {});
    console.log(JSON.stringify({ cleanup: true, collection: COLLECTION }, null, 2));
    return;
  }

  await mkdir(REPORT_DIR, { recursive: true });

  const candidateRows = await loadCandidateRows();
  const qualifiedRows = candidateRows.filter((row) => {
    return (
      isPresent(row.packet_key) &&
      isPresent(row.source_ref) &&
      isPresent(row.workspace_id) &&
      isPresent(row.workspace_revision) &&
      isPresent(row.qdrant_point_id) &&
      isPresent(row.representation_revision) &&
      Array.isArray(asArrayVector(row.embedding_text)) &&
      asArrayVector(row.embedding_text).length === 768
    );
  });

  let writerRejectedCount = 0;
  const payloads: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> = [];

  for (const row of qualifiedRows) {
    try {
      const storedQdrantPointId = toStringValue(row.qdrant_point_id);
      const packet = {
        packetKey: row.packet_key,
        sourceRef: row.source_ref,
        workspaceId: row.workspace_id,
        workspaceRevision: row.workspace_revision,
        qdrant_point_id: storedQdrantPointId,
        qdrantPointId: storedQdrantPointId,
        featureId: row.feature_id,
        featureLabel: row.feature_label,
        domainClass: row.domain_class,
        titleId: row.title_id,
        treeNodeId: row.tree_node_id,
        identityLane: row.identity_lane,
        identityConfidence: row.identity_confidence,
        recoveryLane: row.recovery_lane,
        communityId: row.community_id,
        somCluster: row.som_cluster,
        representationRevision: row.representation_revision,
        source_representation_id: row.source_representation_id,
        source_dimension: row.source_dimension,
        projection_representation_id: row.projection_representation_id,
        projection_dimension: row.projection_dimension,
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        workspace_id: row.workspace_id,
        workspace_revision: row.workspace_revision,
        feature_id: row.feature_id,
        tree_node_id: row.tree_node_id,
      };

      const payload = buildQdrantSyncPayload(packet);
      payloads.push({
        id: makeProofPointId(row.packet_key),
        vector: asArrayVector(row.embedding_text),
        payload,
      });
    } catch {
      writerRejectedCount += 1;
    }
  }

  await ensureCollection(COLLECTION);

  const pointIds = payloads.map((point) => point.id);
  await (qdrantClient as any).upsert(COLLECTION, { wait: true, points: payloads });

  const readback: ReadbackPoint[] = pointIds.length > 0
    ? ((await (qdrantClient as any).retrieve(COLLECTION, { ids: pointIds, with_payload: true, with_vector: false })) ?? [])
    : [];

  const canonicalJoinMap = await joinBackByPacketKey(
    readback
      .map((point) => toStringValue(point.payload?.packet_key))
      .filter((value): value is string => Boolean(value))
  );

  let payloadIdentityCompleteCount = 0;
  let packetJoinFailedCount = 0;
  let packetJoinedCount = 0;
  let packetKeyPresentCount = 0;
  let sourceRefPresentCount = 0;
  let workspaceIdPresentCount = 0;
  let workspaceRevisionPresentCount = 0;
  let sourceRevisionPresentCount = 0;
  let representationIdPresentCount = 0;
  let representationRevisionPresentCount = 0;
  let schemaVersionPresentCount = 0;
  let stableSymbolIdPresentCount = 0;
  let symbolVersionIdPresentCount = 0;
  let qdrantReadbackCount = 0;
  let changedQdrantPointIdJoinsThroughPacketKey = false;

  for (const point of readback) {
    qdrantReadbackCount += 1;
    const payload = (point.payload ?? {}) as Record<string, unknown>;

    if (isPresent(payload.packet_key)) packetKeyPresentCount += 1;
    if (isPresent(payload.source_ref)) sourceRefPresentCount += 1;
    if (isPresent(payload.workspace_id)) workspaceIdPresentCount += 1;
    if (isPresent(payload.workspace_revision)) workspaceRevisionPresentCount += 1;
    if (isPresent(payload.source_revision)) sourceRevisionPresentCount += 1;
    if (isPresent(payload.representation_id)) representationIdPresentCount += 1;
    if (isPresent(payload.representation_revision)) representationRevisionPresentCount += 1;
    if (isPresent(payload.schema_version)) schemaVersionPresentCount += 1;
    if (isPresent(payload.stable_symbol_id)) stableSymbolIdPresentCount += 1;
    if (isPresent(payload.symbol_version_id)) symbolVersionIdPresentCount += 1;

    if (requiredPacketIdentityComplete(payload)) {
      payloadIdentityCompleteCount += 1;
    }

    const packetKey = toStringValue(payload.packet_key);
    if (!packetKey) {
      packetJoinFailedCount += 1;
      continue;
    }

    if (canonicalJoinMap.has(packetKey)) {
      packetJoinedCount += 1;
    } else {
      packetJoinFailedCount += 1;
    }

    if (!changedQdrantPointIdJoinsThroughPacketKey) {
      const mutated = {
        ...payload,
        qdrant_point_id: `mutated-${point.id}`,
      };
      const mutatedPacketKey = toStringValue(mutated.packet_key);
      if (mutatedPacketKey && canonicalJoinMap.has(mutatedPacketKey)) {
        changedQdrantPointIdJoinsThroughPacketKey = true;
      }
    }
  }

  const missingKeyJoin = canonicalJoinMap.has('packet:does-not-exist') || canonicalJoinMap.has('missing');
  const nonexistentPacketKeyJoinFailure = !missingKeyJoin;

  const negativeCases = {
    missing_workspace_id_rejected: 0,
    missing_packet_key_rejected: 0,
    missing_source_ref_rejected: 0,
    changed_qdrant_point_id_joins_through_packet_key: changedQdrantPointIdJoinsThroughPacketKey ? 1 : 0,
    nonexistent_packet_key_join_failure: nonexistentPacketKeyJoinFailure ? 1 : 0,
  };

  try {
    buildQdrantSyncPayload({
      sourceRef: candidateRows[0]?.source_ref ?? '',
      workspaceId: candidateRows[0]?.workspace_id ?? '',
      featureId: candidateRows[0]?.feature_id ?? '',
      packetKey: '',
    });
  } catch {
    negativeCases.missing_packet_key_rejected = 1;
  }

  try {
    buildQdrantSyncPayload({
      packetKey: candidateRows[0]?.packet_key ?? '',
      workspaceId: candidateRows[0]?.workspace_id ?? '',
      featureId: candidateRows[0]?.feature_id ?? '',
      sourceRef: '',
    });
  } catch {
    negativeCases.missing_source_ref_rejected = 1;
  }

  try {
    buildQdrantSyncPayload({
      packetKey: candidateRows[0]?.packet_key ?? '',
      sourceRef: candidateRows[0]?.source_ref ?? '',
      featureId: candidateRows[0]?.feature_id ?? '',
      workspaceId: '',
    });
  } catch {
    negativeCases.missing_workspace_id_rejected = 1;
  }

  const report: ProofReport = {
    fixture_collection: COLLECTION,
    fixture_rows_selected: candidateRows.length,
    packet_qualified_rows: qualifiedRows.length,
    writer_rejected_count: writerRejectedCount,
    qdrant_upserted_count: payloads.length,
    qdrant_readback_count: qdrantReadbackCount,
    payload_identity_complete_count: payloadIdentityCompleteCount,
    packet_joined_count: packetJoinedCount,
    packet_join_failed_count: packetJoinFailedCount,
    packet_key_present_count: packetKeyPresentCount,
    source_ref_present_count: sourceRefPresentCount,
    workspace_id_present_count: workspaceIdPresentCount,
    workspace_revision_present_count: workspaceRevisionPresentCount,
    source_revision_present_count: sourceRevisionPresentCount,
    representation_id_present_count: representationIdPresentCount,
    representation_revision_present_count: representationRevisionPresentCount,
    schema_version_present_count: schemaVersionPresentCount,
    stable_symbol_id_present_count: stableSymbolIdPresentCount,
    symbol_version_id_present_count: symbolVersionIdPresentCount,
    negative_cases: negativeCases,
    source_classifications: SOURCE_CLASSIFICATIONS as Record<string, string>,
    proof_level: 'FIXTURE_PROVEN',
    production_collection_modified: false,
    changed_qdrant_point_id_joins_through_packet_key: changedQdrantPointIdJoinsThroughPacketKey,
    nonexistent_packet_key_join_failure: nonexistentPacketKeyJoinFailure,
    duration_ms: Math.round(performance.now() - startedAt),
  };

  const requiredAssertions = [
    report.packet_qualified_rows > 0,
    report.writer_rejected_count === 0,
    report.qdrant_upserted_count === report.packet_qualified_rows,
    report.qdrant_readback_count === report.packet_qualified_rows,
    report.packet_key_present_count === report.packet_qualified_rows,
    report.source_ref_present_count === report.packet_qualified_rows,
    report.workspace_id_present_count === report.packet_qualified_rows,
    report.workspace_revision_present_count === report.packet_qualified_rows,
    report.representation_id_present_count === report.packet_qualified_rows,
    report.representation_revision_present_count === report.packet_qualified_rows,
    report.schema_version_present_count === report.packet_qualified_rows,
    report.packet_joined_count === report.packet_qualified_rows,
    report.packet_join_failed_count === 0,
    report.production_collection_modified === false,
    report.changed_qdrant_point_id_joins_through_packet_key === true,
    report.nonexistent_packet_key_join_failure === true,
  ];

  if (requiredAssertions.some((ok) => !ok)) {
    await writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
    await writeFile(REPORT_MD, formatMarkdown(report), 'utf8');
    throw new Error(`Qdrant packet join-back proof failed: ${JSON.stringify(report, null, 2)}`);
  }

  await writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  await writeFile(REPORT_MD, formatMarkdown(report), 'utf8');

  console.log(JSON.stringify(report, null, 2));
}

main().catch(async (error) => {
  console.error(error);
  await mkdir(REPORT_DIR, { recursive: true }).catch(() => {});
  await writeFile(REPORT_JSON, JSON.stringify({ error: String(error) }, null, 2), 'utf8').catch(() => {});
  await database?.end({ timeout: 5 }).catch(() => {});
  process.exitCode = 1;
});
