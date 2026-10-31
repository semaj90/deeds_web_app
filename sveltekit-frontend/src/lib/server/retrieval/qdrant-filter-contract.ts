export const ATLAS_SYSTEM_RECORD_KEY = '_atlas_system_record';

/** Adds the administrative-record exclusion to object-style Qdrant filters. */
export function buildAtlasQdrantFilter(filters: Record<string, unknown> = {}) {
  if (Array.isArray(filters.must) || Array.isArray(filters.must_not) || Array.isArray(filters.should)) {
    const existingMust = Array.isArray(filters.must) ? filters.must : [];
    const existingMustNot = Array.isArray(filters.must_not) ? filters.must_not : [];
    const existingShould = Array.isArray(filters.should) ? filters.should : undefined;
    return {
      ...(existingShould ? { should: existingShould } : {}),
      must: existingMust,
      must_not: [
        ...existingMustNot,
        { key: ATLAS_SYSTEM_RECORD_KEY, match: { value: true } },
      ],
    };
  }

  const must = Object.entries(filters).map(([key, value]) => ({
    key,
    match: Array.isArray(value) ? { any: value } : { value },
  }));

  return {
    must,
    must_not: [{ key: ATLAS_SYSTEM_RECORD_KEY, match: { value: true } }],
  };
}

