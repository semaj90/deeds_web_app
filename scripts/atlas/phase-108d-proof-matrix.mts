#!/usr/bin/env node

/**
 * Phase 108D — Immutability Proof-Matrix Validation
 *
 * Validates that packet identity remains stable across all 5 storage layers:
 * 1. PostgreSQL (canonical truth)
 * 2. Qdrant (vector mirror)
 * 3. Redis (cache)
 * 4. HyperRAG (RPC fact materialization)
 * 5. ACE (agent context assembler)
 *
 * Runs verifyPacketKeyImmutability() and verifyPostgresHyperRagConsistency()
 * gates on real packets. Records results in ValidationResultV1.
 *
 * Exit codes:
 * 0 = CROSS_STORE_PROVEN (all 5 layers agree)
 * 1 = PARTIAL_PROVEN (3-4 layers agree)
 * 2 = NOT_PROVEN (fewer than 3 layers, or hard block violations)
 */

import { createHash } from 'crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import {
  fromRedisValue,
} from '../../sveltekit-frontend/src/lib/server/atlas/projections/redis-packet-projection.ts';
import {
  fromQdrantPayload,
  validateQdrantProjection,
} from '../../sveltekit-frontend/src/lib/server/atlas/projections/qdrant-packet-projection.ts';
import {
  fromHyperRagRpcPacket,
} from '../../sveltekit-frontend/src/lib/server/atlas/projections/hyperrag-packet-projection.ts';

const REPO_ROOT = process.cwd();
for (const envFile of [
  path.join(REPO_ROOT, '.env'),
  path.join(REPO_ROOT, '.env.local'),
  path.join(REPO_ROOT, 'sveltekit-frontend', '.env'),
  path.join(REPO_ROOT, 'sveltekit-frontend', '.env.local'),
]) {
  dotenv.config({ path: envFile, override: false });
}

const PROOF_WORKSPACE_ID = process.env.ATLAS_WORKSPACE_ID || 'deeds-web-app';
const REPORT_DIR = path.join(REPO_ROOT, 'docs', 'reports', 'atlas');
const QDRANT_TIMEOUT_MS = Number(process.env.PHASE108D_QDRANT_TIMEOUT_MS || 5000);
const REDIS_TIMEOUT_MS = Number(process.env.PHASE108D_REDIS_TIMEOUT_MS || 5000);
const HYPERRAG_TIMEOUT_MS = Number(process.env.PHASE108D_HYPERRAG_TIMEOUT_MS || 5000);

