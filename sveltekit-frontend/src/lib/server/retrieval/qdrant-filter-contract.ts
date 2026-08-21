export const ATLAS_SYSTEM_RECORD_KEY = '_atlas_system_record';

/** Adds the administrative-record exclusion to object-style Qdrant filters. */
export function buildAtlasQdrantFilter(filters: Record<string, unknown> = {}) {
  const must = Object.entries(filters).map(([key, value]) => ({
    key,
    match: Array.isArray(value) ? { any: value } : { value },
  }));

  return {
    must,
    must_not: [{ key: ATLAS_SYSTEM_RECORD_KEY, match: { value: true } }],
  };
}

