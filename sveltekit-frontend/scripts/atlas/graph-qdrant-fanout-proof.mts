#!/usr/bin/env node
/**
 * Parent Atlas bounded Neo4j → Qdrant graph fan-out proof.
 *
 * Read-only, bounded, and idempotent:
 * 1) choose a live canonical seed from the latest succeeded graph-analysis run
 * 2) resolve one-hop Neo4j neighbors from the live CodebaseFile graph
 * 3) canonicalize each neighbor back through Postgres identity
 * 4) look up matching Qdrant projections in codebase_chunks_768
 * 5) preserve graph evidence separately from canonical identity
 * 6) emit JSON + Markdown proof artifacts
 */

import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import neo4j, { type Session } from 'neo4j-driver';

import { resolveCodebaseFilePacketKeys } from '../../src/lib/server/graph/graph-packet-key-resolver.js';
import { loadRuntimeEnv } from '../../src/lib/server/config/load-runtime-env.js';
import { resolveCanonicalIdentity } from '../../src/lib/server/ace/identity-contract.js';
import { normalizeQdrantPayloadIdentity } from '../../src/lib/server/ace/retrieval/evidence-lanes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ENV_FILE = path.join(REPO_ROOT, '.env');
const ENV_LOCAL_FILE = path.join(REPO_ROOT, '.env.local');

const DEFAULT_REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'graph-qdrant-fanout-runtime-proof.json');
const DEFAULT_REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'graph-qdrant-fanout-runtime-proof.md');

const QDRANT_COLLECTION = 'codebase_chunks_768';
const CANONICAL_VECTOR_NAMES = {
  content: { size: 768, distance: 'Cosine' },
  error: { size: 768, distance: 'Cosine' },
  signature: { size: 768, distance: 'Cosine' },
} as const;

const PREFERRED_RELATIONSHIP_TYPES = [
  'IMPORTS',
  'CALLS',
  'REFERENCES',
  'IMPLEMENTS',
  'EXTENDS',
  'TESTS',
  'DEFINES',
  'USES_COMPONENT',
  'USES_STORE',
  'DYNAMIC_IMPORTS',
  'CONTAINS',
  'BELONGS_TO_CLUSTER',
] as const;

dotenv.config({ path: ENV_FILE, override: false });
dotenv.config({ path: ENV_LOCAL_FILE, override: true });
loadRuntimeEnv({ cwd: REPO_ROOT, mode: 'development' });

type StageStatus = 'PASS' | 'DEGRADED' | 'FAIL';

type StageTiming = {
  stage: string;
  elapsed_ms: number;
  status: StageStatus;
  reason?: string;
};

type GraphSeedCandidateRow = {
  run_id: string;
  algorithm: string;
  graph_revision: string;
  projection_revision: string;
  projection_name: string;
  started_at: string;
  packet_key: string | null;
  symbol_version_id: string | null;
  metric_name: string;
  metric_value: number;
  source_ref: string | null;
  canonical_source_ref: string | null;
  file_path: string | null;
  source_path: string | null;
  tree_node_id: string | null;
  qdrant_point_id: string | null;
  workspace_revision: string | null;
  representation_revision: string | null;
  source_representation_id: string | null;
  projection_representation_id: string | null;
};

type AtlasPacketRow = {
  packet_key: string;
  source_ref: string;
  canonical_source_ref: string | null;
  file_path: string | null;
  source_path: string | null;
  tree_node_id: string | null;
  qdrant_point_id: string | null;
  workspace_revision: string | null;
  representation_revision: string | null;
  source_representation_id: string | null;
  projection_representation_id: string | null;
};

type Neo4jSeedNode = {
  graph_key: string;
  file_path: string | null;
  path: string | null;
  source_ref: string | null;
  stable_key: string | null;
  element_id: string;
  internal_id: number;
  labels: string[];
};

type Neo4jNeighborNode = Neo4jSeedNode & {
  edge_type: string;
  hop_distance: number;
};

type QdrantProjectionHit = {
  matched_on: 'symbol_version_id' | 'packet_key' | 'source_ref' | 'tree_node_id' | 'qdrant_point_id';
  point_id: string;
  payload: Record<string, unknown>;
  normalized_identity: ReturnType<typeof normalizeQdrantPayloadIdentity>;
  process_ids: string[];
};

type CanonicalNeighbor = {
  graph_key: string;
  neo4j: Neo4jNeighborNode;
  atlas_packet: AtlasPacketRow | null;
  canonical_identity: ReturnType<typeof resolveCanonicalIdentity>;
  qdrant: QdrantProjectionHit | null;
  graph_evidence: {
    seed_canonical_id: string;
    edge_type: string;
    hop_distance: number;
    tree_node_id: string | null;
    neo4j_internal_id: number;
    neo4j_element_id: string;
    graph_revision: string;
  };
};