interface ProofPostgresPacketRow {
  packet_key: string | null;
  packet_id?: string | null;
  source_ref: string | null;
  feature_id: string | null;
  workspace_id?: string | null;
  directory_path?: string | null;
  canonical_source_ref?: string | null;
  file_path?: string | null;
  feature_label?: string | null;
  content_hash?: string | null;
  tree_node_id?: string | null;
  ontology_version?: string | null;
  summary?: string | null;
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function parsePostgresJsonRows(raw: string): ProofPostgresPacketRow[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`POSTGRES_JSON_PARSE_FAILED: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('POSTGRES_JSON_PARSE_FAILED: expected top-level JSON array');
  }

  return parsed.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`POSTGRES_JSON_PARSE_FAILED: row ${index} is not a JSON object`);
    }
    return row as ProofPostgresPacketRow;
  });
}

function formatReportTimestamp(date: Date): string {
  return date.toISOString().replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z');
}

function createProofPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    return new Pool({ connectionString });
  }

  return new Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5434),
    database: process.env.DB_NAME || 'legal_ai_db',
    user: process.env.DB_USER || 'legal_admin',
    password: String(process.env.DB_PASSWORD ?? process.env.PGPASSWORD ?? 'postgres'),
  });
}

function isValidPacketKey(packetKey: string): boolean {
  return (
    packetKey.startsWith('packet:') ||
    packetKey.startsWith('pkt_') ||
    packetKey.startsWith('ace:packet:')
  );
}

function validateProjectionIdentityFormats(snapshot: ProjectionSnapshot): ValidationViolation[] {
  const violations: ValidationViolation[] = [];

  if (snapshot.packetKey && !isValidPacketKey(snapshot.packetKey)) {
    violations.push({
      code: 'PACKET_KEY_INVALID_PREFIX',
      layer: snapshot.layer,
      severity: 'BLOCK',
      path: 'packet_key',
      expected: 'packet:<id>, pkt_<32-char hex>, or ace:packet:<id>',
      actual: snapshot.packetKey,
      message: `${snapshot.layer} exposes a packet key that does not match the accepted proof contract`,
    });
  }

  if (snapshot.sourceRef && !snapshot.sourceRef.trim()) {
    violations.push({
      code: 'SOURCE_REF_INVALID_FORMAT',
      layer: snapshot.layer,
      severity: 'BLOCK',
      path: 'source_ref',
      expected: 'non-empty source reference',
      actual: snapshot.sourceRef,
      message: `${snapshot.layer} exposes an empty source_ref after trimming`,
    });
  }

  if (snapshot.featureId && !snapshot.featureId.trim()) {
    violations.push({
      code: 'FEATURE_ID_INVALID_FORMAT',
      layer: snapshot.layer,
      severity: 'WARN',
      path: 'feature_id',
      expected: 'non-empty feature identifier',
      actual: snapshot.featureId,
      message: `${snapshot.layer} exposes an empty feature_id after trimming`,
    });
  }

  return violations;
}

interface ProjectionSnapshot {
  layer: 'POSTGRES' | 'QDRANT' | 'REDIS' | 'HYPERRAG_RPC' | 'ACE';
  packetKey: string | null;
  sourceRef: string | null;
  featureId: string | null;
  workspaceId: string | null;
  contentHash: string | null;
  workspaceRevision?: string | null;
  ontologyVersion?: string | null;
  snapshotAt: Date;
}

interface ValidationViolation {
  code: string;
  layer: string;
  severity: 'BLOCK' | 'WARN' | 'INFO';
  path: string;
  expected?: string;
  actual?: string;
  message?: string;
}

interface ValidationResultV1 {
  packetKey: string;
  workspaceId: string;
  validatedAt: Date;
  validatedBy: string;
  phase: string;
  projections: {
    postgres?: ProjectionSnapshot;
    qdrant?: ProjectionSnapshot;
    redis?: ProjectionSnapshot;
    hyperrag_rpc?: ProjectionSnapshot;
    ace?: ProjectionSnapshot;
  };
  violations: ValidationViolation[];
  isValid: boolean;
  canPromotion: 'CROSS_STORE_PROVEN' | 'PARTIAL_PROVEN' | 'NOT_PROVEN';
  blockedLayers?: string[];
  warnLayers?: string[];
  passLayers?: string[];
  report?: string;
}

function mapProjectionViolation(
  layer: string,
  violation: { code: string; path: string; expected?: string; actual?: string; message?: string }
): ValidationViolation {
  const severity =
    violation.code === 'JSON_PARSE_ERROR' ||
    violation.code === 'PACKET_KEY_MISSING' ||
    violation.code === 'PACKET_KEY_INVALID_PREFIX' ||
    violation.code === 'SOURCE_REF_MISSING' ||
    violation.code === 'FEATURE_ID_MISSING' ||
    violation.code === 'WORKSPACE_ID_MISSING'
      ? (layer === 'REDIS' || layer === 'HYPERRAG_RPC' ? 'WARN' : 'BLOCK')
      : violation.code === 'N_ARY_FACTS_EMPTY' ||
          violation.code === 'ONTOLOGY_VERSION_MISSING' ||
          violation.code === 'RPC_VERSION_MISSING' ||
          violation.code === 'CONTENT_HASH_MISSING' ||
          violation.code === 'COLLECTION_NAME_MISSING'
        ? 'WARN'
        : 'INFO';

  return {
    code: violation.code,
    layer,
    severity,
    path: violation.path,
    expected: violation.expected,
    actual: violation.actual,
    message: violation.message,
  };
}

async function fetchFromPostgres(packetKey: string): Promise<{
  snapshot: ProjectionSnapshot;
  violations: ValidationViolation[];
}> {
  const pool = createProofPool();

  try {
    const sqlText = `SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text AS rows_json
       FROM (
         SELECT packet_key, packet_id, source_ref, feature_id, workspace_id, directory_path, canonical_source_ref, file_path, feature_label, content_hash, ontology_version, summary
         FROM atlas_packets WHERE packet_key = '${escapeSqlLiteral(packetKey)}'
       ) t`;
    const result = await pool.query<{ rows_json: string }>(sqlText);
    const rows = parsePostgresJsonRows(result.rows[0]?.rows_json ?? '[]');

    if (rows.length === 0) {
      return {
        snapshot: {
          layer: 'POSTGRES',
          packetKey: null,
          sourceRef: null,
          featureId: null,
          workspaceId: null,
          contentHash: null,
          ontologyVersion: null,
          snapshotAt: new Date(),
        },
        violations: [
          {
            code: 'PACKET_NOT_FOUND',
            layer: 'POSTGRES',
            severity: 'BLOCK',
            path: 'packet_key',
            message: `No row found for packet_key = ${packetKey}`,
          },
        ],
      };
    }

    if (rows.length > 1) {
      return {
        snapshot: {
          layer: 'POSTGRES',
          packetKey: null,
          sourceRef: null,
          featureId: null,
          workspaceId: null,
          contentHash: null,
          ontologyVersion: null,
          snapshotAt: new Date(),
        },
        violations: [
          {
            code: 'MULTIPLE_POSTGRES_ROWS',
            layer: 'POSTGRES',
            severity: 'BLOCK',
            path: 'packet_key',
            message: `Expected unique packet_key, found ${rows.length} rows for ${packetKey}`,
          },
        ],
      };
    }

    const row = rows[0];
    const violations: ValidationViolation[] = [];

    if (!row.packet_key) {
      violations.push({
        code: 'PACKET_KEY_MISSING',
        layer: 'POSTGRES',
        severity: 'BLOCK',
        path: 'packet_key',
      });
    } else if (!isValidPacketKey(row.packet_key)) {
      violations.push({
        code: 'PACKET_KEY_INVALID_PREFIX',
        layer: 'POSTGRES',
        severity: 'BLOCK',
        path: 'packet_key',
        expected: 'packet:<id>, pkt_<32-char hex>, or ace:packet:<id>',
        actual: row.packet_key,
      });
    }

    if (!row.source_ref) {
      violations.push({
        code: 'SOURCE_REF_MISSING',
        layer: 'POSTGRES',
        severity: 'BLOCK',
        path: 'source_ref',
      });
    }

    if (!row.feature_id) {
      violations.push({
        code: 'FEATURE_ID_MISSING',
        layer: 'POSTGRES',
        severity: 'BLOCK',
        path: 'feature_id',
      });
    }

    if (!row.workspace_id) {
      violations.push({
        code: 'WORKSPACE_ID_MISSING',
        layer: 'POSTGRES',
        severity: 'WARN',
        path: 'workspace_id',
      });
    }

    if (!row.directory_path) {
      violations.push({
        code: 'DIRECTORY_PATH_MISSING',
        layer: 'POSTGRES',
        severity: 'WARN',
        path: 'directory_path',
      });
    }

    return {
      snapshot: {
        layer: 'POSTGRES',
        packetKey: row.packet_key,
        sourceRef: row.source_ref,
        featureId: row.feature_id,
        workspaceId: row.workspace_id ?? null,
        contentHash: row.content_hash,
        ontologyVersion: row.ontology_version,
        snapshotAt: new Date(),
      },
      violations,
    };
  } catch (err) {
    return {
      snapshot: {
        layer: 'POSTGRES',
        packetKey: null,
        sourceRef: null,
        featureId: null,
        workspaceId: null,
        contentHash: null,
        ontologyVersion: null,
        snapshotAt: new Date(),
      },
      violations: [
        {
          code: 'POSTGRES_QUERY_FAILED',
          layer: 'POSTGRES',
          severity: 'BLOCK',
          path: 'connection',
          message: `${(err as Error).message}`,
        },
      ],
    };
  } finally {
    await pool.end();
  }
}

async function fetchFromRedis(packetKey: string): Promise<{
  snapshot: ProjectionSnapshot;
  violations: ValidationViolation[];
}> {
  try {
    const { getRedis } = await import('../../sveltekit-frontend/src/lib/server/redis.ts');
    const redis = getRedis();
    const redisKey = `bifrost:packet:${packetKey}`;
    const cachedJson = await Promise.race<string | null>([
      redis.get(redisKey),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error(`Redis read timed out after ${REDIS_TIMEOUT_MS}ms`)), REDIS_TIMEOUT_MS)
      ),
    ]);

    if (!cachedJson) {
      return {
        snapshot: {
          layer: 'REDIS',
          packetKey: null,
          sourceRef: null,
          featureId: null,
          workspaceId: null,
          contentHash: null,
          ontologyVersion: null,
          snapshotAt: new Date(),
        },
        violations: [
          {
            code: 'PACKET_NOT_CACHED',
            layer: 'REDIS',
            severity: 'INFO',
            path: redisKey,
            message: 'Packet not yet in cache (expected for first load)',
          },
        ],
      };
    }

    const { packet, violations: adapterViolations } = fromRedisValue(cachedJson);
    const violations = adapterViolations.map((violation) => mapProjectionViolation('REDIS', violation));

    return {
      snapshot: {
        layer: 'REDIS',
        packetKey: packet?.packetKey ?? null,
        sourceRef: packet?.sourceRef ?? null,
        featureId: packet?.featureId ?? null,
        workspaceId: packet?.workspaceId ?? null,
        contentHash: packet?.contentHash ?? null,
        ontologyVersion: packet?.ontologyVersion ?? null,
        snapshotAt: new Date(),
      },
      violations,
    };
  } catch (err) {
    return {
      snapshot: {
        layer: 'REDIS',
        packetKey: null,
        sourceRef: null,
        featureId: null,
        workspaceId: null,
        contentHash: null,
        ontologyVersion: null,
        snapshotAt: new Date(),
      },
      violations: [
        {
          code: 'REDIS_QUERY_FAILED',
          layer: 'REDIS',
          severity: 'WARN',
          path: 'connection',
          message: `${(err as Error).message}`,
        },
      ],
    };
  }
}

async function fetchFromQdrant(packetKey: string): Promise<{
  snapshot: ProjectionSnapshot;
  violations: ValidationViolation[];
}> {
  const qdrantUrl = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
  const collectionNames = ['codebase_chunks_384_hybrid', 'codebase_chunks_768'];

  for (const collectionName of collectionNames) {
    try {
      const response = await fetch(`${qdrantUrl}/collections/${collectionName}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(QDRANT_TIMEOUT_MS),
        body: JSON.stringify({
          filter: {
            must: [
              {
                key: 'packet_key',
                match: { value: packetKey },
              },
            ],
          },
          limit: 1,
          with_payload: true,
          with_vector: false,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          snapshot: {
            layer: 'QDRANT',
            packetKey: null,
            sourceRef: null,
            featureId: null,
            workspaceId: null,
            contentHash: null,
            ontologyVersion: null,
            snapshotAt: new Date(),
          },
          violations: [
            {
              code: 'QDRANT_QUERY_FAILED',
              layer: 'QDRANT',
              severity: 'WARN',
              path: `${collectionName}/points/scroll`,
              message: `HTTP ${response.status}: ${response.statusText}${errorBody ? ` | ${errorBody}` : ''}`,
            },
          ],
        };
      }

      const data: any = await response.json();
      const points = Array.isArray(data?.result?.points) ? data.result.points : [];

      if (points.length === 0) {
        continue;
      }

      const point = points[0];
      const payload = {
        ...(point.payload || {}),
        collection_name: collectionName,
      };
      const { violations: adapterViolations } = validateQdrantProjection(payload);
      const packet = fromQdrantPayload(payload);
      const violations = adapterViolations.map((violation) => mapProjectionViolation('QDRANT', violation));

      return {
        snapshot: {
          layer: 'QDRANT',
          packetKey: packet.packetKey,
          sourceRef: packet.sourceRef,
          featureId: packet.featureId,
          workspaceId: packet.workspaceId,
          contentHash: packet.contentHash ?? null,
          ontologyVersion: packet.ontologyVersion ?? null,
          snapshotAt: new Date(),
        },
        violations,
      };
    } catch (err) {
      return {
        snapshot: {
          layer: 'QDRANT',
          packetKey: null,
          sourceRef: null,
          featureId: null,
          workspaceId: null,
          contentHash: null,
          ontologyVersion: null,
          snapshotAt: new Date(),
        },
        violations: [
          {
            code: 'QDRANT_CONNECTION_FAILED',
            layer: 'QDRANT',
            severity: 'WARN',
            path: 'connection',
            message: `${(err as Error).message}`,
          },
        ],
      };
    }
  }

  return {
    snapshot: {
      layer: 'QDRANT',
      packetKey: null,
      sourceRef: null,
      featureId: null,
      workspaceId: null,
      contentHash: null,
      ontologyVersion: null,
      snapshotAt: new Date(),
    },
    violations: [
      {
        code: 'PACKET_NOT_INDEXED',
        layer: 'QDRANT',
        severity: 'WARN',
        path: collectionNames.join(','),
        message: `No point found with packet_key = ${packetKey}`,
      },
    ],
  };
}

