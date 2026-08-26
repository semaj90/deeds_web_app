import { getRedis } from '$lib/server/redis.js';
import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import type { AceEvidence } from '../contracts/ace-context-packet.js';
import {
  resolveCanonicalIdentity,
  type CanonicalIdentityResolution,
} from '../identity-contract.js';

export interface EvidenceLaneConfig {
  maxCandidates: number;
  timeout: number;
}

export function extractWorkspaceRevisionFromMetadata(metadata: unknown): string | null {
  const record = (metadata ?? {}) as Record<string, unknown>;
  return typeof record.workspace_revision === 'string'
    ? record.workspace_revision
    : typeof record.workspaceRevision === 'string'
      ? record.workspaceRevision
      : typeof record.revision === 'string'
        ? record.revision
        : null;
}

export function normalizeQdrantPayloadIdentity(payload: Record<string, unknown> | null | undefined): {
  backendLocalId: string | null;
  canonicalIdentity: CanonicalIdentityResolution;
  identityStatus: CanonicalIdentityResolution['status'];
  packetKey: string | null;
  sourceRef: string | null;
  contentHash: string | null;
  treeNodeId: string | null;
  featureId: string | null;
  featureLabel: string | null;
  workspaceRevision: string | null;
} {
  const packetKey = payload?.packet_key as string | null ?? payload?.packetKey as string | null ?? null;
  const sourceRef = payload?.source_ref as string | null ?? payload?.sourceRef as string | null ?? null;
  const symbolVersionId = payload?.symbol_version_id as string | null
    ?? payload?.symbolVersionId as string | null
    ?? null;
  const backendLocalId = payload?.qdrant_point_id as string | null
    ?? payload?.qdrantPointId as string | null
    ?? (typeof payload?.id === 'string' || typeof payload?.id === 'number' ? String(payload.id) : null)
    ?? null;
  const canonicalIdentity = resolveCanonicalIdentity({
    symbolVersionId,
    packetKey,
    sourceRef,
    laneIdFallback: sourceRef,
    backendLocalId,
  });

  return {
    backendLocalId,
    canonicalIdentity,
    identityStatus: canonicalIdentity.status,
    packetKey,
    sourceRef,
    contentHash: payload?.content_hash as string | null ?? payload?.contentHash as string | null ?? null,
    treeNodeId: payload?.tree_node_id as string | null ?? payload?.treeNodeId as string | null ?? null,
    featureId: payload?.feature_id as string | null ?? payload?.featureId as string | null ?? null,
    featureLabel: payload?.feature_label as string | null ?? payload?.featureLabel as string | null ?? null,
    workspaceRevision: payload?.workspace_revision as string | null
      ?? payload?.workspaceRevision as string | null
      ?? extractWorkspaceRevisionFromMetadata(payload?.metadata),
  };
}

export class RedisExactLane {
  async search(
    queryHash: string,
    cacheKey: string
  ): Promise<AceEvidence[]> {
    const redis = getRedis();
    const cached = await redis.get(cacheKey);
    return cached ? JSON.parse(cached) : [];
  }
}

export class PostgresLexicalLane {
  async search(
    query: string,
    limit: number = 20
  ): Promise<AceEvidence[]> {
    const results = await db.execute(sql`
      SELECT
        packet_key,
        source_ref,
        sha256 AS content_hash,
        tree_node_id,
        feature_id,
        feature_label,
        COALESCE(
          metadata->>'workspace_revision',
          metadata->>'workspaceRevision',
          metadata->>'revision'
        ) AS workspace_revision,
        ts_rank(fts_document, plainto_tsquery('english', ${query})) AS raw_score,
        snapshot_id
      FROM atlas_packets
      WHERE fts_document @@ plainto_tsquery('english', ${query})
      ORDER BY raw_score DESC
      LIMIT ${limit}
    `);

    return results.rows.map((row: any) => ({
      packetKey: row.packet_key,
      sourceRef: row.source_ref,
      contentHash: row.content_hash,
      treeNodeId: row.tree_node_id ?? null,
      featureId: row.feature_id ?? null,
      featureLabel: row.feature_label ?? null,
      workspaceRevision: row.workspace_revision ?? null,
      evidenceKind: 'lexical' as const,
      rawScore: row.raw_score,
      fusedScore: null,
      snapshotId: row.snapshot_id,
      provenance: ['postgres_fts']
    }));
  }
}

export class QdrantDenseLane {
  async search(
    embedding: number[],
    limit: number = 20
  ): Promise<AceEvidence[]> {
      const response = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks_768_v2/points/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: embedding,
        limit,
        with_payload: true,
        with_vector: false
      })
    });

    if (!response.ok) {
      throw new Error(`Qdrant error: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.points.map((point: any) => ({
      ...normalizeQdrantPayloadIdentity(point.payload),
      evidenceKind: 'semantic' as const,
      rawScore: point.score,
      fusedScore: null,
      snapshotId: point.payload.snapshot_id,
      provenance: [`qdrant_point_${point.id}`]
    }));
  }
}

export class Neo4jTopologyLane {
  async search(
    packetKey: string,
    hopsLimit: number = 2,
    candidateLimit: number = 20
  ): Promise<AceEvidence[]> {
    // Placeholder: Neo4j traversal via HTTP or bolt client
    // Expands neighborhood via USED_IN, SIMILAR_TOPOLOGY, DEPENDS_ON edges
    return [];
  }
}

export class PlaybookLane {
  async search(
    intent: string,
    playbookRevision: string
  ): Promise<AceEvidence[]> {
    // Placeholder: Retrieve tools/rules from playbook revisions table
    return [];
  }
}

export class OutcomeLedgerLane {
  async search(
    queryHash: string,
    limit: number = 5
  ): Promise<AceEvidence[]> {
    // Placeholder: Retrieve prior successful answers from outcome ledger
    return [];
  }
}

export class McpToolLane {
  async search(
    domain: string,
    limit: number = 8
  ): Promise<AceEvidence[]> {
    // Placeholder: Retrieve top N tools from MCP registry filtered by domain
    return [];
  }
}
