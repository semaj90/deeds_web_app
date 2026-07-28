#!/usr/bin/env node

import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hyperragPacketRpc } from '../../sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts';

type LayerName = 'POSTGRES' | 'QDRANT_384_HYBRID' | 'QDRANT_384' | 'QDRANT_768' | 'REDIS' | 'HYPERRAG_RPC' | 'ACE';
type Severity = 'INFO' | 'WARN' | 'BLOCK';

interface PacketProjectionSnapshot {
  layer: LayerName;
  present: boolean;
  packetKey: string | null;
  sourceRef: string | null;
  contentHash: string | null;
  workspaceRevision: string | null;
  ontologyId: string | null;
  ontologyVersion: string | null;
  representationIds: string[];
  observedAt: string;
  raw?: unknown;
}

interface PacketLineageViolation {
  code:
    | 'PROJECTION_MISSING'
    | 'PACKET_KEY_MISSING'
    | 'PACKET_KEY_MISMATCH'
    | 'SOURCE_REF_MISSING'
    | 'SOURCE_REF_MISMATCH'
    | 'CONTENT_HASH_MISSING'
    | 'CONTENT_HASH_MISMATCH'
    | 'WORKSPACE_REVISION_MISSING'
    | 'WORKSPACE_REVISION_MISMATCH'
    | 'ONTOLOGY_ID_MISSING'
    | 'ONTOLOGY_ID_MISMATCH'
    | 'ONTOLOGY_VERSION_MISSING'
    | 'ONTOLOGY_VERSION_MISMATCH'
    | 'VECTOR_LINEAGE_INCOMPLETE'
    | 'CACHE_MISSING'
    | 'CONTEXT_MISSING';
  layer: string;
  severity: Severity;
  expected?: unknown;
  actual?: unknown;
  message: string;
}

interface PacketProofResult {
  packetKey: string;
  status: 'NOT_PROVEN' | 'PARTIAL_PROVEN' | 'CROSS_STORE_PROVEN';
  snapshots: PacketProjectionSnapshot[];
  violations: PacketLineageViolation[];
}