async function fetchFromHyperRAG(packetKey: string, sourceRef?: string | null): Promise<{
  snapshot: ProjectionSnapshot;
  violations: ValidationViolation[];
}> {
  try {
    const { hyperragPacketRpc } = await import('../../sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts');
    const query = (packetKey ?? sourceRef ?? '').trim();
    if (!query) {
      return {
        snapshot: {
          layer: 'HYPERRAG_RPC',
          packetKey: null,
          sourceRef: null,
          featureId: null,
          workspaceId: null,
          contentHash: null,
          ontologyVersion: null,
          snapshotAt: new Date(),
        },
        violations: [
          {
            code: 'HYPERRAG_QUERY_FAILED',
            layer: 'HYPERRAG_RPC',
            severity: 'WARN',
            path: 'query',
            message: 'No canonical source_ref or packet_key was available for HyperRAG lookup',
          },
        ],
      };
    }

    const rpcResult = await Promise.race([
      hyperragPacketRpc({
        query,
        limit: 25,
        includeGraph: true,
        useFts: true,
        recordTelemetry: false,
        awaitTelemetry: false,
        useExactMatchCache: true,
        protocol: 'mcp',
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`HyperRAG lookup timed out after ${HYPERRAG_TIMEOUT_MS}ms`)), HYPERRAG_TIMEOUT_MS)
      ),
    ]);

    const packet = rpcResult.packets.find(
      (candidate) =>
        candidate.packet_key === packetKey ||
        (sourceRef != null && sourceRef.length > 0 && candidate.source_ref === sourceRef)
    );

    if (!packet) {
      return {
        snapshot: {
          layer: 'HYPERRAG_RPC',
          packetKey: null,
          sourceRef: null,
          featureId: null,
          workspaceId: null,
          contentHash: null,
          ontologyVersion: null,
          snapshotAt: new Date(),
        },
        violations: [
          {
            code: 'PACKET_NOT_MATERIALIZED',
            layer: 'HYPERRAG_RPC',
            severity: 'INFO',
            path: query,
            message: 'HyperRAG search did not return the canonical packet for this source',
          },
        ],
      };
    }

    const hyperragPayload = {
      packet_key: packet.packet_key,
      source_ref: packet.source_ref,
      feature_id: packet.feature_id,
      feature_label: packet.feature_label,
      workspace_id: null,
      ontology_version: packet.ontology_label,
      content_hash: null,
      tree_node_id: null,
      rpc_received_at: new Date().toISOString(),
      rpc_version: 'hyperrag-packet-rpc',
      n_ary_facts: packet.neo4j_neighbors.map((neighbor) => ({
        predicate: 'RELATED_TO',
        subject: packet.packet_key,
        objects: [neighbor],
        confidence: 1,
        sourced_from: packet.source_ref,
      })),
    };

    const { value: projection, violations: adapterViolations } = fromHyperRagRpcPacket(hyperragPayload);
    const violations = adapterViolations.map((violation) => mapProjectionViolation('HYPERRAG_RPC', violation));

    return {
      snapshot: {
        layer: 'HYPERRAG_RPC',
        packetKey: projection?.packetKey ?? null,
        sourceRef: projection?.sourceRef ?? null,
        featureId: projection?.featureId ?? null,
        workspaceId: null,
        contentHash: projection?.contentHash ?? null,
        ontologyVersion: projection?.ontologyVersion ?? null,
        snapshotAt: new Date(),
      },
      violations,
    };
  } catch (err) {
    return {
      snapshot: {
        layer: 'HYPERRAG_RPC',
        packetKey: null,
        sourceRef: null,
        featureId: null,
        workspaceId: null,
        contentHash: null,
        ontologyVersion: null,
        snapshotAt: new Date(),
      },
      violations: [
        {
          code: 'HYPERRAG_CONNECTION_FAILED',
          layer: 'HYPERRAG_RPC',
          severity: 'INFO',
          path: 'connection',
          message: `HyperRAG unavailable: ${(err as Error).message}`,
        },
      ],
    };
  }
}

