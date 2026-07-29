#!/usr/bin/env tsx

import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { createClient } from 'redis';
import { loadRepoEnv, resolveDatabaseUrl, resolveRedisUrl, REPO_ROOT } from './connection-config.mjs';

export type PresenceState =
  | 'PRESENT'
  | 'ABSENT'
  | 'UNAVAILABLE'
  | 'AUTH_REQUIRED'
  | 'SCHEMA_MISMATCH'
  | 'ERROR';

export type ProofState =
  | 'FULLY_PROVEN'
  | 'PARTIAL_PROVEN'
  | 'NOT_PROVEN'
  | 'FAILED';

export interface PacketCoverage {
  packetKey: string;
  packetVersion?: number;
  repositoryId?: string;
  workspaceRevision?: string;
  sourceRef?: string;
  contentHash?: string;
  postgres: PresenceState;
  qdrant: PresenceState;
  redis: PresenceState;
  ace: PresenceState;
  hyperrag: PresenceState;
  coverageScore: number;
  diagnostics: string[];
}

export interface RepairAction {
  order: number;
  store: 'POSTGRES' | 'QDRANT' | 'REDIS' | 'ACE' | 'HYPERRAG';
  action: string;
  owner: string;
  validationCommand: string;
  expectedArtifact: string;
  executed: boolean;
  result?: 'PASS' | 'FAIL' | 'SKIPPED';
}

export interface PacketSelectionResult {
  schemaVersion: 'phase108d-packet-selection.v1';
  runId: string;
  selectedPacket: PacketCoverage | null;
  candidatesChecked: number;
  selectionReason: string;
  repairRequested: boolean;
  repairActions: RepairAction[];
  proofCommand?: string;
  proofState: ProofState;
  proofArtifact?: string;
  blockers: string[];
  startedAt: string;
  completedAt: string;
}

interface CliArgs {
  packetKey?: string;
  limit: number;
  workspace?: string;
  json: boolean;
  verbose: boolean;
  repair: boolean;
}

interface AtlasPacketRow extends Record<string, unknown> {
  packet_key: string | null;
  source_ref: string | null;
  feature_id?: string | null;
  packet_version?: number | null;
  repository_id?: string | null;
  workspace_id?: string | null;
  workspace_revision?: string | null;
  lineage_version?: string | null;
  git_commit?: string | null;
  content_hash?: string | null;
  artifact_content_hash?: string | null;
  sha256?: string | null;
  packet_id?: string | null;
  qdrant_point_id?: string | null;
  qdrant_collection?: string | null;
  evidence_state?: string | null;
  status?: string | null;
  identity_lane?: string | null;
  canonical?: boolean | null;
  updated_at?: string | null;
  created_at?: string | null;
  content_embedding_384?: unknown;
  content_embedding_768?: unknown;
  embedding?: unknown;
  embedding_384?: unknown;
  metadata?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
  vectors?: Record<string, unknown> | null;
  topology?: Record<string, unknown> | null;
}

interface ProofGateResult {
  packetKey: string;
  status: 'NOT_PROVEN' | 'PARTIAL_PROVEN' | 'CROSS_STORE_PROVEN';
  snapshots?: Array<Record<string, unknown>>;
  violations?: Array<Record<string, unknown>>;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSX_CLI = resolve(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const PROOF_SCRIPT = resolve(REPO_ROOT, 'scripts', 'atlas', 'phase108d-single-packet-proof.mts');
const PROOF_RESULT_PATH = resolve(REPO_ROOT, 'log', 'artifacts', 'semantic-contract', 'phase108d-single-packet-proof.json');
const OUT_DIR = resolve(REPO_ROOT, 'log', 'artifacts', 'phase108d');
const MD_DIR = resolve(REPO_ROOT, 'docs', 'audits');
const MD_PATH = resolve(MD_DIR, 'phase108d-packet-selection-latest.md');
const DEFAULT_LIMIT = 100;
const REQUIRED_STORES = ['postgres', 'qdrant', 'redis', 'ace', 'hyperrag'] as const;

const coverageWeights: Record<keyof Pick<PacketCoverage, 'postgres' | 'qdrant' | 'redis' | 'ace' | 'hyperrag'>, number> = {
  postgres: 5,
  qdrant: 4,
  redis: 3,
  ace: 4,
  hyperrag: 4,
};

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
  }
  return null;
}

function parseVector(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  }
  const text = normalizeText(value);
  if (!text) return [];
  return text
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((item) => Number.parseFloat(item.trim()))
    .filter((item) => Number.isFinite(item));
}

function isConstantVector(vector: number[]): boolean {
  if (vector.length === 0) return false;
  const first = vector[0];
  return vector.every((value) => value === first);
}

function isValidEmbeddingArtifact(row: AtlasPacketRow): boolean {
  const vector = parseVector(row.content_embedding_384 ?? row.embedding_384 ?? row.embedding ?? row.content_embedding_768);
  if (vector.length !== 384 && vector.length !== 768) return false;
  if (!vector.every((value) => Number.isFinite(value))) return false;
  if (isConstantVector(vector)) return false;

  const producerModel =
    normalizeText(row.metadata?.producer_model)
    ?? normalizeText(row.metadata?.embedding_model)
    ?? normalizeText(row.metadata?.model_id)
    ?? normalizeText(row.payload?.producer_model)
    ?? normalizeText(row.payload?.embedding_model)
    ?? normalizeText(row.payload?.model_id);

  const producerVersion =
    normalizeText(row.metadata?.producer_version)
    ?? normalizeText(row.metadata?.embedding_version)
    ?? normalizeText(row.metadata?.model_version)
    ?? normalizeText(row.payload?.producer_version)
    ?? normalizeText(row.payload?.embedding_version)
    ?? normalizeText(row.payload?.model_version);

  const representationName =
    normalizeText(row.metadata?.representation_name)
    ?? normalizeText(row.payload?.representation_name)
    ?? (vector.length === 384 ? 'dense_384' : 'dense_768');

  return Boolean(producerModel && producerVersion && representationName);
}

function resolveWorkspaceRevision(row: AtlasPacketRow): string | null {
  return (
    normalizeText(row.workspace_revision)
    ?? normalizeText(row.lineage_version)
    ?? normalizeText(row.git_commit)
    ?? null
  );
}

function resolveContentHash(row: AtlasPacketRow): string | null {
  return (
    normalizeText(row.content_hash)
    ?? normalizeText(row.artifact_content_hash)
    ?? normalizeText(row.sha256)
    ?? null
  );
}

function resolveRepositoryId(row: AtlasPacketRow): string | null {
  return (
    normalizeText(row.repository_id)
    ?? normalizeText(row.workspace_id)
    ?? null
  );
}

