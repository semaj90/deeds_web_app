import type {
  AtlasChunkPacketIdentityLinkV1,
  ChunkPacketMatchMethod,
} from './chunk-packet-identity-link-v1.js';

export const CHUNK_PACKET_IDENTITY_READBACK_SCHEMA = 'atlas.chunk-packet-identity-readback.v1' as const;

export type ChunkPacketReadbackStatus =
  | 'VERIFIED'
  | 'DRIFTED'
  | 'UNVERIFIABLE'
  | 'NOT_ADMITTED';

export interface ChunkPacketReadbackObservationV1 {
  qdrantPointExists: boolean;
  chunkExists: boolean;
  packetExists: boolean;
  qdrantPointId: string;
  chunkIndexId: string | null;
  chunkMetadataPacketKey: string | null;
  chunkSourceRef: string | null;
  chunkSourceRevision: string | null;
  chunkStartByte: number | null;
  chunkEndByte: number | null;
  chunkTreeNodeId: string | null;
  packetKey: string | null;
  packetQdrantPointId: string | null;
  packetArtifactId: string | null;
  packetSourceRef: string | null;
  packetSourceRevision: string | null;
  packetStartByte: number | null;
  packetEndByte: number | null;
  packetTreeNodeId: string | null;
}

export interface AtlasChunkPacketIdentityReadbackV1 {
  schema: typeof CHUNK_PACKET_IDENTITY_READBACK_SCHEMA;
  qdrantCollection: string;
  qdrantPointId: string;
  chunkIndexId: string | null;
  canonicalPacketKey: string | null;
  originalMatchMethod: ChunkPacketMatchMethod;
  originalConfidence: AtlasChunkPacketIdentityLinkV1['confidence'];
  status: ChunkPacketReadbackStatus;
  matchReproduced: boolean;
  reasonCodes: string[];
  canonicalPacketStillExists: boolean;
  qdrantPointStillExists: boolean;
  chunkStillExists: boolean;
  canonicalPacketMinted: false;
  postgresWritesAllowed: false;
  qdrantWritesAllowed: false;
  canonicalWritesAllowed: false;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeRef(value: string | null | undefined): string | null {
  const text = clean(value)?.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+/g, '/');
  return text ? text.replace(/\/$/, '') : null;
}

function eqText(a: string | null | undefined, b: string | null | undefined): boolean {
  return clean(a) !== null && clean(a) === clean(b);
}

function eqRef(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeRef(a) !== null && normalizeRef(a) === normalizeRef(b);
}

function eqNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