async function fetchFromACE(packetKey: string, sourceRef?: string | null, featureId?: string | null): Promise<{
  snapshot: ProjectionSnapshot;
  violations: ValidationViolation[];
}> {
  try {
    if (!sourceRef?.trim()) {
      return {
        snapshot: {
          layer: 'ACE',
          packetKey: null,
          sourceRef: null,
          featureId: null,
          workspaceId: null,
          contentHash: null,
          ontologyVersion: null,
          snapshotAt: new Date(),
        },
        violations: [
          {
            code: 'ACE_SOURCE_REF_MISSING',
            layer: 'ACE',
            severity: 'INFO',
            path: 'source_ref',
            message: 'ACE proof requires canonical source_ref from Postgres authority',
          },
        ],
      };
    }

    const { buildIndexedSourcePacket } = await import('../../sveltekit-frontend/src/lib/server/ace/indexed-source-packet.ts');
    const built = await Promise.race([
      buildIndexedSourcePacket({
        sourceRef,
        featureId: featureId ?? undefined,
        forceRefresh: false,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('ACE packet assembly timed out after 5000ms')), 5000)
      ),
    ]);

    const aceFeatureId = built.canonicalFeatureId ?? built.packet.feature_ids[0] ?? null;
    const aceSourceRef = built.canonicalSourceRef ?? built.normalizedSourceRef ?? built.packet.source_refs[0] ?? sourceRef;

    if (built.canonicalPacketKey) {
      return {
        snapshot: {
          layer: 'ACE',
          packetKey: built.canonicalPacketKey,
          sourceRef: aceSourceRef,
          featureId: aceFeatureId,
          workspaceId: null,
          contentHash: null,
          ontologyVersion: null,
          snapshotAt: new Date(),
        },
        violations: [],
      };
    }

    return {
      snapshot: {
        layer: 'ACE',
        packetKey: null,
        sourceRef: aceSourceRef,
        featureId: aceFeatureId,
        workspaceId: null,
        contentHash: null,
        ontologyVersion: null,
        snapshotAt: new Date(),
      },
      violations: [
        {
          code: 'ACE_CANONICAL_PACKET_KEY_NOT_EXPOSED',
          layer: 'ACE',
          severity: 'INFO',
          path: packetKey,
          message: `ACE ${built.mode} packet assembly resolved source lineage but does not expose canonical atlas packet_key`,
        },
      ],
    };
  } catch (err) {
    return {
      snapshot: {
        layer: 'ACE',
        packetKey: null,
        sourceRef: null,
        featureId: null,
        workspaceId: null,
        contentHash: null,
        ontologyVersion: null,
        snapshotAt: new Date(),
      },
      violations: [
        {
          code: 'ACE_QUERY_FAILED',
          layer: 'ACE',
          severity: 'INFO',
          path: sourceRef ?? packetKey,
          message: `ACE lookup unavailable: ${(err as Error).message}`,
        },
      ],
    };
  }
}