function resolvePacketVersion(row: AtlasPacketRow): number | undefined {
  const version = asNumber(row.packet_version ?? row.metadata?.packet_version ?? row.payload?.packet_version);
  return version == null ? undefined : version;
}

function rowEvidenceState(row: AtlasPacketRow): string {
  return (
    normalizeText(row.evidence_state)
    ?? normalizeText(row.status)
    ?? (asBoolean(row.canonical) === true ? 'ACTIVE_VERIFIED' : '')
  ).trim();
}

function computeCoverageScore(packet: PacketCoverage): number {
  const total = Object.values(coverageWeights).reduce((sum, value) => sum + value, 0);
  const present = (packet.postgres === 'PRESENT' ? coverageWeights.postgres : 0)
    + (packet.qdrant === 'PRESENT' ? coverageWeights.qdrant : 0)
    + (packet.redis === 'PRESENT' ? coverageWeights.redis : 0)
    + (packet.ace === 'PRESENT' ? coverageWeights.ace : 0)
    + (packet.hyperrag === 'PRESENT' ? coverageWeights.hyperrag : 0);
  return total > 0 ? Number((present / total).toFixed(4)) : 0;
}

function coverageComplete(packet: PacketCoverage | null): boolean {
  return Boolean(packet)
    && packet!.postgres === 'PRESENT'
    && packet!.qdrant === 'PRESENT'
    && packet!.redis === 'PRESENT'
    && packet!.ace === 'PRESENT'
    && packet!.hyperrag === 'PRESENT';
}

function getOrderClause(columns: Set<string>): string {
  const parts: string[] = [];
  if (columns.has('updated_at')) parts.push('updated_at DESC NULLS LAST');
  if (columns.has('created_at')) parts.push('created_at DESC NULLS LAST');
  if (columns.has('packet_version')) parts.push('packet_version DESC NULLS LAST');
  if (columns.has('lineage_version')) parts.push('lineage_version DESC NULLS LAST');
  parts.push('packet_key ASC');
  return parts.join(', ');
}

function matchesWorkspaceFilter(row: AtlasPacketRow, workspace?: string): boolean {
  if (!workspace) return true;
  const candidates = [
    row.workspace_revision,
    row.lineage_version,
    row.git_commit,
    normalizeText(row.metadata?.workspace_revision),
    normalizeText(row.payload?.workspace_revision),
    normalizeText(row.metadata?.git_commit),
    normalizeText(row.payload?.git_commit),
  ].filter((value): value is string => Boolean(normalizeText(value)));
  return candidates.some((value) => value === workspace);
}

function packetKeyVariants(packetKey: string): string[] {
  const normalized = normalizeText(packetKey);
  if (!normalized) return [];
  if (normalized.startsWith('packet:')) {
    return [normalized, normalized.slice('packet:'.length)];
  }
  return [normalized, `packet:${normalized}`];
}

function packetKeyMatchesExplicitTarget(candidateKey: string, explicitPacketKey: string): boolean {
  const targetVariants = packetKeyVariants(explicitPacketKey);
  return targetVariants.includes(candidateKey);
}

function buildCoverageFromRow(row: AtlasPacketRow): PacketCoverage {
  const packetKey = normalizeText(row.packet_key) ?? '';
  const contentHash = resolveContentHash(row);
  const workspaceRevision = resolveWorkspaceRevision(row);
  const repositoryId = resolveRepositoryId(row);
  const packetVersion = resolvePacketVersion(row);
  const diagnostics: string[] = [];

  if (!packetKey) diagnostics.push('Postgres row missing packet_key');
  if (!normalizeText(row.source_ref)) diagnostics.push('Postgres row missing source_ref');
  if (!contentHash) diagnostics.push('Postgres row missing content_hash/sha256');
  if (!workspaceRevision) diagnostics.push('Postgres row missing workspace_revision/lineage_version/git_commit');
  if (rowEvidenceState(row).includes('SUPERSEDED')) diagnostics.push('Postgres packet is superseded');

  return {
    packetKey,
    packetVersion,
    repositoryId: repositoryId ?? undefined,
    workspaceRevision: workspaceRevision ?? undefined,
    sourceRef: normalizeText(row.source_ref) ?? undefined,
    contentHash: contentHash ?? undefined,
    postgres: packetKey ? 'PRESENT' : 'ABSENT',
    qdrant: 'ABSENT',
    redis: 'ABSENT',
    ace: 'ABSENT',
    hyperrag: 'ABSENT',
    coverageScore: 0,
    diagnostics,
  };
}

function scorePostgresHint(row: AtlasPacketRow): number {
  let score = 0;
  if (normalizeText(row.content_hash) || normalizeText(row.sha256) || normalizeText(row.artifact_content_hash)) score += 3;
  if (resolveWorkspaceRevision(row)) score += 2;
  if (resolvePacketVersion(row) != null) score += 1;
  if (normalizeText(row.qdrant_point_id)) score += 4;
  if (normalizeText(row.qdrant_collection)) score += 1;
  if (normalizeText(row.redis_centroid_key)) score += 3;
  if (normalizeText(row.identity_lane)) score += 1;
  if (rowEvidenceState(row).includes('ACTIVE')) score += 2;
  return score;
}

function isCanonicalAcePacketPayload(payload: Record<string, unknown>): boolean {
  const packetKind = normalizeText(payload.packetKind);
  const schemaVersion = normalizeText(payload.schemaVersion);
  const objective = normalizeText(payload.objective);
  const selectedEntities = payload.selectedEntities;
  const laneStates = payload.laneStates;
  const violations = payload.violations;
  const sourceRefs = payload.sourceRefs;
  const memorySwap = payload.memorySwap as Record<string, unknown> | null | undefined;
  const tokenBudget = asNumber(payload.tokenBudget);

  if (!packetKind || !schemaVersion || !objective) return false;
  if (!Array.isArray(selectedEntities) || selectedEntities.length === 0) return false;
  if (!Array.isArray(laneStates) || laneStates.length === 0) return false;
  if (!Array.isArray(violations)) return false;
  if (!Array.isArray(sourceRefs) || sourceRefs.length === 0) return false;
  if (!memorySwap || typeof memorySwap !== 'object') return false;
  if (!normalizeText(memorySwap.packetKey) || !normalizeText(memorySwap.cacheKey)) return false;
  if (!Number.isFinite(tokenBudget ?? NaN)) return false;
  return true;
}

