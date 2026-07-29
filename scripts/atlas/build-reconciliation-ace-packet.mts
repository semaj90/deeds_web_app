#!/usr/bin/env tsx

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createClient } from 'redis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const REPORT_DIR = join(REPO_ROOT, 'reports', 'semantic-contracts');
const IDENTITY_MAP_PATH = join(REPO_ROOT, 'reports', 'semantic-contracts', 'semantic-contract-identity-map.json');
const RECONCILIATION_REPORT_PATH = join(REPO_ROOT, 'reports', 'semantic-contracts', 'semantic-contract-reconciliation.json');

const REDIS_URL = process.env.VALKEY_URL ?? process.env.REDIS_URL ?? 'redis://:redis@127.0.0.1:6379';
const TTL_SECONDS = Number(process.env.ACE_PACKET_TTL_SECONDS ?? '1800');
const WORKSPACE_REVISION = (
  process.env.WORKSPACE_REVISION
  ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
);
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? 'deeds-web-app';

type LaneStatus =
  | 'ABSENT'
  | 'PRESENT'
  | 'STATICALLY_REFERENCED'
  | 'FIXTURE_PROVEN'
  | 'RUNTIME_SMOKE_PROVEN'
  | 'PARTIAL_PROVEN'
  | 'CROSS_STORE_PROVEN'
  | 'CONFLICTING'
  | 'BLOCKED'
  | 'NOT_PROVEN';