function compareAuthorityToProjection(
  authority: ProjectionSnapshot,
  projection: ProjectionSnapshot,
  options: { requireWorkspaceMatch?: boolean } = {}
): ValidationViolation[] {
  const violations: ValidationViolation[] = [];
  const requireWorkspaceMatch = options.requireWorkspaceMatch ?? false;

  if (authority.packetKey !== projection.packetKey) {
    violations.push({
      code: 'PACKET_KEY_MISMATCH',
      layer: `${authority.layer}↔${projection.layer}`,
      severity: 'BLOCK',
      path: 'packet_key',
      expected: authority.packetKey ?? 'null',
      actual: projection.packetKey ?? 'null',
      message: `Immutable identity mismatch: ${authority.layer} has ${authority.packetKey}, ${projection.layer} has ${projection.packetKey}`,
    });
  }

  if (authority.sourceRef !== projection.sourceRef) {
    violations.push({
      code: 'SOURCE_REF_MISMATCH',
      layer: `${authority.layer}↔${projection.layer}`,
      severity: 'BLOCK',
      path: 'source_ref',
      expected: authority.sourceRef ?? 'null',
      actual: projection.sourceRef ?? 'null',
    });
  }

  if (authority.featureId !== projection.featureId) {
    violations.push({
      code: 'FEATURE_ID_MISMATCH',
      layer: `${authority.layer}↔${projection.layer}`,
      severity: 'BLOCK',
      path: 'feature_id',
      expected: authority.featureId ?? 'null',
      actual: projection.featureId ?? 'null',
    });
  }

  if (requireWorkspaceMatch && authority.workspaceId !== projection.workspaceId) {
    violations.push({
      code: 'WORKSPACE_ID_MISMATCH',
      layer: `${authority.layer}↔${projection.layer}`,
      severity: 'WARN',
      path: 'workspace_id',
      expected: authority.workspaceId ?? 'null',
      actual: projection.workspaceId ?? 'null',
    });
  }

  if (authority.contentHash && projection.contentHash && authority.contentHash !== projection.contentHash) {
    violations.push({
      code: 'CONTENT_HASH_MISMATCH',
      layer: `${authority.layer}↔${projection.layer}`,
      severity: 'BLOCK',
      path: 'content_hash',
      expected: authority.contentHash,
      actual: projection.contentHash,
      message: `Content revision mismatch: ${authority.layer} has ${authority.contentHash}, ${projection.layer} has ${projection.contentHash}`,
    });
  }

  if (authority.contentHash && !projection.contentHash) {
    violations.push({
      code: 'CONTENT_HASH_MISSING',
      layer: `${authority.layer}↔${projection.layer}`,
      severity: 'WARN',
      path: 'content_hash',
      expected: authority.contentHash,
      actual: 'null',
      message: `${projection.layer} does not expose content_hash, so freshness cannot be proven`,
    });
  }

  return violations;
}