async function getTableColumns(pool: pg.Pool, table: string): Promise<Set<string>> {
  const { rows } = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1`,
    [table],
  );
  return new Set(rows.map((row) => String(row.column_name)));
}

async function fetchCandidates(pool: pg.Pool, limit: number): Promise<AtlasPacketRow[]> {
  const columns = await getTableColumns(pool, 'atlas_packets');
  const orderBy = getOrderClause(columns);
  const selectColumns = [
    'packet_key',
    'source_ref',
    'feature_id',
    'packet_version',
    'repository_id',
    'workspace_id',
    'workspace_revision',
    'lineage_version',
    'git_commit',
    'content_hash',
    'artifact_content_hash',
    'sha256',
    'packet_id',
    'qdrant_point_id',
    'qdrant_collection',
    'evidence_state',
    'status',
    'identity_lane',
    'canonical',
    'updated_at',
    'created_at',
    'redis_centroid_key',
    'metadata',
    'payload',
    'vectors',
    'topology',
  ].filter((column) => columns.has(column));
  const { rows } = await pool.query(
    `SELECT ${selectColumns.length > 0 ? selectColumns.join(', ') : '*'}
       FROM atlas_packets
      WHERE packet_key IS NOT NULL
        AND source_ref IS NOT NULL
      ORDER BY ${orderBy}
      LIMIT $1`,
    [limit],
  );
  return rows as AtlasPacketRow[];
}

async function probeQdrantPacket(
  packet: PacketCoverage,
  row: AtlasPacketRow,
  qdrantUrl = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333',
): Promise<PresenceState> {
  const url = qdrantUrl.replace(/\/+$/, '');
  let collections: string[] = [];

  try {
    const response = await fetch(`${url}/collections`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) return 'AUTH_REQUIRED';
      return 'UNAVAILABLE';
    }
    const json = await response.json() as any;
    collections = Array.isArray(json?.result?.collections)
      ? json.result.collections.map((entry: any) => String(entry?.name ?? '')).filter(Boolean)
      : [];
  } catch (error) {
    const text = String(error instanceof Error ? error.message : error);
    if (/auth|unauthor/i.test(text)) return 'AUTH_REQUIRED';
    return 'UNAVAILABLE';
  }

  const canonicalCollections = collections.filter((name) => /^codebase_chunks_/i.test(name));
  if (canonicalCollections.length === 0) {
    packet.diagnostics.push('No canonical Qdrant collections discovered');
    return 'ABSENT';
  }

  let sawMismatch = false;
  let sawPoint = false;
  let sawMatch = false;

  for (const collection of canonicalCollections) {
    try {
      const response = await fetch(`${url}/collections/${encodeURIComponent(collection)}/points/scroll`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          limit: 1,
          filter: { must: [{ key: 'packet_key', match: { value: packet.packetKey } }] },
          with_payload: true,
          with_vectors: false,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (response.status === 401 || response.status === 403) return 'AUTH_REQUIRED';
      if (!response.ok) continue;

      const json = await response.json() as any;
      const point = json?.result?.points?.[0];
      if (!point) continue;

      sawPoint = true;
      const payload = point.payload && typeof point.payload === 'object' ? point.payload as Record<string, unknown> : {};
      const pointPacketKey = normalizeText(payload.packet_key) ?? normalizeText(payload.packetKey) ?? normalizeText(point.id);
      const pointSourceRef = normalizeText(payload.source_ref) ?? normalizeText(payload.sourceRef);
      const pointContentHash = normalizeText(payload.content_hash) ?? normalizeText(payload.contentHash);
      const pointWorkspaceRevision = normalizeText(payload.workspace_revision) ?? normalizeText(payload.workspaceRevision);
      const dimensions = asNumber(payload.dimensions) ?? asNumber(payload.embedding_dimension);
      const representationName = normalizeText(payload.representation_name) ?? normalizeText(payload.representationName) ?? normalizeText(payload.embedding_lane);

      const packetKeyMatches = pointPacketKey === packet.packetKey;
      const sourceRefMatches = !packet.sourceRef || pointSourceRef === packet.sourceRef;
      const hashMatches = !packet.contentHash || pointContentHash === packet.contentHash;
      const workspaceMatches = !packet.workspaceRevision || pointWorkspaceRevision === packet.workspaceRevision;
      const laneValid = !representationName || ['dense_384', 'dense_768', 'latent_64'].includes(representationName);
      const dimensionValid = !dimensions || [64, 384, 768].includes(dimensions);

      if (packetKeyMatches && sourceRefMatches && hashMatches && workspaceMatches && laneValid && dimensionValid) {
        sawMatch = true;
      } else {
        sawMismatch = true;
        packet.diagnostics.push(
          `Qdrant ${collection} mismatch: packet_key=${pointPacketKey ?? 'null'} source_ref=${pointSourceRef ?? 'null'} content_hash=${pointContentHash ?? 'null'} workspace_revision=${pointWorkspaceRevision ?? 'null'} representation_name=${representationName ?? 'null'} dimensions=${dimensions ?? 'null'}`,
        );
      }
    } catch (error) {
      packet.diagnostics.push(`Qdrant ${collection} probe failed: ${String(error instanceof Error ? error.message : error)}`);
      continue;
    }
  }

  if (sawMatch) return 'PRESENT';
  if (sawPoint && sawMismatch) return 'SCHEMA_MISMATCH';
  if (sawPoint) return 'SCHEMA_MISMATCH';
  return 'ABSENT';
}

async function probeRedisPacket(
  packet: PacketCoverage,
  redisUrl = resolveRedisUrl(loadRepoEnv(process.env)),
): Promise<{ state: PresenceState; raw?: string | null; keyUsed?: string | null; }> {
  const client = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 3000,
      reconnectStrategy: () => false,
    },
  });

  client.on('error', () => {});

  try {
    await client.connect();
  } catch (error) {
    const text = String(error instanceof Error ? error.message : error);
    if (/auth|password|denied/i.test(text)) {
      return { state: 'AUTH_REQUIRED' };
    }
    return { state: 'UNAVAILABLE' };
  }

  try {
    const keys = [
      `bifrost:packet:${packet.packetKey}`,
      `ace:packet:${packet.packetKey}`,
      'ace:packet:latest',
      'bifrost:packet:latest',
      'ace:packet:latest:reconciliation',
      'bifrost:packet:latest:reconciliation',
    ];

    for (const key of keys) {
      const raw = await client.get(key);
      if (!raw) continue;

      if (key.endsWith(':latest') || key.endsWith(':latest:reconciliation')) {
        if (normalizeText(raw) === packet.packetKey) {
          packet.diagnostics.push(`Redis pointer ${key} -> ${raw}`);
        }
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { state: 'SCHEMA_MISMATCH', raw, keyUsed: key };
      }

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { state: 'SCHEMA_MISMATCH', raw, keyUsed: key };
      }

      const payload = parsed as Record<string, unknown>;
      const workspaceRevision = normalizeText(payload.workspaceRevision) ?? normalizeText(payload.workspace_revision);
      const sourceRef = normalizeText(payload.sourceRef) ?? normalizeText(payload.source_ref);
      const memorySwap = payload.memorySwap as Record<string, unknown> | null | undefined;
      const packetKeyFromCache = normalizeText(memorySwap?.cacheKey)?.replace(/^.*packet:/, '') ?? null;
      const packetKey =
        normalizeText(payload.packet_key)
        ?? normalizeText(payload.packetKey)
        ?? normalizeText(memorySwap?.packetKey)
        ?? packetKeyFromCache;

      if (!isCanonicalAcePacketPayload(payload)) {
        return { state: 'SCHEMA_MISMATCH', raw, keyUsed: key };
      }

      if (!packetKey || packetKey !== packet.packetKey || (packet.sourceRef && sourceRef && sourceRef !== packet.sourceRef)) {
        return { state: 'SCHEMA_MISMATCH', raw, keyUsed: key };
      }

      if (packet.workspaceRevision && workspaceRevision && workspaceRevision !== packet.workspaceRevision) {
        return { state: 'SCHEMA_MISMATCH', raw, keyUsed: key };
      }

      if (!workspaceRevision) {
        return { state: 'SCHEMA_MISMATCH', raw, keyUsed: key };
      }

      return { state: 'PRESENT', raw, keyUsed: key };
    }

    return { state: 'ABSENT' };
  } finally {
    await client.quit().catch(() => {});
  }
}

async function probeAcePacket(packet: PacketCoverage): Promise<{ state: PresenceState; raw?: string | null; keyUsed?: string | null; }> {
  const redisProbe = await probeRedisPacket(packet);
  if (redisProbe.state === 'PRESENT') {
    return redisProbe;
  }
  if (redisProbe.state === 'SCHEMA_MISMATCH') return redisProbe;
  return { state: redisProbe.state };
}

async function probeHyperRagPacket(
  packet: PacketCoverage,
): Promise<PresenceState> {
  const probeScript = resolve(REPO_ROOT, 'scripts', 'atlas', 'probe-hyperrag-packet-rpc.mts');
  const query = packet.sourceRef ?? packet.packetKey;

  try {
    const stdout = execFileSync(
      process.execPath,
      [TSX_CLI, probeScript, query, '1', '15000'],
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 20000 },
    ).trim();

    if (!stdout) return 'ABSENT';
    const parsed = JSON.parse(stdout) as { packets?: Array<Record<string, unknown>> };
    const first = parsed.packets?.[0] ?? null;
    if (!first) return 'ABSENT';

    const packetKey = normalizeText(first.packet_key) ?? normalizeText(first.packetKey);
    const sourceRef = normalizeText(first.source_ref) ?? normalizeText(first.sourceRef);
    if ((packetKey && packetKey === packet.packetKey) || (sourceRef && sourceRef === packet.sourceRef)) {
      return 'PRESENT';
    }
    return 'SCHEMA_MISMATCH';
  } catch (error) {
    const text = String(error instanceof Error ? error.message : error);
    if (/auth/i.test(text)) return 'AUTH_REQUIRED';
    if (/timeout/i.test(text)) return 'UNAVAILABLE';
    return 'ERROR';
  }
}

function compareCoverage(a: PacketCoverage, b: PacketCoverage): number {
  const aPresent = REQUIRED_STORES.filter((store) => a[store.toLowerCase() as keyof PacketCoverage] === 'PRESENT').length;
  const bPresent = REQUIRED_STORES.filter((store) => b[store.toLowerCase() as keyof PacketCoverage] === 'PRESENT').length;
  if (aPresent !== bPresent) return bPresent - aPresent;
  if (a.coverageScore !== b.coverageScore) return b.coverageScore - a.coverageScore;
  if (a.diagnostics.length !== b.diagnostics.length) return a.diagnostics.length - b.diagnostics.length;

  const aVersion = a.packetVersion ?? -1;
  const bVersion = b.packetVersion ?? -1;
  if (aVersion !== bVersion) return bVersion - aVersion;

  return a.packetKey.localeCompare(b.packetKey);
}

function selectPacketCoverage(candidates: PacketCoverage[], explicitPacketKey?: string | null): { selectedPacket: PacketCoverage | null; selectionReason: string; } {
  if (explicitPacketKey) {
    const explicit = candidates.find((candidate) => packetKeyMatchesExplicitTarget(candidate.packetKey, explicitPacketKey)) ?? null;
    return {
      selectedPacket: explicit,
      selectionReason: explicit
        ? `Explicit packet requested: ${explicitPacketKey}${explicit.packetKey === explicitPacketKey ? '' : ` (resolved as ${explicit.packetKey})`}`
        : `Explicit packet not found in bounded candidate set: ${explicitPacketKey}`,
    };
  }

  if (candidates.length === 0) {
    return { selectedPacket: null, selectionReason: 'No authoritative Postgres packet candidates were found.' };
  }

  const ranked = candidates.slice().sort(compareCoverage);
  const selectedPacket = ranked[0] ?? null;
  return {
    selectedPacket,
    selectionReason: selectedPacket
      ? `Highest cross-store coverage among ${candidates.length} authoritative Postgres candidates`
      : 'No eligible packet found',
  };
}

function buildRepairActions(packet: PacketCoverage, row: AtlasPacketRow): RepairAction[] {
  const qdrantCollection = normalizeText(row.qdrant_collection) ?? (parseVector(row.content_embedding_384).length === 768 ? 'codebase_chunks_768' : 'codebase_chunks_384');
  return [
    {
      order: 1,
      store: 'QDRANT',
      action: packet.qdrant === 'PRESENT'
        ? 'Qdrant projection already present; validate payload parity only.'
        : 'Upsert one packet projection through the canonical Qdrant adapter.',
      owner: 'scripts/atlas/phase108d-qdrant-single-point-upsert.mts',
      validationCommand: `npx tsx scripts/atlas/phase108d-qdrant-single-point-upsert.mts ${packet.packetKey} ${qdrantCollection}`,
      expectedArtifact: `Qdrant point payload for ${packet.packetKey} in ${qdrantCollection}`,
      executed: false,
    },
    {
      order: 2,
      store: 'REDIS',
      action: packet.redis === 'PRESENT'
        ? 'Redis packet cache already present; verify read-back parity only.'
        : 'Write one packet-sized ACE/Valkey projection through the canonical active-context path.',
      owner: 'sveltekit-frontend/src/mcp/engram_tools.ts',
      validationCommand: `node scripts/atlas/atlas-live-reconciliation-audit.mjs --verbose`,
      expectedArtifact: `ace:packet:${packet.packetKey} and bifrost:packet:${packet.packetKey} Redis projections`,
      executed: false,
    },
    {
      order: 3,
      store: 'ACE',
      action: packet.ace === 'PRESENT'
        ? 'ACE packet already present; verify active-context read-back only.'
        : 'Persist one bounded ACE packet through the existing active-context schema.',
      owner: 'scripts/atlas/build-reconciliation-ace-packet.mts',
      validationCommand: 'npx tsx scripts/atlas/build-reconciliation-ace-packet.mts',
      expectedArtifact: 'Bounded ACE packet readable through atlas_get_active_context',
      executed: false,
    },
    {
      order: 4,
      store: 'HYPERRAG',
      action: packet.hyperrag === 'PRESENT'
        ? 'HyperRAG projection already present; verify packet identity only.'
        : 'Refresh the packet projection through the existing HyperRAG materializer.',
      owner: 'scripts/atlas/hyperrag-packet-materializer.mjs',
      validationCommand: `npx tsx scripts/atlas/probe-hyperrag-packet-rpc.mts ${packet.sourceRef ?? packet.packetKey} 1 15000`,
      expectedArtifact: 'HyperRAG packet RPC returns a packet with matching identity or lineage',
      executed: false,
    },
  ];
}

function buildRepairPacket(packet: PacketCoverage, row: AtlasPacketRow) {
  const now = new Date().toISOString();
  return {
    schemaVersion: '1.0.0',
    packetKind: 'ace.packet.selection',
    acePacketId: `ace_${crypto.randomUUID()}`,
    runId: `run_${crypto.randomUUID()}`,
    workspaceId: resolveRepositoryId(row) ?? 'deeds-web-app',
    workspaceRevision: packet.workspaceRevision ?? resolveWorkspaceRevision(row) ?? '',
    objective: `Resume one-packet Phase 108D work for ${packet.packetKey}.`,
    createdAt: now,
    expiresInSeconds: 1800,
    sourceRefs: [packet.sourceRef ?? row.source_ref ?? packet.packetKey].filter(Boolean) as string[],
    selectedEntities: [
      {
        lane: 'PACKET_IDENTITY',
        status: packet.postgres,
        summary: `Packet ${packet.packetKey} selected for bounded repair/proof.`,
        sourceRefs: [packet.sourceRef ?? row.source_ref ?? packet.packetKey].filter(Boolean) as string[],
      },
      {
        lane: 'QDRANT_PAYLOAD',
        status: packet.qdrant,
        summary: 'Qdrant projection state for the selected packet.',
        sourceRefs: [packet.packetKey],
      },
      {
        lane: 'REDIS_VALUES',
        status: packet.redis,
        summary: 'Redis/Valkey packet cache state for the selected packet.',
        sourceRefs: [packet.packetKey],
      },
      {
        lane: 'ACE_CONTEXT',
        status: packet.ace,
        summary: 'ACE active-context state for the selected packet.',
        sourceRefs: [packet.packetKey],
      },
      {
        lane: 'HYPERRAG_RPC',
        status: packet.hyperrag,
        summary: 'HyperRAG packet RPC state for the selected packet.',
        sourceRefs: [packet.sourceRef ?? packet.packetKey].filter(Boolean) as string[],
      },
    ],
    laneStates: [
      { lane: 'POSTGRES', status: packet.postgres, reason: 'Postgres authority row', evidenceRefs: [packet.packetKey] },
      { lane: 'QDRANT', status: packet.qdrant, reason: 'Qdrant mirror state', evidenceRefs: [packet.packetKey] },
      { lane: 'REDIS', status: packet.redis, reason: 'Redis/Valkey cache state', evidenceRefs: [packet.packetKey] },
      { lane: 'ACE', status: packet.ace, reason: 'ACE persistence state', evidenceRefs: [packet.packetKey] },
      { lane: 'HYPERRAG', status: packet.hyperrag, reason: 'HyperRAG projection state', evidenceRefs: [packet.packetKey] },
    ],
    violations: [
      packet.qdrant !== 'PRESENT' ? { code: 'QDRANT_REPAIR_PENDING', lane: 'QDRANT', severity: 'WARN' as const, detail: 'Qdrant projection still needs one bounded packet repair.' } : null,
      packet.redis !== 'PRESENT' ? { code: 'REDIS_REPAIR_PENDING', lane: 'REDIS', severity: 'WARN' as const, detail: 'Redis/Valkey cache still needs one bounded packet repair.' } : null,
      packet.ace !== 'PRESENT' ? { code: 'ACE_REPAIR_PENDING', lane: 'ACE', severity: 'WARN' as const, detail: 'ACE packet still needs one bounded packet repair.' } : null,
      packet.hyperrag !== 'PRESENT' ? { code: 'HYPERRAG_REPAIR_PENDING', lane: 'HYPERRAG', severity: 'WARN' as const, detail: 'HyperRAG projection still needs refresh or validation.' } : null,
    ].filter(Boolean),
    nextSteps: [
      {
        taskId: 'repair-one-packet',
        title: `Repair the selected packet ${packet.packetKey}`,
        priority: 'CRITICAL' as const,
        sourceRefs: [packet.packetKey],
        validationCommands: [`npx tsx scripts/atlas/phase108d-single-packet-proof.mts ${packet.packetKey}`],
        blockedBy: packet.qdrant === 'PRESENT' && packet.redis === 'PRESENT' && packet.ace === 'PRESENT' && packet.hyperrag === 'PRESENT'
          ? []
          : ['MISSING_PROJECTION'],
      },
    ],
    signalSummary: {
      summary: `Phase 108D packet selection resume for ${packet.packetKey}`,
      pagerank: null,
      lexical: [packet.sourceRef ?? packet.packetKey].filter(Boolean) as string[],
      centroid: null,
      reranker: 'mixedbread',
      langextract: 'miniforge-sidecar',
      graph: { communityId: null, topology: 'phase108d-selector' },
    },
    memorySwap: {
      cacheKey: `ace:packet:${packet.packetKey}`,
      aliasKey: `bifrost:packet:${packet.packetKey}`,
      packetKey: packet.packetKey,
      packetKind: 'ace.packet.selection',
      source: 'redis-valkey' as const,
    },
    tokenBudget: 3000,
    safeguards: {
      authoritative: false as const,
      mayPromoteAuditStatus: false as const,
      requiresLiveValidation: true as const,
    },
  };
}

function mapProofGateStatus(status: ProofGateResult['status']): ProofState {
  if (status === 'CROSS_STORE_PROVEN') return 'FULLY_PROVEN';
  if (status === 'PARTIAL_PROVEN') return 'PARTIAL_PROVEN';
  return 'NOT_PROVEN';
}

function determineExitCode(result: PacketSelectionResult, proofGateStatus?: ProofGateResult['status']): number {
  if (!result.selectedPacket) return 3;
  if (result.blockers.some((blocker) => /UNAVAILABLE|AUTH_REQUIRED/.test(blocker))) return 6;
  if (result.repairRequested && result.blockers.some((blocker) => /SCHEMA_MISMATCH/.test(blocker))) return 7;
  if (result.repairRequested && result.repairActions.some((action) => action.executed && action.result === 'FAIL')) return 4;
  if (proofGateStatus === 'CROSS_STORE_PROVEN') return 0;
  if (proofGateStatus === 'PARTIAL_PROVEN') return 2;
  if (result.proofState === 'PARTIAL_PROVEN' || result.proofState === 'NOT_PROVEN') return 2;
  if (result.proofState === 'FAILED') return 5;
  return 2;
}

async function runProofGate(packetKey: string): Promise<{ exitCode: number; stdout: string; stderr: string; result: ProofGateResult | null; }> {
  const proc = spawnSync(process.execPath, [TSX_CLI, PROOF_SCRIPT, packetKey], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: 30000,
    cwd: REPO_ROOT,
  });

  let parsed: ProofGateResult | null = null;
  try {
    if (existsSync(PROOF_RESULT_PATH)) {
      const raw = readFileSync(PROOF_RESULT_PATH, 'utf8');
      const candidate = JSON.parse(raw) as ProofGateResult;
      if (candidate && candidate.packetKey === packetKey) {
        parsed = candidate;
      }
    } else if (proc.stdout?.trim()) {
      parsed = JSON.parse(proc.stdout.trim()) as ProofGateResult;
    }
  } catch {
    parsed = null;
  }

  return {
    exitCode: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
    result: parsed,
  };
}

function buildMarkdownReport(result: PacketSelectionResult): string {
  const packet = result.selectedPacket;
  const lines: string[] = [];
  lines.push('# Phase 108D Packet Selection');
  lines.push('');
  lines.push(`- run id: ${result.runId}`);
  lines.push(`- schema version: ${result.schemaVersion}`);
  lines.push(`- started at: ${result.startedAt}`);
  lines.push(`- completed at: ${result.completedAt}`);
  lines.push(`- proof state: ${result.proofState}`);
  lines.push(`- repair requested: ${result.repairRequested ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('## Selected Packet');
  lines.push('');
  if (packet) {
    lines.push(`- packet key: ${packet.packetKey}`);
    lines.push(`- packet version: ${packet.packetVersion ?? 'n/a'}`);
    lines.push(`- repository id: ${packet.repositoryId ?? 'n/a'}`);
    lines.push(`- workspace revision: ${packet.workspaceRevision ?? 'n/a'}`);
    lines.push(`- source ref: ${packet.sourceRef ?? 'n/a'}`);
    lines.push(`- content hash: ${packet.contentHash ?? 'n/a'}`);
    lines.push(`- coverage score: ${packet.coverageScore}`);
  } else {
    lines.push('- none');
  }
  lines.push('');
  lines.push('## Store Coverage');
  lines.push('');
  if (packet) {
    lines.push(`- postgres: ${packet.postgres}`);
    lines.push(`- qdrant: ${packet.qdrant}`);
    lines.push(`- redis: ${packet.redis}`);
    lines.push(`- ace: ${packet.ace}`);
    lines.push(`- hyperrag: ${packet.hyperrag}`);
  }
  lines.push('');
  lines.push('## Selection');
  lines.push('');
  lines.push(`- reason: ${result.selectionReason}`);
  lines.push(`- candidates checked: ${result.candidatesChecked}`);
  lines.push('');
  lines.push('## Repair Actions');
  lines.push('');
  for (const action of result.repairActions) {
    lines.push(`- [${action.executed ? action.result ?? 'PASS' : 'SKIPPED'}] ${action.store}: ${action.action}`);
    lines.push(`  - owner: ${action.owner}`);
    lines.push(`  - validation: ${action.validationCommand}`);
    lines.push(`  - expected: ${action.expectedArtifact}`);
  }
  lines.push('');
  lines.push('## Proof');
  lines.push('');
  lines.push(`- command: ${result.proofCommand ?? 'n/a'}`);
  lines.push(`- proof artifact: ${result.proofArtifact ?? 'n/a'}`);
  lines.push(`- final proof state: ${result.proofState}`);
  lines.push(`- blockers: ${result.blockers.length ? result.blockers.join(', ') : 'none'}`);
  lines.push('');
  lines.push('## Diagnostics');
  lines.push('');
  lines.push(packet?.diagnostics.length ? packet.diagnostics.map((entry) => `- ${entry}`).join('\n') : '- none');
  return lines.join('\n');
}

export async function runPhase108dSelectAndProvePacket(cliArgs: Partial<CliArgs> = {}): Promise<{
  result: PacketSelectionResult;
  proofGate: ProofGateResult | null;
  exitCode: number;
}> {
  const startedAt = new Date().toISOString();
  const runId = `phase108d-${crypto.randomUUID().slice(0, 8)}`;
  const env = loadRepoEnv(process.env);
  const pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(env),
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 1000,
  });

  const limit = Number.isFinite(cliArgs.limit ?? Number.NaN) ? Number(cliArgs.limit) : DEFAULT_LIMIT;
  const packetKeyArg = normalizeText(cliArgs.packetKey);
  const workspaceArg = normalizeText(cliArgs.workspace);
  const repairRequested = Boolean(cliArgs.repair);
  const verbose = Boolean(cliArgs.verbose);
  const jsonMode = Boolean(cliArgs.json);
  const repairActions: RepairAction[] = [];
  const blockers: string[] = [];
  let selectedPacket: PacketCoverage | null = null;
  let selectionReason = '';
  let proofGate: ProofGateResult | null = null;
  let proofCommand: string | undefined;
  let proofState: ProofState = 'NOT_PROVEN';
  let proofArtifact: string | undefined;
  let candidatesChecked = 0;

  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(MD_DIR, { recursive: true });

  try {
    const rows = packetKeyArg
      ? await pool.query(
          `SELECT *
             FROM atlas_packets
            WHERE packet_key = ANY($1::text[])
            LIMIT $2`,
          [packetKeyVariants(packetKeyArg), limit],
        )
      : await pool.query(
          `SELECT ${(
            [
              'packet_key',
              'source_ref',
              'feature_id',
              'packet_version',
              'repository_id',
              'workspace_id',
              'workspace_revision',
              'lineage_version',
              'git_commit',
              'content_hash',
              'artifact_content_hash',
              'sha256',
              'packet_id',
              'qdrant_point_id',
              'qdrant_collection',
              'evidence_state',
              'status',
              'identity_lane',
              'canonical',
              'updated_at',
              'created_at',
              'redis_centroid_key',
              'metadata',
              'payload',
              'vectors',
              'topology',
            ]
          ).join(', ')}
             FROM atlas_packets
            WHERE packet_key IS NOT NULL
              AND source_ref IS NOT NULL
            ORDER BY ${getOrderClause(await getTableColumns(pool, 'atlas_packets'))}
            LIMIT $1`,
          [limit],
        );

    const candidates = (rows.rows as AtlasPacketRow[])
      .filter((row) => matchesWorkspaceFilter(row, workspaceArg))
      .map((row) => ({ row, coverage: buildCoverageFromRow(row) }));

    candidatesChecked = candidates.length;

    if (packetKeyArg && candidates.length === 0) {
      selectionReason = `Explicit packet not found in authoritative Postgres: ${packetKeyArg}`;
      const result: PacketSelectionResult = {
        schemaVersion: 'phase108d-packet-selection.v1',
        runId,
        selectedPacket: null,
        candidatesChecked: 0,
        selectionReason,
        repairRequested,
        repairActions,
        proofState: 'NOT_PROVEN',
        blockers: ['NO_AUTHORITATIVE_PACKET'],
        startedAt,
        completedAt: new Date().toISOString(),
      };
      const jsonPath = resolve(OUT_DIR, `packet-selection-${runId}.json`);
      writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
      writeFileSync(MD_PATH, buildMarkdownReport(result));
      return { result, proofGate: null, exitCode: 3 };
    }

    if (candidates.length > 0) {
      const scanCandidates = packetKeyArg
        ? candidates
        : candidates
          .slice()
          .sort((a, b) => scorePostgresHint(b.row) - scorePostgresHint(a.row))
          .slice(0, Math.min(10, candidates.length));

      const scored: Array<{ row: AtlasPacketRow; coverage: PacketCoverage }> = [];
      for (const { row, coverage } of scanCandidates) {
        const qdrant = await probeQdrantPacket(coverage, row);
        coverage.qdrant = qdrant;

        const redisProbe = await probeRedisPacket(coverage);
        coverage.redis = redisProbe.state;

        const aceProbe = await probeAcePacket(coverage);
        coverage.ace = aceProbe.state;

        coverage.coverageScore = computeCoverageScore(coverage);
        if (packetKeyArg) {
          coverage.hyperrag = await probeHyperRagPacket(coverage);
          coverage.coverageScore = computeCoverageScore(coverage);
        }
        scored.push({ row, coverage });
        if (verbose) {
          console.log(JSON.stringify({
            packetKey: coverage.packetKey,
            postgres: coverage.postgres,
            qdrant: coverage.qdrant,
            redis: coverage.redis,
            ace: coverage.ace,
            hyperrag: coverage.hyperrag,
            coverageScore: coverage.coverageScore,
          }));
        }
      }

      if (!packetKeyArg && scored.length > 0) {
        const provisional = scored
          .map((entry) => entry.coverage)
          .slice()
          .sort(compareCoverage)
          .slice(0, Math.min(5, scored.length));

        for (const coverage of provisional) {
          if (coverage.hyperrag !== 'PRESENT') {
            coverage.hyperrag = await probeHyperRagPacket(coverage);
            coverage.coverageScore = computeCoverageScore(coverage);
          }
        }
      }

      const selected = selectPacketCoverage(scored.map((entry) => entry.coverage), packetKeyArg ?? undefined);
      selectedPacket = selected.selectedPacket;
      selectionReason = selected.selectionReason;
    }

    if (!selectedPacket) {
      const result: PacketSelectionResult = {
        schemaVersion: 'phase108d-packet-selection.v1',
        runId,
        selectedPacket: null,
        candidatesChecked,
        selectionReason: selectionReason || 'No eligible packet found',
        repairRequested,
        repairActions,
        proofState: 'NOT_PROVEN',
        blockers: ['NO_ELIGIBLE_PACKET'],
        startedAt,
        completedAt: new Date().toISOString(),
      };
      const jsonPath = resolve(OUT_DIR, `packet-selection-${runId}.json`);
      writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
      writeFileSync(MD_PATH, buildMarkdownReport(result));
      return { result, proofGate: null, exitCode: 3 };
    }

    const row = (candidates.find((candidate) => candidate.coverage.packetKey === selectedPacket!.packetKey)?.row) ?? null;
    const repairPlan = row ? buildRepairActions(selectedPacket, row) : [];
    repairActions.push(...repairPlan);

    const needsRealEmbedding = selectedPacket.qdrant !== 'PRESENT' && (!row || !isValidEmbeddingArtifact(row));
    if (needsRealEmbedding) {
      blockers.push('REAL_EMBEDDING_REQUIRED');
      const qdrantAction = repairActions.find((action) => action.store === 'QDRANT');
      if (qdrantAction) qdrantAction.result = 'SKIPPED';
    }

    if (repairRequested && row) {
      const qdrantAction = repairActions.find((action) => action.store === 'QDRANT');
      if (qdrantAction && !needsRealEmbedding) {
        try {
          const vector = parseVector(row.content_embedding_384 ?? row.embedding_384 ?? row.embedding ?? row.content_embedding_768);
          const collection = normalizeText(row.qdrant_collection) ?? (vector.length === 768 ? 'codebase_chunks_768' : 'codebase_chunks_384');
          const pointId = normalizeText(row.qdrant_point_id) ?? crypto.createHash('sha1').update(selectedPacket.packetKey).digest('hex').slice(0, 32);
          const producerModel =
            normalizeText(row.metadata?.producer_model)
            ?? normalizeText(row.metadata?.embedding_model)
            ?? normalizeText(row.metadata?.model_id)
            ?? normalizeText(row.payload?.producer_model)
            ?? normalizeText(row.payload?.embedding_model)
            ?? normalizeText(row.payload?.model_id);
          const producerVersion =
            normalizeText(row.metadata?.producer_version)
            ?? normalizeText(row.metadata?.embedding_version)
            ?? normalizeText(row.metadata?.model_version)
            ?? normalizeText(row.payload?.producer_version)
            ?? normalizeText(row.payload?.embedding_version)
            ?? normalizeText(row.payload?.model_version);
          const representationName = vector.length === 768 ? 'dense_768' : 'dense_384';
          const payload = {
            packet_key: selectedPacket.packetKey,
            source_ref: selectedPacket.sourceRef,
            content_hash: selectedPacket.contentHash,
            workspace_revision: selectedPacket.workspaceRevision,
            feature_id: normalizeText(row.feature_id),
            repository_id: selectedPacket.repositoryId,
            representation_id: normalizeText(row.qdrant_point_id) ?? `${representationName}:${selectedPacket.packetKey}`,
            representation_name: representationName,
            producer_model: producerModel ?? 'unknown',
            producer_version: producerVersion ?? 'unknown',
            dimensions: vector.length,
            normalization: 'l2',
          };

          if (vector.length === 0 || isConstantVector(vector)) {
            blockers.push('REAL_EMBEDDING_REQUIRED');
            qdrantAction.result = 'SKIPPED';
          } else {
            const response = await fetch(`${(process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '')}/collections/${encodeURIComponent(collection)}/points?wait=true`, {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                points: [
                  {
                    id: pointId,
                    vector: { content: vector },
                    payload,
                  },
                ],
              }),
              signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) {
              qdrantAction.result = 'FAIL';
              blockers.push(`QDRANT_REPAIR_FAILED_${response.status}`);
            } else {
              qdrantAction.executed = true;
              qdrantAction.result = 'PASS';
            }
          }
        } catch (error) {
          qdrantAction.executed = true;
          qdrantAction.result = 'FAIL';
          blockers.push(`QDRANT_REPAIR_FAILED_${String(error instanceof Error ? error.message : error)}`);
        }
      }

      const redisAction = repairActions.find((action) => action.store === 'REDIS');
      const aceAction = repairActions.find((action) => action.store === 'ACE');
      if (redisAction && aceAction) {
        const client = createClient({
          url: resolveRedisUrl(env),
          socket: { connectTimeout: 3000, reconnectStrategy: () => false },
        });
        client.on('error', () => {});
        try {
          await client.connect();
          const packetJson = buildRepairPacket(selectedPacket, row);
          const serialized = JSON.stringify(packetJson);
          const packetCacheKey = `ace:packet:${selectedPacket.packetKey}`;
          const aliasKey = `bifrost:packet:${selectedPacket.packetKey}`;
          await client.set(packetCacheKey, serialized, { EX: 1800 });
          await client.set(aliasKey, serialized, { EX: 1800 });
          await client.set('ace:packet:latest', selectedPacket.packetKey, { EX: 1800 });
          await client.set('bifrost:packet:latest', selectedPacket.packetKey, { EX: 1800 });
          redisAction.executed = true;
          redisAction.result = 'PASS';
          aceAction.executed = true;
          aceAction.result = 'PASS';
        } catch (error) {
          const text = String(error instanceof Error ? error.message : error);
          redisAction.executed = true;
          aceAction.executed = true;
          if (/auth|password|denied/i.test(text)) {
            redisAction.result = 'FAIL';
            aceAction.result = 'FAIL';
            blockers.push('REDIS_AUTH_REQUIRED');
          } else {
            redisAction.result = 'FAIL';
            aceAction.result = 'FAIL';
            blockers.push(`REDIS_ACE_REPAIR_FAILED_${text}`);
          }
        } finally {
          await client.quit().catch(() => {});
        }
      }
    }

    const proofCommandValue = `npx tsx scripts/atlas/phase108d-single-packet-proof.mts ${selectedPacket.packetKey}`;
    proofCommand = proofCommandValue;
    const proof = await runProofGate(selectedPacket.packetKey);
    proofGate = proof.result;
    proofArtifact = PROOF_RESULT_PATH;
    proofState = mapProofGateStatus(proof.result?.status ?? 'NOT_PROVEN');

    const result: PacketSelectionResult = {
      schemaVersion: 'phase108d-packet-selection.v1',
      runId,
      selectedPacket,
      candidatesChecked,
      selectionReason,
      repairRequested,
      repairActions,
      proofCommand,
      proofState,
      proofArtifact,
      blockers,
      startedAt,
      completedAt: new Date().toISOString(),
    };

    const jsonPath = resolve(OUT_DIR, `packet-selection-${runId}.json`);
    writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
    writeFileSync(MD_PATH, buildMarkdownReport(result));

    const exitCode = determineExitCode(result, proof.result?.status);
    if (!jsonMode) {
      console.log(JSON.stringify({
        runId,
        selectedPacket: selectedPacket?.packetKey ?? null,
        selectionReason,
        proofState,
        proofCommand,
        proofArtifact,
        blockers,
        exitCode,
        repairRequested,
      }, null, 2));
    }

    return { result, proofGate, exitCode };
  } catch (error) {
    const result: PacketSelectionResult = {
      schemaVersion: 'phase108d-packet-selection.v1',
      runId,
      selectedPacket,
      candidatesChecked,
      selectionReason: selectionReason || 'FAILED',
      repairRequested,
      repairActions,
      proofCommand,
      proofState: 'FAILED',
      proofArtifact,
      blockers: [...blockers, String(error instanceof Error ? error.message : error)],
      startedAt,
      completedAt: new Date().toISOString(),
    };
    const jsonPath = resolve(OUT_DIR, `packet-selection-${runId}.json`);
    writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
    writeFileSync(MD_PATH, buildMarkdownReport(result));
    return { result, proofGate, exitCode: 5 };
  } finally {
    await pool.end().catch(() => {});
  }
}

