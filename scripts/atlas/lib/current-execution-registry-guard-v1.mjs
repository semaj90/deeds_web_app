const pathKey = (value) => String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
const normalizedPathKey = (value) => pathKey(value);
const digestKey = (value) => String(value ?? '').trim().toLowerCase().replace(/^sha256:/, '');

export function classifyCurrentExecutionRegistryCoverageV1(rootMembers, registryRows) {
  const exact = new Map();
  const normalized = new Map();
  for (const row of registryRows) {
    const key = pathKey(row.source_ref_key);
    const normalizedKey = normalizedPathKey(row.source_ref_key);
    if (!exact.has(key)) exact.set(key, []);
    exact.get(key).push(row);
    for (const value of [row.source_ref_key, row.relative_path].filter(Boolean)) {
      const aliasKey = normalizedPathKey(value);
      if (!normalized.has(aliasKey)) normalized.set(aliasKey, []);
      const group = normalized.get(aliasKey);
      if (!group.includes(row)) group.push(row);
    }
  }

  const eligibleSourceRefs = [];
  const missingSourceRefs = [];
  const pathMismatches = [];
  const ambiguousSourceRefs = [];
  const unqualifiedSourceRefs = [];
  const digestMismatches = [];
  const sourceTypeMissing = [];

  for (const member of rootMembers) {
    const sourceRef = pathKey(member.repository_relative_path);
    const exactRows = exact.get(sourceRef) ?? [];
    if (exactRows.length > 1) {
      ambiguousSourceRefs.push(sourceRef);
      continue;
    }
    if (exactRows.length !== 1) {
      const aliases = normalized.get(normalizedPathKey(sourceRef)) ?? [];
      if (aliases.length > 1) {
        ambiguousSourceRefs.push(sourceRef);
        continue;
      }
      if (aliases.length === 1) pathMismatches.push(sourceRef);
      else missingSourceRefs.push(sourceRef);
      continue;
    }

    const row = exactRows[0];
    if (row.source_type == null || String(row.source_type).trim() === '') sourceTypeMissing.push(sourceRef);
    const wholeFile = pathKey(row.relative_path) === sourceRef
      && row.qualified_symbol == null
      && row.start_byte == null
      && row.end_byte == null;
    if (!wholeFile) {
      unqualifiedSourceRefs.push(sourceRef);
      continue;
    }
    if (digestKey(row.content_hash) !== digestKey(member.content_hash)) {
      digestMismatches.push(sourceRef);
      continue;
    }
    if (row.source_type == null || String(row.source_type).trim() === '') continue;
    eligibleSourceRefs.push(sourceRef);
  }

  const safeToApply = missingSourceRefs.length === 0
    && pathMismatches.length === 0
    && ambiguousSourceRefs.length === 0
    && unqualifiedSourceRefs.length === 0
    && digestMismatches.length === 0
    && sourceTypeMissing.length === 0;
  return {
    safeToApply,
    eligibleSourceRefs,
    missingSourceRefs,
    pathMismatches,
    ambiguousSourceRefs,
    unqualifiedSourceRefs,
    digestMismatches,
    sourceTypeMissing,
  };
}