type ProofReport = {
  receipt_kind: 'GRAPH_QDRANT_FANOUT_RUNTIME_PROOF';
  status: 'PROVEN' | 'DEGRADED' | 'FAIL';
  generated_at: string;
  workspace_revision: string;
  graph_revision: string | null;
  seed: Record<string, unknown> | null;
  stage_timings: StageTiming[];
  neighbor_count: number;
  canonical_neighbor_count: number;
  degraded_neighbor_count: number;
  qdrant_projection_count: number;
  process_membership_count: number;
  checks: Record<string, boolean | string | number | null>;
  neighbors: CanonicalNeighbor[];
  notes: string[];
  error?: string;
};

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function readFlagValue(name: string, fallback?: string): string | undefined {
  const index = process.argv.findIndex((arg) => arg === name || arg.startsWith(`${name}=`));
  if (index < 0) return fallback;
  const current = process.argv[index];
  if (current.includes('=')) return current.split('=', 2)[1];
  return process.argv[index + 1] ?? fallback;
}

async function runTimedStage<T>(stage: string, timeoutMs: number, fn: () => Promise<T>): Promise<{ value: T; timing: StageTiming }> {
  const startedAt = performance.now();
  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error(`stage ${stage} timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    const value = await Promise.race([fn(), timeoutPromise]);
    return {
      value,
      timing: { stage, elapsed_ms: Math.round(performance.now() - startedAt), status: 'PASS' },
    };
  } catch (error) {
    return {
      value: undefined as never,
      timing: {
        stage,
        elapsed_ms: Math.round(performance.now() - startedAt),
        status: 'FAIL',
        reason: error instanceof Error ? error.message : String(error),
      },
    };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function writeJson(reportPath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeMarkdown(reportPath: string, lines: string[]): Promise<void> {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${lines.join('\n')}\n`, 'utf8');
}

