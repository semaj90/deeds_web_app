/**
 * Packet Identity Bridge
 *
 * Pure functions for normalizing, indexing, and resolving canonical packet identities.
 * Used by: registry alignment audit, materialization, validation.
 */

export function normalizeAtlasSourceRef(value) {
  return String(value ?? '')
    .trim()
    .replace(/^local:/i, '')
    .replace(/#L\d+(?:-L?\d+)?$/i, '')
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '');
}

/**
 * Build in-memory indexes for fast identity lookups.
 * Detects ambiguous source_refs (multiple packets per ref).
 */
export function buildPacketIdentityIndexes(rows) {
  const byPacketKey = new Map();
  const bySourceRef = new Map();
  const ambiguousSourceRefs = new Set();

  for (const row of rows) {
    const packetKey = String(row.packet_key ?? '').trim();
    const sourceRef = normalizeAtlasSourceRef(
      row.canonical_source_ref ??
      row.source_ref_key ??
      row.source_ref,
    );

    if (packetKey) {
      byPacketKey.set(packetKey, row);
    }

    if (!sourceRef) continue;

    if (bySourceRef.has(sourceRef)) {
      bySourceRef.delete(sourceRef);
      ambiguousSourceRefs.add(sourceRef);
      continue;
    }

    if (!ambiguousSourceRefs.has(sourceRef)) {
      bySourceRef.set(sourceRef, row);
    }
  }

  return {
    byPacketKey,
    bySourceRef,
    ambiguousSourceRefs,
  };
}

/**
 * Resolve a single registry row to a canonical packet identity.
 * Returns match with method (packet_key exact, source_ref fallback, or unmatched).
 */
export function resolvePacketIdentity(
  registryRow,
  indexes,
) {
  const sourceRefs =
    Array.isArray(registryRow.sourceRefs)
      ? registryRow.sourceRefs
      : [];

  const canonicalRefs =
    sourceRefs
      .map(normalizeAtlasSourceRef)
      .filter(Boolean);

  // Never silently pick first when multiple exist
  for (const sourceRef of canonicalRefs) {
    if (indexes.ambiguousSourceRefs.has(sourceRef)) {
      return {
        match: null,
        method: 'ambiguous_source_ref',
        sourceRef,
      };
    }

    const match = indexes.bySourceRef.get(sourceRef);

    if (match) {
      return {
        match,
        method: 'canonical_source_ref',
        sourceRef,
      };
    }
  }

  return {
    match: null,
    method: 'unmatched',
    sourceRef: canonicalRefs[0] ?? null,
  };
}

/**
 * Batch resolve registry rows to packet identities.
 * Returns resolution summary.
 */
export function resolveRegistryRows(registryRows, packetIndexes) {
  const results = {
    resolved: [],
    ambiguous: [],
    unmatched: [],
  };

  for (const registryRow of registryRows) {
    const resolution = resolvePacketIdentity(registryRow, packetIndexes);

    if (resolution.match) {
      results.resolved.push({
        registryRow,
        packetRow: resolution.match,
        method: resolution.method,
      });
    } else if (resolution.method === 'ambiguous_source_ref') {
      results.ambiguous.push({
        registryRow,
        sourceRef: resolution.sourceRef,
      });
    } else {
      results.unmatched.push({
        registryRow,
        sourceRef: resolution.sourceRef,
      });
    }
  }

  return results;
}