interface LaneAuditEntry {
  lane: string;
  status: LaneStatus;
  evidence?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface ReconciliationReport {
  timestamp?: string;
  lane_audits?: Record<string, LaneAuditEntry>;
  identity_map?: Record<string, unknown>;
}

interface SelectedEntity {
  lane: string;
  status: LaneStatus;
  summary: string;
  sourceRefs: string[];
}

interface LaneState {
  lane: string;
  status: LaneStatus;
  reason: string;
  evidenceRefs: string[];
}

interface Violation {
  code: string;
  lane: string;
  severity: 'INFO' | 'WARN' | 'BLOCK';
  detail: string;
}

interface ReconciliationAcePacketV1 {
  schemaVersion: '1.0.0';
  packetKind: 'ace.reconciliation.context';
  acePacketId: string;
  runId: string;
  workspaceId: string;
  workspaceRevision: string;
  objective: string;
  createdAt: string;
  expiresInSeconds: number;
  sourceArtifact: {
    sourceRef: string;
    sha256: string;
    rowCount: number;
  };
  sourceRefs: string[];
  selectedEntities: SelectedEntity[];
  laneStates: LaneState[];
  violations: Violation[];
  nextSteps: Array<{
    taskId: string;
    title: string;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    sourceRefs: string[];
    validationCommands: string[];
    blockedBy: string[];
  }>;
  signalSummary: {
    summary: string;
    pagerank: number | null;
    lexical: string[];
    centroid: string | number[] | null;
    reranker: string | null;
    langextract: string | null;
    graph: {
      communityId: string | null;
      topology: string | null;
    };
  };
  memorySwap: {
    cacheKey: string;
    aliasKey: string;
    packetKey: string;
    packetKind: string;
    source: 'redis-valkey';
  };
  tokenBudget: number;
  safeguards: {
    authoritative: false;
    mayPromoteAuditStatus: false;
    requiresLiveValidation: true;
  };
}

function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function loadJson<T>(text: string): T {
  return JSON.parse(text) as T;
}

function statusToSeverity(status: LaneStatus): 'INFO' | 'WARN' | 'BLOCK' {
  if (status === 'PRESENT') return 'INFO';
  if (status === 'STATICALLY_REFERENCED' || status === 'PARTIAL_PROVEN') return 'WARN';
  return 'BLOCK';
}

function makeReason(status: LaneStatus): string {
  switch (status) {
    case 'PRESENT':
      return 'Lane exists in the repository but is not live-proven here.';
    case 'STATICALLY_REFERENCED':
      return 'Lane is referenced in code or docs but not live-proven.';
    case 'PARTIAL_PROVEN':
      return 'Lane has partial runtime evidence but not cross-store proof.';
    case 'FIXTURE_PROVEN':
      return 'Lane is proven only by fixture or harness output.';
    case 'RUNTIME_SMOKE_PROVEN':
      return 'Lane passed a runtime smoke check but not cross-store parity.';
    case 'CROSS_STORE_PROVEN':
      return 'Lane is proven across the required stores.';
    case 'CONFLICTING':
      return 'Lane has contradictory identity or naming evidence.';
    case 'BLOCKED':
      return 'Lane is blocked by a declared dependency.';
    case 'ABSENT':
    default:
      return 'Lane has no evidence in the current reconciliation snapshot.';
  }
}

function buildSelectedEntities(lanes: LaneAuditEntry[]): SelectedEntity[] {
  const priorityOrder = ['CONFLICTING', 'ABSENT', 'STATICALLY_REFERENCED', 'PARTIAL_PROVEN', 'PRESENT'] as const;
  const ranked = lanes
    .slice()
    .sort((a, b) => priorityOrder.indexOf(a.status as (typeof priorityOrder)[number]) - priorityOrder.indexOf(b.status as (typeof priorityOrder)[number]));

  return ranked.slice(0, 5).map((lane) => ({
    lane: lane.lane,
    status: lane.status,
    summary: makeReason(lane.status),
    sourceRefs: [`reports/semantic-contracts/semantic-contract-reconciliation.json#${lane.lane}`],
  }));
}

function buildLaneStates(lanes: LaneAuditEntry[]): LaneState[] {
  return lanes.map((lane) => ({
    lane: lane.lane,
    status: lane.status,
    reason: makeReason(lane.status),
    evidenceRefs: Array.isArray(lane.evidence)
      ? lane.evidence
          .map((entry) => entry.validationResultId)
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
      : [],
  }));
}

function buildViolations(lanes: LaneAuditEntry[]): Violation[] {
  return lanes
    .filter((lane) => lane.status !== 'PRESENT')
    .map((lane) => ({
      code: `LANE_${lane.lane.toUpperCase()}`,
      lane: lane.lane,
      severity: statusToSeverity(lane.status),
      detail: makeReason(lane.status),
    }));
}

function buildSignalSummary(lanes: LaneAuditEntry[]): ReconciliationAcePacketV1['signalSummary'] {
  const laneNames = lanes.map((lane) => lane.lane).filter(Boolean);
  const statusNames = lanes.map((lane) => `${lane.lane}:${lane.status}`).filter(Boolean);
  return {
    summary: `Reconciliation packet covering ${laneNames.length} lanes: ${statusNames.slice(0, 6).join(', ')}`,
    pagerank: null,
    lexical: laneNames.slice(0, 12),
    centroid: null,
    reranker: 'mixedbread|phase18_reranker|langextract-grpo',
    langextract: 'miniforge-sidecar',
    graph: {
      communityId: null,
      topology: 'reconciliation-snapshot',
    },
  };
}

async function main(): Promise<void> {
  if (!Number.isFinite(TTL_SECONDS) || TTL_SECONDS < 60) {
    throw new Error('ACE_PACKET_TTL_SECONDS must be a number >= 60');
  }

  const identityRaw = await readFile(IDENTITY_MAP_PATH, 'utf8');
  const reconciliationRaw = await readFile(RECONCILIATION_REPORT_PATH, 'utf8');
  const identityMap = loadJson<Record<string, unknown>>(identityRaw);
  const report = loadJson<ReconciliationReport>(reconciliationRaw);
  const laneAudits = Object.values(report.lane_audits ?? {}) as LaneAuditEntry[];
  const createdAt = new Date().toISOString();
  const runId = `run_${randomUUID()}`;
  const acePacketId = `ace_${randomUUID()}`;
  const packetKey = `reconciliation:${WORKSPACE_REVISION.slice(0, 12)}`;
  const redisKey = `ace:packet:${packetKey}`;
  const redisAliasKey = `bifrost:packet:${packetKey}`;

  const packet: ReconciliationAcePacketV1 = {
    schemaVersion: '1.0.0',
    packetKind: 'ace.reconciliation.context',
    acePacketId,
    runId,
    workspaceId: WORKSPACE_ID,
    workspaceRevision: WORKSPACE_REVISION,
    objective: 'Resume reconciliation from bounded evidence without rereading the full audit.',
    createdAt,
    expiresInSeconds: TTL_SECONDS,
    sourceArtifact: {
      sourceRef: 'reports/semantic-contracts/semantic-contract-identity-map.json',
      sha256: sha256(identityRaw),
      rowCount: 1,
    },
    sourceRefs: [
      'reports/semantic-contracts/semantic-contract-identity-map.json',
      'reports/semantic-contracts/semantic-contract-reconciliation.json',
    ],
    selectedEntities: buildSelectedEntities(laneAudits),
    laneStates: buildLaneStates(laneAudits),
    violations: buildViolations(laneAudits),
    nextSteps: [
      {
        taskId: 'prove-one-entity',
        title: 'Run one bounded cross-store entity trace',
        priority: 'CRITICAL',
        sourceRefs: [
          'reports/semantic-contracts/semantic-contract-reconciliation.json',
          'reports/semantic-contracts/semantic-contract-identity-map.json',
        ],
        validationCommands: [
          'node scripts/atlas/phase108d-single-packet-proof.mts',
        ],
        blockedBy: [
          'CONTENT_HASH_MISSING',
          'QDRANT_POINT_ID_MISSING',
          'PACKET_VALIDATION_ABSENT',
        ],
      },
      {
        taskId: 'validate-claims',
        title: 'Require tool evidence before status promotion',
        priority: 'HIGH',
        sourceRefs: [
          'scripts/atlas/reconcile-semantic-contracts.mjs',
        ],
        validationCommands: [
          'node scripts/atlas/reconcile-semantic-contracts.mjs',
        ],
        blockedBy: [
          'STATICALLY_REFERENCED',
          'CONFLICTING',
        ],
      },
    ],
    signalSummary: buildSignalSummary(laneAudits),
    memorySwap: {
      cacheKey: redisKey,
      aliasKey: redisAliasKey,
      packetKey,
      packetKind: 'ace.reconciliation.context',
      source: 'redis-valkey',
    },
    tokenBudget: 3000,
    safeguards: {
      authoritative: false,
      mayPromoteAuditStatus: false,
      requiresLiveValidation: true,
    },
  };

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(join(REPORT_DIR, 'reconciliation-ace-packet.json'), JSON.stringify(packet, null, 2));

  const redis = createClient({ url: REDIS_URL });
  redis.on('error', () => {});
  await redis.connect();

  try {
    const serialized = JSON.stringify(packet);
    await redis.set(redisKey, serialized, { EX: TTL_SECONDS });
    await redis.set(redisAliasKey, serialized, { EX: TTL_SECONDS });
    await redis.set('ace:packet:latest:reconciliation', redisKey, { EX: TTL_SECONDS });
    await redis.set('bifrost:packet:latest:reconciliation', redisKey, { EX: TTL_SECONDS });

    console.log(
      JSON.stringify({
        ok: true,
        packetKey,
        redisKey,
        redisAliasKey,
        acePacketId,
        runId,
        workspaceRevision: WORKSPACE_REVISION,
        ttlSeconds: TTL_SECONDS,
        selectedEntityCount: packet.selectedEntities.length,
        violationCount: packet.violations.length,
        sourceRefs: packet.sourceRefs,
      }, null, 2),
    );
  } finally {
    await redis.quit();
  }
}

main().catch((error) => {
  console.error('[build-reconciliation-ace-packet] FAILED:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