function parseCliArgs(argv = process.argv.slice(2)): CliArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      'packet-key': { type: 'string' },
      limit: { type: 'string' },
      workspace: { type: 'string' },
      json: { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
      repair: { type: 'boolean', default: false },
    },
    strict: false,
    allowPositionals: true,
  });

  return {
    packetKey: normalizeText(values['packet-key']),
    limit: Number.parseInt(String(values.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
    workspace: normalizeText(values.workspace) ?? undefined,
    json: Boolean(values.json),
    verbose: Boolean(values.verbose),
    repair: Boolean(values.repair),
  };
}

async function main(): Promise<void> {
  const cli = parseCliArgs();
  const { result, exitCode } = await runPhase108dSelectAndProvePacket(cli);
  if (cli.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(buildMarkdownReport(result));
  }
  process.exit(exitCode);
}

const isMain = resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export {
  buildMarkdownReport,
  buildCoverageFromRow,
  buildRepairActions,
  buildRepairPacket,
  computeCoverageScore,
  determineExitCode,
  fetchCandidates,
  getOrderClause,
  isConstantVector,
  isCanonicalAcePacketPayload,
  isValidEmbeddingArtifact,
  mapProofGateStatus,
  parseCliArgs,
  parseVector,
  probeAcePacket,
  probeHyperRagPacket,
  probeQdrantPacket,
  probeRedisPacket,
  resolveContentHash,
  resolveRepositoryId,
  resolveWorkspaceRevision,
  selectPacketCoverage,
};
