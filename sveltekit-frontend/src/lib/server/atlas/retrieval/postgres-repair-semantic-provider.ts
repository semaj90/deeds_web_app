import { inArray } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema/atlas-packets.js';
import { SEMANTIC_DIMENSION, SEMANTIC_REPRESENTATION_ID, assertSemantic768 } from '$lib/server/embedding/embedding-contract-768.js';
import {
  RepairSemanticMirrorLookupV1Schema,
  RepairSemanticMirrorRowV1Schema,
  type RepairSemanticMirrorLookup,
  type RepairSemanticMirrorLookupV1,
  type RepairSemanticMirrorRowV1,
} from './repair-semantic-corpus.js';

/**
 * Canonical semantic vector provider for the bounded repair tournament.
 *
 * Despite the generic `Mirror` adapter interface used by repair-semantic-corpus,
 * this implementation reads vector bytes from canonical Postgres atlas_packets.
 * Source revision is deliberately left null here because the independent
 * source-revision resolver owns that field via codebase_chunk_index metadata.
 *
 * Required vector lineage:
 * - packet_key exact match
 * - source_ref exact match
 * - source_representation_id = semantic_768
 * - source_dimension = 768
 * - representation_revision > 0
 * - encoder_revision is explicit and non-empty
 * - vector contains exactly 768 finite values
 */

function representationRevision(row: {
  representationRevision: number | null;
  encoderRevision: string | null;
}): string | null {
  const revision = Number(row.representationRevision);
  const encoder = row.encoderRevision?.trim();
  if (!Number.isInteger(revision) || revision <= 0 || !encoder) return null;
  return `${SEMANTIC_REPRESENTATION_ID}:r${revision}:${encoder}`;
}

function vectorArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const vector = value.map(Number);
  try {
    assertSemantic768(vector);
    return vector;
  } catch {
    return null;
  }
}

export function createPostgresRepairSemanticProvider(): RepairSemanticMirrorLookup {
  return async (rawRequests: readonly RepairSemanticMirrorLookupV1[]): Promise<RepairSemanticMirrorRowV1[]> => {
    const requests = rawRequests.map((value) => RepairSemanticMirrorLookupV1Schema.parse(value));
    if (!requests.length) return [];

    const packetKeys = [...new Set(requests.map((request) => request.packetKey))];
    const requestByPacket = new Map(requests.map((request) => [request.packetKey, request]));
    const rows = await db
      .select({
        packetKey: atlasPackets.packetKey,
        sourceRef: atlasPackets.sourceRef,
        embedding: atlasPackets.embedding,
        sourceRepresentationId: atlasPackets.sourceRepresentationId,
        sourceDimension: atlasPackets.sourceDimension,
        representationRevision: atlasPackets.representationRevision,
        encoderRevision: atlasPackets.encoderRevision,
        embeddingDigest: atlasPackets.embeddingDigest,
        qdrantPointId: atlasPackets.qdrantPointId,
        metadata: atlasPackets.metadata,
      })
      .from(atlasPackets)
      .where(inArray(atlasPackets.packetKey, packetKeys));

    const out: RepairSemanticMirrorRowV1[] = [];
    for (const row of rows) {
      const packetKey = row.packetKey?.trim();
      if (!packetKey) continue;
      const request = requestByPacket.get(packetKey);
      if (!request) continue;
      if (row.sourceRef !== request.sourceRef) continue;
      if (row.sourceRepresentationId !== SEMANTIC_REPRESENTATION_ID) continue;
      if (row.sourceDimension !== SEMANTIC_DIMENSION) continue;

      const revision = representationRevision(row);
      const vector = vectorArray(row.embedding);
      if (!revision || !vector) continue;

      const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown>
        : {};
      const symbolVersionId = typeof metadata.symbol_version_id === 'string'
        ? metadata.symbol_version_id
        : typeof metadata.symbolVersionId === 'string'
          ? metadata.symbolVersionId
          : null;
      const digest = row.embeddingDigest?.trim();
      const vectorRef = digest
        ? `postgres:atlas_packets:${packetKey}:embedding:${digest}`
        : `postgres:atlas_packets:${packetKey}:embedding:r${row.representationRevision}`;

      out.push(RepairSemanticMirrorRowV1Schema.parse({
        packetKey,
        sourceRef: row.sourceRef,
        // Source revision remains owned by codebase_chunk_index/Postgres source
        // metadata resolver. Never substitute workspace/representation revision.
        sourceRevision: null,
        symbolVersionId,
        representationId: SEMANTIC_REPRESENTATION_ID,
        representationRevision: revision,
        vector,
        mirrorRef: vectorRef,
      }));
    }

    return out;
  };
}
