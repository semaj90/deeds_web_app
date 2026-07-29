import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { assemblePacketForSourceRef } from './parent-atlas-packet-assembler.js';
import { buildAcePacketFromSource } from './source-to-packet.js';
import type { AceFullPacket } from './ace-packet-store.js';
import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema/atlas-packets.js';

export interface BuildIndexedSourcePacketInput {
  sourceRef: string;
  query?: string;
  featureId?: string;
  forceRefresh?: boolean;
}

export interface BuildIndexedSourcePacketResult {
  packet: AceFullPacket;
  fromCache: boolean;
  mode: 'indexed-identity' | 'source-fallback';
  normalizedSourceRef: string | null;
  clusterId: string | null;
  laneIds: string[];
  canonicalPacketKey: string | null;
  canonicalSourceRef: string | null;
  canonicalFeatureId: string | null;
  canonicalTreeNodeId: string | null;
  canonicalContentHash: string | null;
  canonicalWorkspaceRevision: string | null;
}

export function buildSourceRefCandidates(sourceRef: string): string[] {
  const base = sourceRef.trim().replace(/\\/g, '/');
  if (!base) return [];

  const variants = new Set<string>([base]);
  if (base.startsWith('sveltekit-frontend/')) {
    variants.add(base.slice('sveltekit-frontend/'.length));
  } else if (base.startsWith('src/')) {
    variants.add(`sveltekit-frontend/${base}`);
  }
  return [...variants];
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

async function resolveCanonicalAtlasIdentity(
  sourceRefs: string[],
  featureId?: string,
): Promise<{
  canonicalPacketKey: string | null;
  canonicalSourceRef: string | null;
  canonicalFeatureId: string | null;
  canonicalTreeNodeId: string | null;
  canonicalContentHash: string | null;
  canonicalWorkspaceRevision: string | null;
}> {
  const refs = [...new Set(sourceRefs.flatMap(buildSourceRefCandidates).filter(Boolean))];
  if (refs.length === 0) {
    return {
      canonicalPacketKey: null,
      canonicalSourceRef: null,
      canonicalFeatureId: null,
      canonicalTreeNodeId: null,
      canonicalContentHash: null,
      canonicalWorkspaceRevision: null,
    };
  }

  const identityPredicate = or(
    inArray(atlasPackets.sourceRef, refs),
    inArray(atlasPackets.canonicalSourceRef, refs),
    inArray(atlasPackets.sourcePath, refs),
    inArray(atlasPackets.filePath, refs),
  );

  const rows = await db
    .select({
      packetKey: atlasPackets.packetKey,
      sourceRef: atlasPackets.sourceRef,
      featureId: atlasPackets.featureId,
      treeNodeId: atlasPackets.treeNodeId,
      contentHash: atlasPackets.sha256,
      metadata: atlasPackets.metadata,
    })
    .from(atlasPackets)
    .where(
      featureId
        ? and(identityPredicate, eq(atlasPackets.featureId, featureId))
        : identityPredicate
    )
    .orderBy(desc(atlasPackets.updatedAt))
    .limit(1);

  const row = rows[0];
  return {
    canonicalPacketKey: row?.packetKey ?? null,
    canonicalSourceRef: row?.sourceRef ?? null,
    canonicalFeatureId: row?.featureId ?? null,
    canonicalTreeNodeId: row?.treeNodeId ? String(row.treeNodeId) : null,
    canonicalContentHash: row?.contentHash ?? null,
    canonicalWorkspaceRevision: extractWorkspaceRevisionFromMetadata(row?.metadata),
  };
}

export async function buildIndexedSourcePacket(
  input: BuildIndexedSourcePacketInput
): Promise<BuildIndexedSourcePacketResult> {
  const sourceRef = input.sourceRef.trim();
  if (!sourceRef) {
    throw new Error('sourceRef is required');
  }

  const assembled = await assemblePacketForSourceRef({
    sourceRef,
    query: input.query,
    featureId: input.featureId,
    forceRefresh: input.forceRefresh,
  }).catch(() => null);

  if (assembled?.packet) {
    const canonicalIdentity = await resolveCanonicalAtlasIdentity(
      [input.sourceRef, assembled.packet.source_refs[0] ?? sourceRef],
      input.featureId ?? assembled.packet.feature_ids[0],
    );

    return {
      packet: assembled.packet,
      fromCache: assembled.fromCache,
      mode: 'indexed-identity',
      normalizedSourceRef: assembled.packet.source_refs[0] ?? sourceRef,
      clusterId: assembled.packet.cluster_id ?? assembled.packet.som_cluster ?? null,
      laneIds: assembled.packet.lane_ids,
      canonicalPacketKey: canonicalIdentity.canonicalPacketKey,
      canonicalSourceRef: canonicalIdentity.canonicalSourceRef,
      canonicalFeatureId: canonicalIdentity.canonicalFeatureId,
      canonicalTreeNodeId: canonicalIdentity.canonicalTreeNodeId,
      canonicalContentHash: canonicalIdentity.canonicalContentHash,
      canonicalWorkspaceRevision: canonicalIdentity.canonicalWorkspaceRevision,
    };
  }

  const fallback = await buildAcePacketFromSource({
    sourceRef,
    query: input.query,
    featureId: input.featureId,
    forceRefresh: input.forceRefresh,
    asLatest: true,
  });

  const canonicalIdentity = await resolveCanonicalAtlasIdentity(
    [input.sourceRef, fallback.normalizedSourceRef ?? sourceRef],
    input.featureId ?? fallback.packet.feature_ids[0],
  );

  return {
    packet: fallback.packet,
    fromCache: fallback.fromCache,
    mode: 'source-fallback',
    normalizedSourceRef: fallback.normalizedSourceRef,
    clusterId: fallback.packet.cluster_id ?? fallback.packet.som_cluster ?? null,
    laneIds: fallback.packet.lane_ids,
    canonicalPacketKey: canonicalIdentity.canonicalPacketKey,
    canonicalSourceRef: canonicalIdentity.canonicalSourceRef,
    canonicalFeatureId: canonicalIdentity.canonicalFeatureId,
    canonicalTreeNodeId: canonicalIdentity.canonicalTreeNodeId,
    canonicalContentHash: canonicalIdentity.canonicalContentHash,
    canonicalWorkspaceRevision: canonicalIdentity.canonicalWorkspaceRevision,
  };
}
