/**
 * Redis Packet Projection Adapter
 *
 * Maps between:
 * - Redis values (JSON strings, snake_case)
 * - Application domain objects (camelCase)
 *
 * Redis is used for two distinct caching layers:
 * 1. **BitFrost L1 cache**: `bifrost:packet:{packet_key}` → compact packet metadata
 * 2. **BitFrost L2 cache**: `bitfrost:centroid:{feature_id}` → centroid vectors for reranking
 *
 * CRITICAL: packet_key must be identical between Postgres (truth), Redis (cache), and Qdrant (mirror).
 */

export interface RedisPacketValue {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  feature_label: string;
  workspace_id: string;
  workspace_revision?: string | null;
  ontology_version?: string | null;
  content_hash?: string | null;
  tree_node_id?: string | null;
  cached_at: string; // ISO timestamp
  ttl_seconds: number; // time-to-live
}

export interface SemanticPacketDomainObject {
  packetKey: string;
  sourceRef: string;
  featureId: string;
  featureLabel: string;
  workspaceId: string | null;
  workspaceRevision?: string | null;
  ontologyVersion?: string | null;
  contentHash?: string | null;
  treeNodeId?: string | null;
  cachedAt: string;
  ttlSeconds: number;
}

function readText(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

function readNestedText(record: Record<string, unknown>, parentKey: string, ...keys: string[]): string | null {
  const nested = record[parentKey];
  if (!nested || typeof nested !== 'object') return null;
  return readText(nested as Record<string, unknown>, ...keys);
}

function isValidPacketKey(packetKey: string): boolean {
  return (
    packetKey.startsWith('packet:') ||
    packetKey.startsWith('pkt_') ||
    packetKey.startsWith('ace:packet:')
  );
}

/**
 * Convert Redis JSON string to domain object (camelCase).
 *
 * Parses JSON, validates structure, converts to camelCase.
 */
export function fromRedisValue(jsonString: string): {
  packet: SemanticPacketDomainObject | null;
  violations: ProjectionViolation[];
} {
  const violations: ProjectionViolation[] = [];

  try {
    const parsed = JSON.parse(jsonString) as Record<string, unknown>;
    const value = parsed as unknown as RedisPacketValue;
    const packetKey = readText(parsed, 'packet_key', 'packetKey');
    const sourceRef = readText(parsed, 'source_ref', 'sourceRef');
    const featureId = readText(parsed, 'feature_id', 'featureId');
    const featureLabel = readText(parsed, 'feature_label', 'featureLabel') ?? '';
    const workspaceId =
      readText(parsed, 'workspace_id', 'workspaceId')
      ?? readNestedText(parsed, 'workspace', 'id', 'workspace_id', 'workspaceId');
    const ontologyVersion =
      readText(parsed, 'ontology_version', 'ontologyVersion')
      ?? readNestedText(parsed, 'metadata', 'ontology_version', 'ontologyVersion')
      ?? readNestedText(parsed, 'payload', 'ontology_version', 'ontologyVersion');
    const contentHash = readText(parsed, 'content_hash', 'contentHash');
    const treeNodeId = readText(parsed, 'tree_node_id', 'treeNodeId');
    const cachedAt =
      readText(parsed, 'cached_at', 'cachedAt', 'created_at', 'createdAt')
      ?? new Date(0).toISOString();
    const ttlSeconds = Number(parsed.ttl_seconds ?? parsed.ttlSeconds ?? 3600) || 3600;

    // Validate presence of required fields
    if (!packetKey) {
      violations.push({
        code: 'PACKET_KEY_MISSING',
        path: 'packet_key',
      });
    } else if (!isValidPacketKey(packetKey)) {
      violations.push({
        code: 'PACKET_KEY_INVALID_PREFIX',
        path: 'packet_key',
        expected: 'packet:<id>, pkt_<32-char hex>, or ace:packet:<id>',
        actual: packetKey,
      });
    }

    if (!sourceRef) {
      violations.push({
        code: 'SOURCE_REF_MISSING',
        path: 'source_ref',
      });
    }

    if (!featureId) {
      violations.push({
        code: 'FEATURE_ID_MISSING',
        path: 'feature_id',
      });
    }

    if (!workspaceId) {
      violations.push({
        code: 'WORKSPACE_ID_MISSING',
        path: 'workspace_id',
      });
    }

    if (!ontologyVersion) {
      violations.push({
        code: 'ONTOLOGY_VERSION_MISSING',
        path: 'ontology_version',
      });
    }

    if (
      violations.some(
        (violation) =>
          violation.code === 'PACKET_KEY_MISSING' ||
          violation.code === 'PACKET_KEY_INVALID_PREFIX' ||
          violation.code === 'SOURCE_REF_MISSING' ||
          violation.code === 'FEATURE_ID_MISSING'
      )
    ) {
      return { packet: null, violations };
    }

    // Convert to domain object
    const packet: SemanticPacketDomainObject = {
      packetKey: packetKey as string,
      sourceRef: sourceRef as string,
      featureId: featureId as string,
      featureLabel,
      workspaceId,
      workspaceRevision: readText(parsed, 'workspace_revision', 'workspaceRevision'),
      ontologyVersion,
      contentHash,
      treeNodeId,
      cachedAt,
      ttlSeconds,
    };

    return { packet, violations };
  } catch (err) {
    violations.push({
      code: 'JSON_PARSE_ERROR',
      path: 'root',
      expected: 'valid JSON',
      actual: err instanceof Error ? err.message : 'unknown error',
    });
    return { packet: null, violations };
  }
}

/**
 * Convert domain object (camelCase) to Redis value (snake_case JSON).
 *
 * Used when writing packets to Redis cache.
 */
export function toRedisValue(packet: SemanticPacketDomainObject): string {
  const value: RedisPacketValue = {
    packet_key: packet.packetKey,
    source_ref: packet.sourceRef,
    feature_id: packet.featureId,
    feature_label: packet.featureLabel,
    workspace_id: packet.workspaceId,
    workspace_revision: packet.workspaceRevision,
    ontology_version: packet.ontologyVersion,
    content_hash: packet.contentHash,
    tree_node_id: packet.treeNodeId,
    cached_at: packet.cachedAt,
    ttl_seconds: packet.ttlSeconds,
  };

  return JSON.stringify(value);
}

/**
 * Projection validation: check for required fields + immutability constraints.
 *
 * Returns violations (missing fields, mismatches) rather than throwing.
 */
export type ProjectionViolation = {
  code:
    | 'PACKET_KEY_MISSING'
    | 'PACKET_KEY_INVALID_PREFIX'
    | 'SOURCE_REF_MISSING'
    | 'FEATURE_ID_MISSING'
    | 'WORKSPACE_ID_MISSING'
    | 'ONTOLOGY_VERSION_MISSING'
    | 'JSON_PARSE_ERROR';
  path: string;
  expected?: string;
  actual?: string;
};

export function validateRedisProjection(
  jsonString: string
): { isValid: boolean; violations: ProjectionViolation[] } {
  const { packet, violations } = fromRedisValue(jsonString);
  return { isValid: packet !== null && violations.length === 0, violations };
}

/**
 * Cache freshness check: is this packet still within TTL?
 *
 * Returns true if cached_at + ttl_seconds > now
 */
export function isRedisPacketFresh(packet: SemanticPacketDomainObject): boolean {
  const cachedAt = new Date(packet.cachedAt).getTime();
  const expiresAt = cachedAt + packet.ttlSeconds * 1000;
  const now = Date.now();
  return now < expiresAt;
}

/**
 * Immutability gate: verify packet_key stability in Redis cache.
 *
 * If the same packetKey is read from Redis multiple times,
 * both values must have identical packet_key, source_ref, feature_id, workspace_id.
 */
export function verifyPacketKeyImmutability(
  packet1: SemanticPacketDomainObject,
  packet2: SemanticPacketDomainObject
): { isImmutable: boolean; reason?: string } {
  if (packet1.packetKey !== packet2.packetKey) {
    return {
      isImmutable: false,
      reason: `packet_key changed: ${packet1.packetKey} → ${packet2.packetKey}`,
    };
  }

  if (packet1.sourceRef !== packet2.sourceRef) {
    return {
      isImmutable: false,
      reason: `source_ref changed: ${packet1.sourceRef} → ${packet2.sourceRef}`,
    };
  }

  if (packet1.featureId !== packet2.featureId) {
    return {
      isImmutable: false,
      reason: `feature_id changed: ${packet1.featureId} → ${packet2.featureId}`,
    };
  }

  if (packet1.workspaceId !== packet2.workspaceId) {
    return {
      isImmutable: false,
      reason: `workspace_id changed: ${packet1.workspaceId} → ${packet2.workspaceId}`,
    };
  }

  // Mutable fields MAY change:
  // - contentHash (content version)
  // - treeNodeId (structural metadata)
  // - cachedAt, ttlSeconds (cache metadata)

  return { isImmutable: true };
}