interface AtlasPacketRow {
  packet_key: string | null;
  source_ref: string | null;
  feature_id: string | null;
  domain_class: string | null;
  tree_node_id: string | null;
  content_hash: string | null;
  workspace_id: string | null;
  ontology_version: string | null;
  qdrant_point_id: string | null;
  qdrant_collection: string | null;
  lineage_version: string | null;
  title_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface QdrantCollectionInfo {
  name: string;
  points_count: number;
  payload_schema: Record<string, unknown>;
}

const LOG_DIR = resolve(process.cwd(), 'log', 'artifacts', 'semantic-contract');
const RESULT_PATH = resolve(LOG_DIR, 'phase108d-single-packet-proof.json');
const DEFAULT_PACKET_KEY = process.env.PROOF_PACKET_KEY || 'packet:1f18437ee58f';
const QDRANT_COLLECTIONS = ['codebase_chunks_384_hybrid', 'codebase_chunks_384', 'codebase_chunks_768'];

mkdirSync(LOG_DIR, { recursive: true });

function shellEscape(value: string): string {
  return value.replaceAll("'", "''");
}

function parseJson<T>(text: string): T {
  return JSON.parse(text.trim()) as T;
}

function runPsql(sql: string): string {
  const escaped = sql.replace(/\s+/g, ' ').trim().replace(/"/g, '\\"');
  return execSync(
    `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -P format=unaligned -P tuples_only=on -P null='NULL' -c "${escaped}"`,
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
  ).trim();
}

function fetchPostgresPacket(packetKey: string): AtlasPacketRow | null {
  const sql = `
    SELECT row_to_json(t)
    FROM (
      SELECT
        packet_key,
        source_ref,
        feature_id,
        domain_class,
        tree_node_id,
        content_hash,
        workspace_id,
        ontology_version,
        qdrant_point_id,
        qdrant_collection,
        lineage_version,
        title_id,
        created_at,
        updated_at
      FROM atlas_packets
      WHERE packet_key = '${shellEscape(packetKey)}'
      LIMIT 1
    ) t
  `;
  const out = runPsql(sql);
  if (!out) return null;
  return parseJson<AtlasPacketRow>(out);
}

function fetchQdrantCollectionInfo(collection: string): QdrantCollectionInfo | null {
  const response = execSync(`curl.exe -s http://127.0.0.1:6333/collections/${collection}`, {
    encoding: 'utf-8',
    maxBuffer: 2 * 1024 * 1024,
  }).trim();
  if (!response) return null;
  const parsed = parseJson<any>(response);
  const info = parsed?.result;
  if (!info) return null;
  return {
    name: collection,
    points_count: Number(info.points_count ?? 0),
    payload_schema: info.payload_schema ?? {},
  };
}

async function fetchQdrantPacket(collection: string, packetKey: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`http://127.0.0.1:6333/collections/${collection}/points/scroll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      limit: 1,
      filter: {
        must: [{ key: 'packet_key', match: { value: packetKey } }],
      },
      with_payload: true,
      with_vectors: false,
    }),
  });

  if (!response.ok) return null;
  const json = await response.json() as any;
  const point = json?.result?.points?.[0];
  return point ? point as Record<string, unknown> : null;
}

function redisGet(key: string): string | null {
  const out = execSync(`docker exec legal-ai-valkey redis-cli -a redis --raw GET "${key}"`, {
    encoding: 'utf-8',
    maxBuffer: 2 * 1024 * 1024,
  }).trim();
  return out.length > 0 ? out : null;
}

function redisExists(key: string): boolean {
  const out = execSync(`docker exec legal-ai-valkey redis-cli -a redis --raw EXISTS "${key}"`, {
    encoding: 'utf-8',
  }).trim();
  return out === '1';
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function snapshotFromAuthority(row: AtlasPacketRow | null, observedAt: string): PacketProjectionSnapshot {
  return {
    layer: 'POSTGRES',
    present: Boolean(row),
    packetKey: row?.packet_key ?? null,
    sourceRef: row?.source_ref ?? null,
    contentHash: row?.content_hash ?? null,
    workspaceRevision: row?.lineage_version ?? null,
    ontologyId: null,
    ontologyVersion: row?.ontology_version ?? null,
    representationIds: [
      row?.qdrant_collection ?? null,
      row?.qdrant_point_id ?? null,
      row?.tree_node_id ?? null,
    ].filter((value): value is string => Boolean(value && String(value).trim())),
    observedAt,
    raw: row,
  };
}

function addViolation(
  violations: PacketLineageViolation[],
  violation: PacketLineageViolation
): void {
  violations.push(violation);
}

function compareIfPresent(
  violations: PacketLineageViolation[],
  layer: string,
  authority: PacketProjectionSnapshot,
  projection: PacketProjectionSnapshot
): void {
  if (!projection.present) {
    addViolation(violations, {
      code: 'PROJECTION_MISSING',
      layer,
      severity: 'WARN',
      message: `${layer} projection is missing for packet ${authority.packetKey ?? '(unknown)'}`,
    });
    return;
  }

  if (!authority.packetKey) {
    addViolation(violations, {
      code: 'PACKET_KEY_MISSING',
      layer,
      severity: 'BLOCK',
      message: 'Authority packet_key is missing',
    });
  } else if (projection.packetKey && projection.packetKey !== authority.packetKey) {
    addViolation(violations, {
      code: 'PACKET_KEY_MISMATCH',
      layer,
      severity: 'BLOCK',
      expected: authority.packetKey,
      actual: projection.packetKey,
      message: `${layer} packet_key does not match authority`,
    });
  }

  if (!authority.sourceRef) {
    addViolation(violations, {
      code: 'SOURCE_REF_MISSING',
      layer,
      severity: 'BLOCK',
      message: 'Authority source_ref is missing',
    });
  } else if (projection.sourceRef && projection.sourceRef !== authority.sourceRef) {
    addViolation(violations, {
      code: 'SOURCE_REF_MISMATCH',
      layer,
      severity: 'BLOCK',
      expected: authority.sourceRef,
      actual: projection.sourceRef,
      message: `${layer} source_ref does not match authority`,
    });
  }

  if (!authority.contentHash) {
    addViolation(violations, {
      code: 'CONTENT_HASH_MISSING',
      layer,
      severity: 'WARN',
      message: 'Authority content_hash is missing; freshness is not proven',
    });
  } else if (projection.contentHash && projection.contentHash !== authority.contentHash) {
    addViolation(violations, {
      code: 'CONTENT_HASH_MISMATCH',
      layer,
      severity: 'BLOCK',
      expected: authority.contentHash,
      actual: projection.contentHash,
      message: `${layer} content_hash does not match authority`,
    });
  }

  if (!authority.workspaceRevision) {
    addViolation(violations, {
      code: 'WORKSPACE_REVISION_MISSING',
      layer,
      severity: 'WARN',
      message: 'Authority workspace_revision/lineage_version is missing',
    });
  } else if (projection.workspaceRevision && projection.workspaceRevision !== authority.workspaceRevision) {
    addViolation(violations, {
      code: 'WORKSPACE_REVISION_MISMATCH',
      layer,
      severity: 'BLOCK',
      expected: authority.workspaceRevision,
      actual: projection.workspaceRevision,
      message: `${layer} workspace revision does not match authority`,
    });
  }

  if (!authority.ontologyVersion) {
    addViolation(violations, {
      code: 'ONTOLOGY_VERSION_MISSING',
      layer,
      severity: 'WARN',
      message: 'Authority ontology_version is missing',
    });
  } else if (projection.ontologyVersion && projection.ontologyVersion !== authority.ontologyVersion) {
    addViolation(violations, {
      code: 'ONTOLOGY_VERSION_MISMATCH',
      layer,
      severity: 'BLOCK',
      expected: authority.ontologyVersion,
      actual: projection.ontologyVersion,
      message: `${layer} ontology_version does not match authority`,
    });
  }
}

async function buildProof(packetKey: string): Promise<PacketProofResult> {
  const observedAt = new Date().toISOString();
  const violations: PacketLineageViolation[] = [];

  const authorityRow = fetchPostgresPacket(packetKey);
  const authority = snapshotFromAuthority(authorityRow, observedAt);
  if (!authority.present) {
    addViolation(violations, {
      code: 'PROJECTION_MISSING',
      layer: 'POSTGRES',
      severity: 'BLOCK',
      message: `No atlas_packets row found for packet ${packetKey}`,
    });
  }

  const qdrantCollections = QDRANT_COLLECTIONS.map((collection) => {
    try {
      const info = fetchQdrantCollectionInfo(collection);
      return info;
    } catch (error) {
      addViolation(violations, {
        code: 'PROJECTION_MISSING',
        layer: collection as LayerName,
        severity: 'WARN',
        message: `Failed to inspect Qdrant collection ${collection}: ${error instanceof Error ? error.message : String(error)}`,
      });
      return null;
    }
  }).filter((value): value is QdrantCollectionInfo => Boolean(value));

  const qdrantSnapshots: PacketProjectionSnapshot[] = [];
  for (const info of qdrantCollections) {
    const layer = info.name === 'codebase_chunks_768'
      ? 'QDRANT_768'
      : info.name === 'codebase_chunks_384'
        ? 'QDRANT_384'
        : 'QDRANT_384_HYBRID';

    if (info.points_count <= 0) {
      qdrantSnapshots.push({
        layer,
        present: false,
        packetKey: null,
        sourceRef: null,
        contentHash: null,
        workspaceRevision: null,
        ontologyId: null,
        ontologyVersion: null,
        representationIds: [],
        observedAt,
        raw: info,
      });
      addViolation(violations, {
        code: 'PROJECTION_MISSING',
        layer,
        severity: 'WARN',
        message: `${info.name} contains no indexed points for packet-level proof`,
      });
      continue;
    }

    const point = await fetchQdrantPacket(info.name, packetKey);
    const payload = point?.payload && typeof point.payload === 'object' ? point.payload as Record<string, unknown> : null;
    const packetKeyValue = normalizeText(point?.id) ?? normalizeText(payload?.packet_key);
    const sourceRefValue = normalizeText(payload?.source_ref);
    const contentHashValue = normalizeText(payload?.content_hash);
    const workspaceRevisionValue = normalizeText(payload?.workspace_revision);
    const ontologyVersionValue = normalizeText(payload?.ontology_version);

    const snapshot: PacketProjectionSnapshot = {
      layer,
      present: Boolean(point),
      packetKey: packetKeyValue,
      sourceRef: sourceRefValue,
      contentHash: contentHashValue,
      workspaceRevision: workspaceRevisionValue,
      ontologyId: normalizeText(payload?.ontology_id),
      ontologyVersion: ontologyVersionValue,
      representationIds: point ? [info.name, normalizeText(point.id)].filter((value): value is string => Boolean(value)) : [],
      observedAt,
      raw: point ?? info,
    };
    qdrantSnapshots.push(snapshot);
    compareIfPresent(violations, layer, authority, snapshot);
  }

  const redisSnapshots: PacketProjectionSnapshot[] = [];
  const bifrostKey = `bifrost:packet:${packetKey}`;
  const acePacketKey = `ace:packet:${packetKey}`;
  const aceLatestKey = 'ace:packet:latest';

  const bifrostValue = redisGet(bifrostKey);
  const aceValue = redisGet(acePacketKey);
  const latestValue = redisGet(aceLatestKey);

  const redisPresent = Boolean(bifrostValue || aceValue || latestValue === packetKey);
  const redisSnapshot: PacketProjectionSnapshot = {
    layer: 'REDIS',
    present: redisPresent,
    packetKey: bifrostValue ? packetKey : aceValue ? packetKey : latestValue === packetKey ? packetKey : null,
    sourceRef: null,
    contentHash: null,
    workspaceRevision: null,
    ontologyId: null,
    ontologyVersion: null,
    representationIds: [
      bifrostValue ? bifrostKey : null,
      aceValue ? acePacketKey : null,
      latestValue === packetKey ? aceLatestKey : null,
    ].filter((value): value is string => Boolean(value)),
    observedAt,
    raw: {
      bifrost_exists: redisExists(bifrostKey),
      ace_exists: redisExists(acePacketKey),
      ace_latest: latestValue,
    },
  };
  redisSnapshots.push(redisSnapshot);
  if (!redisSnapshot.present) {
    addViolation(violations, {
      code: 'CACHE_MISSING',
      layer: 'REDIS',
      severity: 'WARN',
      message: `No Redis packet cache found for ${packetKey}`,
    });
  }

  const hyperragResult = await hyperragPacketRpc({
    query: authority.sourceRef ?? packetKey,
    limit: 1,
    useExactMatchCache: true,
    recordTelemetry: false,
  });
  const hyperragPacket = hyperragResult.packets?.[0] ?? null;
  const hyperragSnapshot: PacketProjectionSnapshot = {
    layer: 'HYPERRAG_RPC',
    present: Boolean(hyperragPacket),
    packetKey: hyperragPacket?.packet_key ?? null,
    sourceRef: hyperragPacket?.source_ref ?? null,
    contentHash: null,
    workspaceRevision: null,
    ontologyId: null,
    ontologyVersion: null,
    representationIds: hyperragPacket?.qdrant_point_id ? [String(hyperragPacket.qdrant_point_id)] : [],
    observedAt,
    raw: hyperragResult,
  };
  compareIfPresent(violations, 'HYPERRAG_RPC', authority, hyperragSnapshot);

  const aceSnapshot: PacketProjectionSnapshot = {
    layer: 'ACE',
    present: redisExists(acePacketKey),
    packetKey: redisExists(acePacketKey) ? packetKey : null,
    sourceRef: null,
    contentHash: null,
    workspaceRevision: null,
    ontologyId: null,
    ontologyVersion: null,
    representationIds: redisExists(acePacketKey) ? [acePacketKey] : [],
    observedAt,
    raw: redisGet(acePacketKey),
  };
  if (!aceSnapshot.present) {
    addViolation(violations, {
      code: 'CONTEXT_MISSING',
      layer: 'ACE',
      severity: 'WARN',
      message: `No ACE context packet found for ${packetKey}`,
    });
  }

  const blocking = violations.filter((violation) => violation.severity === 'BLOCK');
  const hasQdrant = qdrantSnapshots.some((snapshot) => snapshot.present);
  const hasHyperRag = hyperragSnapshot.present;
  const hasRedis = redisSnapshot.present;
  const hasAce = aceSnapshot.present;
  const hasAuthority = authority.present;

  const status: PacketProofResult['status'] =
    blocking.length > 0 ? 'NOT_PROVEN'
      : hasAuthority && hasHyperRag && hasQdrant && hasRedis && hasAce
        ? 'CROSS_STORE_PROVEN'
        : hasAuthority && hasHyperRag
          ? 'PARTIAL_PROVEN'
          : 'NOT_PROVEN';

  const snapshots: PacketProjectionSnapshot[] = [
    authority,
    ...qdrantSnapshots,
    redisSnapshot,
    hyperragSnapshot,
    aceSnapshot,
  ];

  return {
    packetKey,
    status,
    snapshots,
    violations,
  };
}

async function main(): Promise<void> {
  const packetKey = process.argv[2] || DEFAULT_PACKET_KEY;
  const result = await buildProof(packetKey);

  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    packet_key: result.packetKey,
    status: result.status,
    snapshots: result.snapshots,
    violations: result.violations,
  };

  writeFileSync(RESULT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
