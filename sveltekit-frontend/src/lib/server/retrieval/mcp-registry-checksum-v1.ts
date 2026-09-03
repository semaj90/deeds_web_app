import { createHash } from 'node:crypto';

/**
 * MCP-TOOL-REGISTRY-REVISION-01 checksum primitives.
 *
 * Every identity/authority value in mcp-tool-registry-types-v1.ts (serverAuthorityFingerprint,
 * toolSurfaceRevision, toolPolicyRevision, registryRevision, discoveredAtRevision,
 * toolSchemaDigest, observationsDigest) is collision-sensitive and must use real cryptographic
 * sha256 -- NOT the FNV-1a hash mcp-tool-viterbi-bridge-v1.ts's existing checksum() uses for its
 * non-authority proposalChecksum. Keep that FNV-1a helper where it is; do not touch it or its
 * proven 3/3 spec. Everything new in this gate uses sha256Hex() below.
 */

/** Deterministic, recursively key-sorted JSON serialization. Neither existing checksum
 * implementation in this repo sorts object keys, so their outputs are construction-order
 * fragile -- this fixes that for every new checksum computed in this gate. Arrays are NOT
 * reordered (order is semantic for tool lists / observation frames); only object keys are sorted. */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Convenience: canonicalize then hash in one step. */
export function sha256OfValue(value: unknown): string {
  return sha256Hex(canonicalJsonStringify(value));
}

/**
 * serverAuthorityId = sha256(logical server key + transport type + endpoint/socket + trust/policy
 * identity), per the operator's explicit formula -- never derived from serverInfo.name alone,
 * since MCP does not guarantee that field is globally unique.
 *
 * Returns BOTH a human-readable alias (parent-atlas:mcp:<slug>, derived from logicalServerKey,
 * not from the hash) for the public MCPToolRefV1 coordinate, and the raw sha256 fingerprint (for
 * collision detection between two configured servers that might otherwise resolve to the same
 * alias) -- see MCPToolSurfaceRevisionV1.serverAuthorityFingerprint.
 */
export function deriveServerAuthorityId(input: {
  logicalServerKey: string;
  transportType: 'stdio' | 'streamable-http';
  endpointOrSocket: string;
  trustPolicyIdentity: string;
}): { serverAuthorityId: string; serverAuthorityFingerprint: string } {
  const slug = input.logicalServerKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) throw new Error('MCP_SERVER_AUTHORITY_LOGICAL_KEY_REQUIRED');

  const fingerprint = sha256Hex(canonicalJsonStringify({
    logicalServerKey: input.logicalServerKey,
    transportType: input.transportType,
    endpointOrSocket: input.endpointOrSocket,
    trustPolicyIdentity: input.trustPolicyIdentity,
  }));

  return {
    serverAuthorityId: `parent-atlas:mcp:${slug}`,
    serverAuthorityFingerprint: fingerprint,
  };
}

/**
 * Normalizes a JSON Schema object (MCP tool inputSchema/outputSchema) before hashing: recursively
 * sorts object keys and any `required` array. Explicitly does NOT touch or include MCP tool
 * `annotations` -- those are a separate, untrusted field per spec and must never enter any digest
 * this module produces, so callers must pass only the schema object itself, never the whole tool
 * definition.
 */
export function canonicalizeJsonSchema(schema: unknown): unknown {
  return sortSchemaDeep(schema);
}

function sortSchemaDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortSchemaDeep);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const child = record[key];
      sorted[key] = key === 'required' && Array.isArray(child)
        ? [...child].sort()
        : sortSchemaDeep(child);
    }
    return sorted;
  }
  return value;
}

/** sha256 of a canonicalized JSON Schema -- the digest MCPToolSurfaceEntryV1 stores. */
export function schemaDigest(schema: unknown): string {
  return sha256Hex(canonicalJsonStringify(canonicalizeJsonSchema(schema)));
}