export function verifyChunkPacketIdentityReadback(input: {
  link: AtlasChunkPacketIdentityLinkV1;
  observation: ChunkPacketReadbackObservationV1;
}): AtlasChunkPacketIdentityReadbackV1 {
  const { link, observation } = input;
  const base = {
    schema: CHUNK_PACKET_IDENTITY_READBACK_SCHEMA,
    qdrantCollection: link.qdrantCollection,
    qdrantPointId: link.qdrantPointId,
    chunkIndexId: link.chunkIndexId,
    canonicalPacketKey: link.canonicalPacketKey,
    originalMatchMethod: link.matchMethod,
    originalConfidence: link.confidence,
    canonicalPacketStillExists: observation.packetExists,
    qdrantPointStillExists: observation.qdrantPointExists,
    chunkStillExists: observation.chunkExists,
    canonicalPacketMinted: false as const,
    postgresWritesAllowed: false as const,
    qdrantWritesAllowed: false as const,
    canonicalWritesAllowed: false as const,
  };

  if (link.admission !== 'ADMITTED' || !clean(link.canonicalPacketKey)) {
    return {
      ...base,
      status: 'NOT_ADMITTED',
      matchReproduced: false,
      reasonCodes: ['ORIGINAL_LINK_NOT_ADMITTED'],
    };
  }

  const reasons: string[] = [];
  if (!observation.qdrantPointExists) reasons.push('QDRANT_POINT_MISSING');
  if (!observation.chunkExists) reasons.push('CODEBASE_CHUNK_MISSING');
  if (!observation.packetExists) reasons.push('CANONICAL_PACKET_MISSING');
  if (!eqText(link.canonicalPacketKey, observation.packetKey)) reasons.push('CANONICAL_PACKET_KEY_DRIFT');
  if (reasons.length) {
    return { ...base, status: 'DRIFTED', matchReproduced: false, reasonCodes: reasons };
  }

  let reproduced = false;
  let unverifiableReason: string | null = null;

  switch (link.matchMethod) {
    case 'EXACT_CANONICAL_ID': {
      if (!clean(observation.chunkMetadataPacketKey)) {
        unverifiableReason = 'CHUNK_METADATA_PACKET_KEY_UNAVAILABLE';
        break;
      }
      reproduced = eqText(observation.chunkMetadataPacketKey, link.canonicalPacketKey)
        && eqText(observation.packetKey, link.canonicalPacketKey);
      break;
    }
    case 'EXACT_QDRANT_POINT_LINK': {
      const pointId = clean(observation.qdrantPointId);
      const qdrantMatch = pointId !== null && (
        eqText(pointId, observation.packetQdrantPointId)
        || eqText(pointId, observation.packetArtifactId)
      );
      if (!clean(observation.packetQdrantPointId) && !clean(observation.packetArtifactId)) {
        unverifiableReason = 'PACKET_POINT_LINK_FIELDS_UNAVAILABLE';
        break;
      }
      reproduced = qdrantMatch;
      break;
    }
    case 'EXACT_SOURCE_SPAN': {
      if (
        !normalizeRef(observation.chunkSourceRef)
        || !normalizeRef(observation.packetSourceRef)
        || !Number.isFinite(observation.chunkStartByte)
        || !Number.isFinite(observation.chunkEndByte)
        || !Number.isFinite(observation.packetStartByte)
        || !Number.isFinite(observation.packetEndByte)
      ) {
        unverifiableReason = 'SOURCE_SPAN_FIELDS_UNAVAILABLE';
        break;
      }
      reproduced = eqRef(observation.chunkSourceRef, observation.packetSourceRef)
        && eqNumber(observation.chunkStartByte, observation.packetStartByte)
        && eqNumber(observation.chunkEndByte, observation.packetEndByte);
      break;
    }
    case 'SOURCE_REVISION_SPAN': {
      if (
        !clean(observation.chunkSourceRevision)
        || !clean(observation.packetSourceRevision)
        || !Number.isFinite(observation.chunkStartByte)
        || !Number.isFinite(observation.chunkEndByte)
        || !Number.isFinite(observation.packetStartByte)
        || !Number.isFinite(observation.packetEndByte)
      ) {
        unverifiableReason = 'SOURCE_REVISION_SPAN_FIELDS_UNAVAILABLE';
        break;
      }
      reproduced = eqText(observation.chunkSourceRevision, observation.packetSourceRevision)
        && eqNumber(observation.chunkStartByte, observation.packetStartByte)
        && eqNumber(observation.chunkEndByte, observation.packetEndByte);
      break;
    }
    case 'STRUCTURAL_FINGERPRINT': {
      if (!clean(observation.chunkTreeNodeId) || !clean(observation.packetTreeNodeId)) {
        unverifiableReason = 'STRUCTURAL_FINGERPRINT_FIELDS_UNAVAILABLE';
        break;
      }
      reproduced = eqText(observation.chunkTreeNodeId, observation.packetTreeNodeId);
      break;
    }
    case 'CONTENT_HASH_UNIQUE':
      // The admission classifier is forbidden from admitting a content-hash-only
      // link. Encountering one in an ADMITTED manifest indicates an invalid or
      // stale producer and must not be grandfathered through readback.
      return {
        ...base,
        status: 'DRIFTED',
        matchReproduced: false,
        reasonCodes: ['INVALID_ADMITTED_CONTENT_HASH_ONLY_LINK'],
      };
    case 'AMBIGUOUS':
    case 'UNRESOLVED':
      return {
        ...base,
        status: 'DRIFTED',
        matchReproduced: false,
        reasonCodes: ['INVALID_ADMITTED_NONCANONICAL_MATCH_METHOD'],
      };
    default: {
      const exhaustive: never = link.matchMethod;
      throw new Error(`UNHANDLED_S512_MATCH_METHOD:${String(exhaustive)}`);
    }
  }

  if (unverifiableReason) {
    return {
      ...base,
      status: 'UNVERIFIABLE',
      matchReproduced: false,
      reasonCodes: [unverifiableReason],
    };
  }

  if (!reproduced) {
    return {
      ...base,
      status: 'DRIFTED',
      matchReproduced: false,
      reasonCodes: ['ORIGINAL_ADMISSION_EVIDENCE_NO_LONGER_REPRODUCES'],
    };
  }

  return {
    ...base,
    status: 'VERIFIED',
    matchReproduced: true,
    reasonCodes: ['ORIGINAL_ADMISSION_EVIDENCE_REPRODUCED'],
  };
}