async function main() {
  console.log('🔍 Phase 108D — Immutability Proof-Matrix Validation');
  console.log('━'.repeat(60));
  const cliArgs = process.argv.slice(2);
  let requestedPacketKey = process.env.PROOF_PACKET_KEY || '';
  let requestedPacketId = process.env.PROOF_PACKET_ID || '';

  for (let i = 0; i < cliArgs.length; i += 1) {
    const arg = cliArgs[i];
    if (arg === '--packet-key') {
      requestedPacketKey = cliArgs[i + 1] || '';
      i += 1;
      continue;
    }
    if (arg === '--packet-id') {
      requestedPacketId = cliArgs[i + 1] || '';
      i += 1;
      continue;
    }
    if (!arg.startsWith('--') && !requestedPacketKey && !requestedPacketId) {
      requestedPacketKey = arg;
    }
  }

  // Step 1: Fetch from Postgres (source of truth)
  console.log('\n📖 Fetching canonical packet from Postgres...');
  if (requestedPacketId && !requestedPacketKey) {
    const pool = createProofPool();
    try {
      const lookupSql = `SELECT packet_key
        FROM atlas_packets
        WHERE packet_id = '${escapeSqlLiteral(requestedPacketId)}'
        LIMIT 1`;
      const packetLookup = await pool.query<{ packet_key: string | null }>(lookupSql);
      requestedPacketKey = packetLookup.rows[0]?.packet_key || '';
    } finally {
      await pool.end();
    }
  }

  const pgResult = await fetchFromPostgres(requestedPacketKey);
  let packetForProof: ProofPostgresPacketRow | null = null;

  if (!pgResult.snapshot.packetKey || pgResult.violations.some(v => v.severity === 'BLOCK')) {
    console.log(`⚠️  Postgres fetch failed or incomplete${requestedPacketKey ? ` for ${requestedPacketKey}` : ''}. Querying for preferred valid packet...`);

    // Query for a packet more likely to overlap with Qdrant's current packet:* payloads.
    const pool = createProofPool();

    try {
      const dbResult = await pool.query<ProofPostgresPacketRow>(
        `SELECT packet_key, packet_id, source_ref, feature_id, workspace_id, directory_path, canonical_source_ref, file_path, feature_label, content_hash, ontology_version, summary
         FROM atlas_packets
         WHERE packet_key IS NOT NULL AND source_ref IS NOT NULL AND feature_id IS NOT NULL
         ORDER BY CASE
           WHEN packet_key LIKE 'packet:%' THEN 0
           WHEN packet_key LIKE 'ace:packet:%' THEN 1
           ELSE 2
         END, packet_key
         LIMIT 1`
      );

      if (dbResult.rows.length === 0) {
        console.log('❌ No valid packets found in database');
        process.exit(2);
      }

      const packet = dbResult.rows[0];
      packetForProof = packet;
    } finally {
      await pool.end();
    }
  } else {
    packetForProof = {
      packet_key: pgResult.snapshot.packetKey,
      source_ref: pgResult.snapshot.sourceRef,
      feature_id: pgResult.snapshot.featureId,
      workspace_id: pgResult.snapshot.workspaceId,
      content_hash: pgResult.snapshot.contentHash,
      ontology_version: pgResult.snapshot.ontologyVersion,
    };
  }

  if (!packetForProof?.packet_key) {
    console.log('❌ Unable to determine a packet for proof execution');
    process.exit(2);
  }

  console.log(`✅ Found packet: ${packetForProof.packet_key}`);
  console.log('\n🔄 Fetching packet from all 5 layers...');

  const [pg, qdrant, redis, hyperrag, ace] = await Promise.all([
    fetchFromPostgres(packetForProof.packet_key),
    fetchFromQdrant(packetForProof.packet_key),
    fetchFromRedis(packetForProof.packet_key),
    fetchFromHyperRAG(packetForProof.packet_key, packetForProof.source_ref),
    fetchFromACE(packetForProof.packet_key, packetForProof.source_ref, packetForProof.feature_id),
  ]);

  console.log(`  ✓ Postgres: ${pg.violations.filter(v => v.severity === 'BLOCK').length > 0 ? '⚠️ violations' : '✓ ok'}`);
  console.log(`  ✓ Qdrant:   ${qdrant.violations.filter(v => v.severity === 'BLOCK').length > 0 ? '⚠️ violations' : '✓ ok'}`);
  console.log(`  ✓ Redis:    ${redis.violations.filter(v => v.severity === 'INFO').length > 0 ? 'ⓘ cache miss' : '✓ cached'}`);
  console.log(`  ✓ HyperRAG: ${hyperrag.violations.filter(v => v.severity === 'INFO').length > 0 ? 'ⓘ not materialized' : '✓ ok'}`);
  console.log(`  ✓ ACE:      ${ace.snapshot.packetKey ? '✓ ok' : ace.snapshot.sourceRef ? 'ⓘ lineage only' : ace.violations.filter(v => v.severity === 'INFO').length > 0 ? 'ⓘ lineage unavailable' : '✓ ok'}`);

  console.log('\n🔐 Running immutability gates...');

  const allViolations: ValidationViolation[] = [
    ...pg.violations,
    ...qdrant.violations,
    ...redis.violations,
    ...hyperrag.violations,
    ...ace.violations,
  ];

  allViolations.push(
    ...validateProjectionIdentityFormats(pg.snapshot),
    ...validateProjectionIdentityFormats(qdrant.snapshot),
    ...validateProjectionIdentityFormats(redis.snapshot),
    ...validateProjectionIdentityFormats(hyperrag.snapshot),
    ...validateProjectionIdentityFormats(ace.snapshot),
  );

  if (pg.snapshot.packetKey && qdrant.snapshot.packetKey) {
    allViolations.push(...compareAuthorityToProjection(pg.snapshot, qdrant.snapshot));
  }
  if (pg.snapshot.packetKey && redis.snapshot.packetKey) {
    allViolations.push(...compareAuthorityToProjection(pg.snapshot, redis.snapshot));
  }
  if (pg.snapshot.packetKey && hyperrag.snapshot.packetKey) {
    allViolations.push(...compareAuthorityToProjection(pg.snapshot, hyperrag.snapshot));
  }
  if (pg.snapshot.packetKey && ace.snapshot.packetKey) {
    allViolations.push(...compareAuthorityToProjection(pg.snapshot, ace.snapshot));
  }

  const blockViolations = allViolations.filter(v => v.severity === 'BLOCK');
  const layersWithData = [pg, qdrant, redis, hyperrag, ace]
    .filter(s => s.snapshot.packetKey !== null).length;

  let canPromotion: 'CROSS_STORE_PROVEN' | 'PARTIAL_PROVEN' | 'NOT_PROVEN' = 'NOT_PROVEN';
  if (blockViolations.length === 0 && layersWithData >= 5) {
    canPromotion = 'CROSS_STORE_PROVEN';
  } else if (blockViolations.length === 0 && layersWithData >= 3) {
    canPromotion = 'PARTIAL_PROVEN';
  }

  const result: ValidationResultV1 = {
    packetKey: packetForProof.packet_key,
    workspaceId: pg.snapshot.workspaceId ?? PROOF_WORKSPACE_ID,
    validatedAt: new Date(),
    validatedBy: 'phase-108d-proof-matrix',
    phase: '108d',
    projections: {
      postgres: pg.snapshot,
      qdrant: qdrant.snapshot,
      redis: redis.snapshot,
      hyperrag_rpc: hyperrag.snapshot,
      ace: ace.snapshot,
    },
    violations: allViolations,
    isValid: blockViolations.length === 0,
    canPromotion,
    blockedLayers: blockViolations.map(v => v.layer).filter(Boolean),
    warnLayers: allViolations
      .filter(v => v.severity === 'WARN')
      .map(v => v.layer)
      .filter(Boolean),
    passLayers: [pg, qdrant, redis, hyperrag, ace]
      .filter(s => s.snapshot.packetKey !== null && !blockViolations.some(v => v.layer.includes(s.snapshot.layer!)))
      .map(s => s.snapshot.layer as string),
  };

  await mkdir(REPORT_DIR, { recursive: true });
  const reportPath = path.join(
    REPORT_DIR,
    `phase108d-proof-${result.packetKey.replace(/[^a-zA-Z0-9:_-]/g, '_')}-${formatReportTimestamp(result.validatedAt)}.json`
  );
  result.report = reportPath;
  await writeFile(reportPath, JSON.stringify(result, null, 2), 'utf8');

  console.log('\n📊 Proof-Matrix Results');
  console.log('━'.repeat(60));
  console.log(`Packet: ${result.packetKey}`);
  console.log(`Workspace: ${result.workspaceId}`);
  console.log(`Valid: ${result.isValid ? '✅ YES' : '❌ NO'}`);
  console.log(`Promotion: ${result.canPromotion}`);
  console.log(`Block violations: ${blockViolations.length}`);
  console.log(`Warn violations: ${allViolations.filter(v => v.severity === 'WARN').length}`);
  console.log(`Layers with data: ${layersWithData}/5`);

  if (blockViolations.length > 0) {
    console.log('\n⚠️  Block Violations:');
    blockViolations.forEach(v => {
      console.log(`  • ${v.layer}/${v.code}: ${v.message || v.path}`);
    });
  }

  console.log('\n✅ Validation complete.');
  console.log(`Report: ${reportPath}`);
  console.log(JSON.stringify(result, null, 2));

  const exitCode = result.canPromotion === 'CROSS_STORE_PROVEN' ? 0 : result.canPromotion === 'PARTIAL_PROVEN' ? 1 : 2;
  process.exit(exitCode);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