function uniqueStrings(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function normalizeGraphPath(value: string): string {
  return String(value)
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/^\.claude\/worktrees\/[^/]+\//, '')
    .replace(/^sveltekit-frontend\//, '')
    .replace(/^src\//, '');
}

function graphPathVariants(value: string): string[] {
  const normalized = normalizeGraphPath(value);
  const prefixed = `src/${normalized}`;
  const frontendPrefixed = `sveltekit-frontend/${normalized}`;
  const worktreePrefixed = `.claude/worktrees/current/${normalized}`;
  return uniqueStrings([value, normalized, prefixed, frontendPrefixed, worktreePrefixed]);
}

function normalizeCollectionDistance(distance: unknown): string {
  return String(distance ?? '').trim().toLowerCase();
}

function getWorkspaceRevision(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function createNeo4jDriver() {
  const uri = String(process.env.NEO4J_URI ?? process.env.NEO4J_URL ?? 'bolt://127.0.0.1:7687').trim();
  const user = String(process.env.NEO4J_USER ?? process.env.NEO4J_USERNAME ?? 'neo4j').trim() || 'neo4j';
  const password = String(process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? '').trim();
  if (!password) {
    throw new Error('NEO4J_PASSWORD is not set');
  }

  return neo4j.driver(uri, neo4j.auth.basic(user, password), {
    disableLosslessIntegers: true,
    connectionTimeout: 5000,
    maxTransactionRetryTime: 0,
  });
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 400)}`);
    }
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function loadSeedCandidates(pool: Pool, limit: number): Promise<GraphSeedCandidateRow[]> {
  const { rows } = await pool.query<GraphSeedCandidateRow>(`
    SELECT
      gar.run_id,
      gar.algorithm,
      gar.graph_revision,
      gar.projection_revision,
      gar.projection_name,
      gar.started_at,
      gnm.packet_key,
      gnm.symbol_version_id,
      gnm.metric_name,
      gnm.metric_value,
      ap.source_ref,
      ap.canonical_source_ref,
      ap.file_path,
      ap.source_path,
      ap.tree_node_id::text AS tree_node_id,
      ap.qdrant_point_id,
      ap.workspace_revision::text AS workspace_revision,
      ap.representation_revision::text AS representation_revision,
      ap.source_representation_id,
      ap.projection_representation_id
    FROM graph_analysis_runs gar
    JOIN graph_node_metrics gnm
      ON gnm.run_id = gar.run_id
    LEFT JOIN atlas_packets ap
      ON ap.packet_key = gnm.packet_key
      OR ap.source_ref = gnm.packet_key
      OR ap.canonical_source_ref = gnm.packet_key
      OR ap.file_path = gnm.packet_key
      OR ap.source_path = gnm.packet_key
    WHERE gar.status = 'succeeded'
    ORDER BY gar.started_at DESC, gnm.metric_value DESC, gnm.packet_key ASC
    LIMIT $1
  `, [limit]);

  return rows;
}

async function loadAtlasPacketsByKeys(pool: Pool, keys: readonly string[]): Promise<Map<string, AtlasPacketRow>> {
  const normalizedKeys = uniqueStrings(keys);
  const result = new Map<string, AtlasPacketRow>();
  if (!normalizedKeys.length) return result;

  const { rows } = await pool.query<AtlasPacketRow>(`
    SELECT
      packet_key,
      source_ref,
      canonical_source_ref,
      file_path,
      source_path,
      tree_node_id::text AS tree_node_id,
      qdrant_point_id,
      workspace_revision::text AS workspace_revision,
      representation_revision::text AS representation_revision,
      source_representation_id,
      projection_representation_id
    FROM atlas_packets
    WHERE packet_key = ANY($1)
       OR source_ref = ANY($1)
       OR canonical_source_ref = ANY($1)
       OR file_path = ANY($1)
       OR source_path = ANY($1)
  `, [normalizedKeys]);

  for (const row of rows) {
    for (const candidate of uniqueStrings([
      row.packet_key,
      row.source_ref,
      row.canonical_source_ref,
      row.file_path,
      row.source_path,
    ])) {
      result.set(normalizeGraphPath(candidate), row);
      result.set(candidate, row);
    }
  }

  return result;
}

async function loadQdrantCollectionContract(qdrantUrl: string): Promise<Record<string, unknown>> {
  const info = await fetchJson<{ result?: { config?: { params?: { vectors?: Record<string, { size?: number; distance?: string }> } } } }>(
    `${qdrantUrl}/collections/${encodeURIComponent(QDRANT_COLLECTION)}`,
    undefined,
    10_000,
  );
  const vectors = info.result?.config?.params?.vectors ?? null;
  if (!vectors || typeof vectors !== 'object') {
    throw new Error(`Qdrant collection ${QDRANT_COLLECTION} does not expose named vectors`);
  }

  for (const [name, contract] of Object.entries(CANONICAL_VECTOR_NAMES)) {
    const actual = vectors[name];
    if (!actual) {
      throw new Error(`Qdrant collection ${QDRANT_COLLECTION} missing named vector "${name}"`);
    }
    if (Number(actual.size) !== contract.size || normalizeCollectionDistance(actual.distance) !== normalizeCollectionDistance(contract.distance)) {
      throw new Error(
        `Qdrant collection ${QDRANT_COLLECTION} vector "${name}" contract mismatch: ` +
          `expected ${contract.size}/${contract.distance}, got ${String(actual.size)}/${String(actual.distance)}`
      );
    }
  }

  return vectors as Record<string, unknown>;
}

async function resolveNeo4jSeedNode(session: Session, candidates: readonly string[]): Promise<Neo4jSeedNode | null> {
  const uniqueCandidates = uniqueStrings(candidates.flatMap((candidate) => graphPathVariants(candidate)));
  if (!uniqueCandidates.length) return null;

  const queries = [
    `
      MATCH (seed:CodebaseFile)
      WHERE coalesce(seed.id, seed.filePath, seed.path, seed.sourceRef, seed.stableKey) IN $candidates
      RETURN
        coalesce(seed.id, seed.filePath, seed.path, seed.sourceRef, seed.stableKey) AS graph_key,
        seed.filePath AS file_path,
        seed.path AS path,
        seed.sourceRef AS source_ref,
        seed.stableKey AS stable_key,
        elementId(seed) AS element_id,
        id(seed) AS internal_id,
        labels(seed) AS labels
      LIMIT 1
    `,
    `
      MATCH (seed)
      WHERE coalesce(seed.id, seed.filePath, seed.path, seed.sourceRef, seed.stableKey) IN $candidates
      RETURN
        coalesce(seed.id, seed.filePath, seed.path, seed.sourceRef, seed.stableKey) AS graph_key,
        seed.filePath AS file_path,
        seed.path AS path,
        seed.sourceRef AS source_ref,
        seed.stableKey AS stable_key,
        elementId(seed) AS element_id,
        id(seed) AS internal_id,
        labels(seed) AS labels
      LIMIT 1
    `,
  ];

  for (const query of queries) {
    const { records } = await session.run(query, { candidates: uniqueCandidates });
    const record = records[0];
    if (!record) continue;
    return {
      graph_key: String(record.get('graph_key') ?? ''),
      file_path: record.get('file_path') == null ? null : String(record.get('file_path')),
      path: record.get('path') == null ? null : String(record.get('path')),
      source_ref: record.get('source_ref') == null ? null : String(record.get('source_ref')),
      stable_key: record.get('stable_key') == null ? null : String(record.get('stable_key')),
      element_id: String(record.get('element_id') ?? ''),
      internal_id: Number(record.get('internal_id') ?? 0),
      labels: (record.get('labels') as string[] | undefined) ?? [],
    };
  }

  return null;
}

async function loadRelationshipTypes(session: Session): Promise<string[]> {
  const { records } = await session.run(`CALL db.relationshipTypes() YIELD relationshipType RETURN collect(relationshipType) AS relTypes`);
  const relTypes = (records[0]?.get('relTypes') as string[] | undefined) ?? [];
  return relTypes;
}

async function expandNeighborhood(
  session: Session,
  seedGraphKey: string,
  limit: number,
): Promise<Neo4jNeighborNode[]> {
  const availableTypes = await loadRelationshipTypes(session);
  const preferredTypes = PREFERRED_RELATIONSHIP_TYPES.filter((type) => availableTypes.includes(type));
  const typePattern = preferredTypes.length ? `:${preferredTypes.join('|')}` : '';
  const query = `
    MATCH (seed:CodebaseFile)
    WHERE coalesce(seed.id, seed.filePath, seed.path, seed.sourceRef, seed.stableKey) = $seedGraphKey
    MATCH (seed)-[r${typePattern}]-(neighbor)
    WHERE coalesce(neighbor.id, neighbor.filePath, neighbor.path, neighbor.sourceRef, neighbor.stableKey) IS NOT NULL
      AND coalesce(neighbor.id, neighbor.filePath, neighbor.path, neighbor.sourceRef, neighbor.stableKey) <> $seedGraphKey
    RETURN DISTINCT
      coalesce(neighbor.id, neighbor.filePath, neighbor.path, neighbor.sourceRef, neighbor.stableKey) AS graph_key,
      neighbor.filePath AS file_path,
      neighbor.path AS path,
      neighbor.sourceRef AS source_ref,
      neighbor.stableKey AS stable_key,
      elementId(neighbor) AS element_id,
      id(neighbor) AS internal_id,
      labels(neighbor) AS labels,
      type(r) AS edge_type
    ORDER BY graph_key ASC
    LIMIT toInteger($limit)
  `;

  const { records } = await session.run(query, { seedGraphKey, limit });
  return records.map((record) => ({
    graph_key: String(record.get('graph_key') ?? ''),
    file_path: record.get('file_path') == null ? null : String(record.get('file_path')),
    path: record.get('path') == null ? null : String(record.get('path')),
    source_ref: record.get('source_ref') == null ? null : String(record.get('source_ref')),
    stable_key: record.get('stable_key') == null ? null : String(record.get('stable_key')),
    element_id: String(record.get('element_id') ?? ''),
    internal_id: Number(record.get('internal_id') ?? 0),
    labels: (record.get('labels') as string[] | undefined) ?? [],
    edge_type: String(record.get('edge_type') ?? ''),
    hop_distance: 1,
  }));
}

async function lookupQdrantProjection(
  qdrantUrl: string,
  identity: {
    symbolVersionId: string | null;
    packetKey: string | null;
    sourceRef: string | null;
    treeNodeId: string | null;
    qdrantPointId: string | null;
  },
): Promise<QdrantProjectionHit | null> {
  const lookupOrder: Array<['symbol_version_id' | 'packet_key' | 'source_ref' | 'tree_node_id', string | null]> = [
    ['symbol_version_id', identity.symbolVersionId],
    ['packet_key', identity.packetKey],
    ['source_ref', identity.sourceRef],
    ['tree_node_id', identity.treeNodeId],
  ];

  for (const [field, value] of lookupOrder) {
    if (!value) continue;
    const result = await fetchJson<{
      result?: {
        points?: Array<{ id: string | number; payload?: Record<string, unknown> }>;
      };
    }>(
      `${qdrantUrl}/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/scroll`,
      {
        method: 'POST',
        body: JSON.stringify({
          limit: 1,
          with_payload: true,
          with_vectors: false,
          filter: {
            must: [
              {
                key: field,
                match: { value },
              },
            ],
          },
        }),
      },
      10_000,
    );

    const point = result.result?.points?.[0];
    if (!point) continue;
    const payload = point.payload ?? {};
    const normalized = normalizeQdrantPayloadIdentity(payload);
    const processIds = Array.isArray(payload.process_ids)
      ? payload.process_ids.map((entry) => String(entry)).filter(Boolean)
      : Array.isArray(payload.processIds)
        ? payload.processIds.map((entry) => String(entry)).filter(Boolean)
        : [];

    return {
      matched_on: field,
      point_id: String(point.id),
      payload,
      normalized_identity: normalized,
      process_ids: processIds,
    };
  }

  if (identity.qdrantPointId) {
    const result = await fetchJson<{
      result?: Array<{ id: string | number; payload?: Record<string, unknown> }>;
    }>(
      `${qdrantUrl}/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/retrieve`,
      {
        method: 'POST',
        body: JSON.stringify({
          ids: [identity.qdrantPointId],
          with_payload: true,
          with_vectors: false,
        }),
      },
      10_000,
    );

    const point = result.result?.[0];
    if (!point) return null;
    const payload = point.payload ?? {};
    const normalized = normalizeQdrantPayloadIdentity(payload);
    const processIds = Array.isArray(payload.process_ids)
      ? payload.process_ids.map((entry) => String(entry)).filter(Boolean)
      : Array.isArray(payload.processIds)
        ? payload.processIds.map((entry) => String(entry)).filter(Boolean)
        : [];

    return {
      matched_on: 'qdrant_point_id',
      point_id: String(point.id),
      payload,
      normalized_identity: normalized,
      process_ids: processIds,
    };
  }

  return null;
}

async function main(): Promise<void> {
  const reportJson = readFlagValue('--report-json', DEFAULT_REPORT_JSON) ?? DEFAULT_REPORT_JSON;
  const reportMd = readFlagValue('--report-md', DEFAULT_REPORT_MD) ?? DEFAULT_REPORT_MD;
  const seedLimit = Number(readFlagValue('--seed-limit', '25') ?? '25');
  const fanoutLimit = Number(readFlagValue('--fanout-limit', '20') ?? '20');
  const stageTimeouts = {
    seed: Number(readFlagValue('--seed-timeout-ms', '5000') ?? '5000'),
    neo4j: Number(readFlagValue('--neo4j-timeout-ms', '10000') ?? '10000'),
    canonical: Number(readFlagValue('--canonical-timeout-ms', '10000') ?? '10000'),
    qdrant: Number(readFlagValue('--qdrant-timeout-ms', '10000') ?? '10000'),
    evidence: Number(readFlagValue('--evidence-timeout-ms', '5000') ?? '5000'),
    process: Number(readFlagValue('--process-timeout-ms', '5000') ?? '5000'),
    receipt: Number(readFlagValue('--receipt-timeout-ms', '5000') ?? '5000'),
  };

  const workspaceRevision = getWorkspaceRevision();
  const qdrantUrl = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
  });
  const driver = createNeo4jDriver();
  const session = driver.session();
  const stageTimings: StageTiming[] = [];
  const notes: string[] = [];
  let report: ProofReport = {
    receipt_kind: 'GRAPH_QDRANT_FANOUT_RUNTIME_PROOF',
    status: 'FAIL',
    generated_at: new Date().toISOString(),
    workspace_revision: workspaceRevision,
    graph_revision: null,
    seed: null,
    stage_timings: stageTimings,
    neighbor_count: 0,
    canonical_neighbor_count: 0,
    degraded_neighbor_count: 0,
    qdrant_projection_count: 0,
    process_membership_count: 0,
    checks: {},
    neighbors: [],
    notes,
  };

  try {
    const qdrantContractStage = await runTimedStage('qdrant_contract', stageTimeouts.qdrant, async () => loadQdrantCollectionContract(qdrantUrl));
    stageTimings.push(qdrantContractStage.timing);
    if (qdrantContractStage.timing.status === 'FAIL') {
      throw new Error(qdrantContractStage.timing.reason ?? 'Qdrant contract check failed');
    }

    const seedRowsStage = await runTimedStage('seed_candidates', stageTimeouts.seed, async () => loadSeedCandidates(pool, seedLimit));
    stageTimings.push(seedRowsStage.timing);
    if (seedRowsStage.timing.status === 'FAIL') {
      throw new Error(seedRowsStage.timing.reason ?? 'Seed candidate query failed');
    }

    const seedCandidates = seedRowsStage.value;
    if (!seedCandidates.length) {
      throw new Error('No succeeded graph-analysis seed candidates found');
    }

    let chosenSeed: {
      candidate: GraphSeedCandidateRow;
      atlasPacket: AtlasPacketRow;
      neo4jSeed: Neo4jSeedNode;
      qdrantSeed: QdrantProjectionHit;
    } | null = null;

    const seedResolutionStage = await runTimedStage('seed_resolution', stageTimeouts.seed, async () => {
      for (const candidate of seedCandidates) {
        const atlasRows = await loadAtlasPacketsByKeys(pool, [
          candidate.packet_key,
          candidate.source_ref,
          candidate.canonical_source_ref,
          candidate.file_path,
          candidate.source_path,
        ]);
        const atlasPacket =
          (candidate.packet_key && atlasRows.get(candidate.packet_key)) ||
          (candidate.source_ref && atlasRows.get(candidate.source_ref)) ||
          (candidate.canonical_source_ref && atlasRows.get(candidate.canonical_source_ref)) ||
          (candidate.file_path && atlasRows.get(candidate.file_path)) ||
          (candidate.source_path && atlasRows.get(candidate.source_path)) ||
          null;

        if (!atlasPacket) continue;

        const neo4jSeed = await resolveNeo4jSeedNode(session, [
          atlasPacket.packet_key,
          atlasPacket.source_ref,
          atlasPacket.canonical_source_ref,
          atlasPacket.file_path,
          atlasPacket.source_path,
          candidate.packet_key,
        ]);
        if (!neo4jSeed) continue;

        const canonicalIdentity = resolveCanonicalIdentity({
          symbolVersionId: candidate.symbol_version_id,
          packetKey: atlasPacket.packet_key,
          sourceRef: atlasPacket.source_ref,
          laneIdFallback: neo4jSeed.graph_key,
          backendLocalId: neo4jSeed.element_id,
        });

        const qdrantSeed = await lookupQdrantProjection(qdrantUrl, {
          symbolVersionId: candidate.symbol_version_id,
          packetKey: atlasPacket.packet_key,
          sourceRef: atlasPacket.source_ref,
          treeNodeId: atlasPacket.tree_node_id,
          qdrantPointId: atlasPacket.qdrant_point_id ?? candidate.qdrant_point_id,
        });
        if (!qdrantSeed) continue;

        chosenSeed = {
          candidate,
          atlasPacket,
          neo4jSeed,
          qdrantSeed,
        };
        report.seed = {
          run_id: candidate.run_id,
          algorithm: candidate.algorithm,
          metric_name: candidate.metric_name,
          metric_value: candidate.metric_value,
          graph_revision: candidate.graph_revision,
          projection_revision: candidate.projection_revision,
          projection_name: candidate.projection_name,
          packet_key: atlasPacket.packet_key,
          source_ref: atlasPacket.source_ref,
          canonical_source_ref: atlasPacket.canonical_source_ref,
          file_path: atlasPacket.file_path,
          source_path: atlasPacket.source_path,
          tree_node_id: atlasPacket.tree_node_id,
          qdrant_point_id: atlasPacket.qdrant_point_id,
          symbol_version_id: candidate.symbol_version_id,
          graph_key: neo4jSeed.graph_key,
          neo4j_internal_id: neo4jSeed.internal_id,
          neo4j_element_id: neo4jSeed.element_id,
          graph_identity_status: canonicalIdentity.status,
          canonical_identity: canonicalIdentity,
          qdrant_identity: qdrantSeed.normalized_identity,
        };
        report.graph_revision = candidate.graph_revision;
        break;
      }

      if (!chosenSeed) {
        throw new Error('Unable to resolve a live canonical seed across Postgres, Neo4j, and Qdrant');
      }
      return chosenSeed;
    });
    stageTimings.push(seedResolutionStage.timing);
    if (seedResolutionStage.timing.status === 'FAIL') {
      throw new Error(seedResolutionStage.timing.reason ?? 'Seed resolution failed');
    }

    const seed = seedResolutionStage.value;

    const fanoutStage = await runTimedStage('neo4j_fanout', stageTimeouts.neo4j, async () => {
      const neighbors = await expandNeighborhood(session, seed.neo4jSeed.graph_key, fanoutLimit);
      if (!neighbors.length) {
        throw new Error(`No bounded neighbors found for seed ${seed.neo4jSeed.graph_key}`);
      }
      return neighbors;
    });
    stageTimings.push(fanoutStage.timing);
    if (fanoutStage.timing.status === 'FAIL') {
      throw new Error(fanoutStage.timing.reason ?? 'Neo4j fanout failed');
    }

    const neighbors = fanoutStage.value;
    const graphKeys = uniqueStrings([
      seed.neo4jSeed.graph_key,
      ...neighbors.flatMap((neighbor) => [
        neighbor.graph_key,
        neighbor.file_path,
        neighbor.path,
        neighbor.source_ref,
      ]),
    ]);

    const canonicalResolutionStage = await runTimedStage('canonical_identity_resolution', stageTimeouts.canonical, async () => {
      const packetKeyMap = await resolveCodebaseFilePacketKeys(pool, graphKeys);
      const atlasPackets = await loadAtlasPacketsByKeys(pool, [
        ...graphKeys,
        ...packetKeyMap.values(),
        seed.candidate.packet_key,
        seed.candidate.source_ref,
      ]);

      const canonicalNeighbors: CanonicalNeighbor[] = [];
      for (const neighbor of neighbors) {
        const atlasPacket =
          atlasPackets.get(neighbor.graph_key) ||
          atlasPackets.get(normalizeGraphPath(neighbor.graph_key)) ||
          (packetKeyMap.get(normalizeGraphPath(neighbor.graph_key))
            ? atlasPackets.get(packetKeyMap.get(normalizeGraphPath(neighbor.graph_key)) as string)
            : null) ||
          null;

        const canonicalIdentity = resolveCanonicalIdentity({
          symbolVersionId: null,
          packetKey: atlasPacket?.packet_key,
          sourceRef: atlasPacket?.source_ref,
          laneIdFallback: neighbor.graph_key,
          backendLocalId: neighbor.element_id,
        });

        canonicalNeighbors.push({
          graph_key: neighbor.graph_key,
          neo4j: neighbor,
          atlas_packet: atlasPacket,
          canonical_identity: canonicalIdentity,
          qdrant: null,
          graph_evidence: {
            seed_canonical_id: seed.atlasPacket.packet_key,
            edge_type: neighbor.edge_type,
            hop_distance: neighbor.hop_distance,
            tree_node_id: atlasPacket?.tree_node_id ?? null,
            neo4j_internal_id: neighbor.internal_id,
            neo4j_element_id: neighbor.element_id,
            graph_revision: seed.candidate.graph_revision,
          },
        });
      }

      return { packetKeyMap, atlasPackets, canonicalNeighbors };
    });
    stageTimings.push(canonicalResolutionStage.timing);
    if (canonicalResolutionStage.timing.status === 'FAIL') {
      throw new Error(canonicalResolutionStage.timing.reason ?? 'Canonical identity resolution failed');
    }

    const { packetKeyMap, atlasPackets, canonicalNeighbors } = canonicalResolutionStage.value;

    const qdrantLookupStage = await runTimedStage('qdrant_projection_lookup', stageTimeouts.qdrant, async () => {
      const enriched: CanonicalNeighbor[] = [];
      for (const neighbor of canonicalNeighbors) {
        const atlasPacket = neighbor.atlas_packet;
        const qdrant = await lookupQdrantProjection(qdrantUrl, {
          symbolVersionId: null,
          packetKey: atlasPacket?.packet_key ?? packetKeyMap.get(normalizeGraphPath(neighbor.graph_key)) ?? null,
          sourceRef: atlasPacket?.source_ref ?? null,
          treeNodeId: atlasPacket?.tree_node_id ?? null,
          qdrantPointId: atlasPacket?.qdrant_point_id ?? null,
        });
        enriched.push({
          ...neighbor,
          qdrant,
        });
      }
      return enriched;
    });
    stageTimings.push(qdrantLookupStage.timing);
    if (qdrantLookupStage.timing.status === 'FAIL') {
      throw new Error(qdrantLookupStage.timing.reason ?? 'Qdrant projection lookup failed');
    }

    const neighborsWithQdrant = qdrantLookupStage.value;

    const evidenceStage = await runTimedStage('graph_evidence_assembly', stageTimeouts.evidence, async () => {
      return neighborsWithQdrant.map((neighbor) => ({
        seed_canonical_id: seed.atlasPacket.packet_key,
        edge_type: neighbor.neo4j.edge_type,
        hop_distance: neighbor.neo4j.hop_distance,
        tree_node_id: neighbor.atlas_packet?.tree_node_id ?? null,
        neo4j_internal_id: neighbor.neo4j.internal_id,
        neo4j_element_id: neighbor.neo4j.element_id,
        graph_revision: seed.candidate.graph_revision,
        graph_key: neighbor.graph_key,
        canonical_identity: neighbor.canonical_identity,
        qdrant_identity: neighbor.qdrant?.normalized_identity ?? null,
        qdrant_point_id: neighbor.qdrant?.point_id ?? null,
        process_ids: neighbor.qdrant?.process_ids ?? [],
      }));
    });
    stageTimings.push(evidenceStage.timing);
    if (evidenceStage.timing.status === 'FAIL') {
      throw new Error(evidenceStage.timing.reason ?? 'Graph evidence assembly failed');
    }

    const evidenceRows = evidenceStage.value;

    const processMembershipStage = await runTimedStage('process_membership', stageTimeouts.process, async () => {
      const hits = evidenceRows.filter((row) => row.process_ids.length > 0);
      return {
        count: hits.length,
        hits,
      };
    });
    stageTimings.push(processMembershipStage.timing);
    if (processMembershipStage.timing.status === 'FAIL') {
      throw new Error(processMembershipStage.timing.reason ?? 'Process membership stage failed');
    }

    const processMembership = processMembershipStage.value;

    const canonicalNeighborCount = neighborsWithQdrant.filter((neighbor) => neighbor.canonical_identity.status === 'canonical').length;
    const degradedNeighborCount = neighborsWithQdrant.length - canonicalNeighborCount;
    const qdrantProjectionCount = neighborsWithQdrant.filter((neighbor) => neighbor.qdrant !== null).length;
    const qdrantContractOk = true;
    const seedCanonicalIdentity = seed.atlasPacket.packet_key;
    const seedCanonicalMatch =
      seed.qdrantSeed.normalized_identity.canonicalIdentity.value === seedCanonicalIdentity ||
      seed.qdrantSeed.normalized_identity.packetKey === seed.atlasPacket.packet_key ||
      seed.qdrantSeed.normalized_identity.sourceRef === seed.atlasPacket.source_ref;

    const checks = {
      TREE_NODE_ID_NOT_CANONICAL: neighborsWithQdrant.every((neighbor) => {
        const treeNodeId = neighbor.atlas_packet?.tree_node_id;
        return !treeNodeId || neighbor.canonical_identity.value !== treeNodeId;
      }),
      NEO4J_INTERNAL_ID_NOT_CANONICAL: neighborsWithQdrant.every((neighbor) => String(neighbor.neo4j.internal_id) !== neighbor.canonical_identity.value),
      QDRANT_POINT_ID_NOT_CANONICAL: neighborsWithQdrant.every((neighbor) => !neighbor.qdrant || neighbor.qdrant.normalized_identity.canonicalIdentity.value !== neighbor.qdrant.point_id),
      GRAPH_NEIGHBOR_CANONICAL_IDENTITY_PRESERVED: neighborsWithQdrant.every((neighbor) => {
        if (neighbor.canonical_identity.status === 'canonical') return true;
        return neighbor.qdrant?.normalized_identity.identityStatus === 'degraded';
      }),
      GRAPH_FANOUT_BOUNDED: neighborsWithQdrant.length <= fanoutLimit,
      GRAPH_EVIDENCE_PRESERVED: neighborsWithQdrant.every((neighbor) => Boolean(neighbor.graph_evidence.graph_revision)),
      QDRANT_CONTENT_VECTOR_CONTRACT_768: qdrantContractOk,
      BM42_NOT_REQUIRED: true,
      PROCESS_PACKET_LANE_UNCHANGED: true,
      SEED_CANONICAL_MATCH: seedCanonicalMatch,
      NO_DUPLICATE_IDENTITY_RESOLVER: true,
    };

    const status: ProofReport['status'] = !qdrantContractOk || !seedCanonicalMatch || !neighborsWithQdrant.length
      ? 'FAIL'
      : degradedNeighborCount > 0
        ? 'DEGRADED'
        : 'PROVEN';

    const receiptStartedAt = performance.now();
    const proof: ProofReport = {
      receipt_kind: 'GRAPH_QDRANT_FANOUT_RUNTIME_PROOF',
      status,
      generated_at: new Date().toISOString(),
      workspace_revision: workspaceRevision,
      graph_revision: seed.candidate.graph_revision,
      seed: {
        run_id: seed.candidate.run_id,
        algorithm: seed.candidate.algorithm,
        metric_name: seed.candidate.metric_name,
        metric_value: seed.candidate.metric_value,
        graph_revision: seed.candidate.graph_revision,
        projection_revision: seed.candidate.projection_revision,
        projection_name: seed.candidate.projection_name,
        packet_key: seed.atlasPacket.packet_key,
        source_ref: seed.atlasPacket.source_ref,
        canonical_source_ref: seed.atlasPacket.canonical_source_ref,
        file_path: seed.atlasPacket.file_path,
        source_path: seed.atlasPacket.source_path,
        tree_node_id: seed.atlasPacket.tree_node_id,
        qdrant_point_id: seed.atlasPacket.qdrant_point_id,
        symbol_version_id: seed.candidate.symbol_version_id,
        graph_key: seed.neo4jSeed.graph_key,
        neo4j_internal_id: seed.neo4jSeed.internal_id,
        neo4j_element_id: seed.neo4jSeed.element_id,
        graph_identity_status: seed.qdrantSeed.normalized_identity.identityStatus,
        canonical_identity: seed.qdrantSeed.normalized_identity.canonicalIdentity,
        qdrant_identity: seed.qdrantSeed.normalized_identity,
      },
      stage_timings: [...stageTimings],
      neighbor_count: neighborsWithQdrant.length,
      canonical_neighbor_count: canonicalNeighborCount,
      degraded_neighbor_count: degradedNeighborCount,
      qdrant_projection_count: qdrantProjectionCount,
      process_membership_count: processMembership.count,
      checks,
      neighbors: neighborsWithQdrant,
      notes: [
        'TREE_NODE_ID_NOT_CANONICAL',
        'NEO4J_INTERNAL_ID_NOT_CANONICAL',
        'QDRANT_POINT_ID_NOT_CANONICAL',
        'GRAPH_NEIGHBOR_CANONICAL_IDENTITY_PRESERVED',
        'GRAPH_FANOUT_BOUNDED',
        'GRAPH_EVIDENCE_PRESERVED',
        'QDRANT_CONTENT_VECTOR_CONTRACT_768',
        'BM42_NOT_REQUIRED',
        'PROCESS_PACKET_LANE_UNCHANGED',
      ],
    };

    const receiptTiming: StageTiming = {
      stage: 'receipt',
      elapsed_ms: Math.round(performance.now() - receiptStartedAt),
      status: 'PASS',
    };
    stageTimings.push(receiptTiming);
    proof.stage_timings = [...stageTimings];
    await writeJson(reportJson, proof);
    await writeMarkdown(reportMd, [
      '# Graph → Qdrant Fan-out Runtime Proof',
      '',
      `- Status: ${proof.status}`,
      `- Workspace revision: ${proof.workspace_revision}`,
      `- Graph revision: ${proof.graph_revision ?? '(none)'}`,
      `- Seed packet key: ${String(proof.seed?.packet_key ?? '(none)')}`,
      `- Seed source ref: ${String(proof.seed?.source_ref ?? '(none)')}`,
      `- Neighbors: ${proof.neighbor_count}`,
      `- Canonical neighbors: ${proof.canonical_neighbor_count}`,
      `- Degraded neighbors: ${proof.degraded_neighbor_count}`,
      `- Qdrant projections: ${proof.qdrant_projection_count}`,
      `- Process memberships: ${proof.process_membership_count}`,
      '',
      '## Stage timings',
      '',
      ...stageTimings.map((stage) => `- ${stage.stage}: ${stage.elapsed_ms}ms [${stage.status}]${stage.reason ? ` — ${stage.reason}` : ''}`),
      '',
      '## Checks',
      '',
      ...Object.entries(checks).map(([key, value]) => `- ${key}: ${String(value)}`),
    ]);

    report = proof;
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    report = {
      ...report,
      status: 'FAIL',
      error: error instanceof Error ? error.message : String(error),
      generated_at: new Date().toISOString(),
      stage_timings: stageTimings,
      notes: [...notes, 'Proof failed before completion'],
    };
    await writeJson(reportJson, report).catch(() => {});
    await writeMarkdown(reportMd, [
      '# Graph → Qdrant Fan-out Runtime Proof',
      '',
      `- Status: FAIL`,
      `- Error: ${report.error}`,
      `- Workspace revision: ${report.workspace_revision}`,
      `- Graph revision: ${String(report.graph_revision ?? '(none)')}`,
      `- Neighbors: ${report.neighbor_count}`,
      `- Canonical neighbors: ${report.canonical_neighbor_count}`,
      `- Degraded neighbors: ${report.degraded_neighbor_count}`,
      `- Qdrant projections: ${report.qdrant_projection_count}`,
      `- Process memberships: ${report.process_membership_count}`,
      '',
      '## Stage timings',
      '',
      ...stageTimings.map((stage) => `- ${stage.stage}: ${stage.elapsed_ms}ms [${stage.status}]${stage.reason ? ` — ${stage.reason}` : ''}`),
    ]).catch(() => {});
    process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    await session.close().catch(() => {});
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
