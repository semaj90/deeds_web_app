import crypto from 'node:crypto';

const clean = (value) => String(value ?? '').trim() || null;
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validRevision = (value) => /^sha256:[0-9a-f]{64}$/i.test(clean(value) ?? '');

function result(input, classification, canonicalSourceRef = null, binding = null, reason = classification) {
  const accepted = ['EXACT', 'CONTENT_PROVEN', 'EXPLICIT_ALIAS'].includes(classification);
  const row = {
    schema: 'atlas.canonical-source-binding.v1',
    packetSourceRef: clean(input.packetSourceRef),
    canonicalSourceRef: clean(canonicalSourceRef),
    bindingKind: accepted ? classification : null,
    classification,
    workspaceRevision: clean(binding?.workspaceRevision),
    sourceRevision: clean(binding?.sourceRevision),
    contentDigest: clean(binding?.contentDigest),
    evidenceRefs: [...new Set((binding?.evidenceRefs ?? input.evidenceRefs ?? []).map(clean).filter(Boolean))].sort(),
    bindingRevision: clean(input.bindingRevision) ?? 'canonical-source-binding:v1',
    canonicalAuthority: accepted,
    reason,
  };
  return { ...row, checksum: digest(row) };
}

/** Resolve one packet/source locator against current revision-qualified observations. */
export function resolveCanonicalSourceBinding({
  packetSourceRef,
  packetContentDigest = null,
  currentWorkspaceRevision,
  observations = [],
  approvedAliases = new Map(),
  bindingRevision = 'canonical-source-binding:v1',
  evidenceRefs = [],
} = {}) {
  const input = { packetSourceRef, evidenceRefs, bindingRevision };
  const current = clean(currentWorkspaceRevision);
  if (!validRevision(current)) return result(input, 'WORKSPACE_MISMATCH', null, null, 'current workspace revision must be sha256:<digest>');
  const packetRef = clean(packetSourceRef);
  if (!packetRef) return result(input, 'UNRESOLVED', null, null, 'packet source reference is empty');
  const rows = observations.filter((row) => clean(row.sourceRef) && validRevision(row.workspaceRevision) && row.workspaceRevision === current);
  const byRef = rows.filter((row) => clean(row.sourceRef) === packetRef);
  if (byRef.length > 1) return result(input, 'AMBIGUOUS', null, null, 'multiple current observations for exact source reference');
  if (byRef.length === 1) return result(input, 'EXACT', packetRef, byRef[0], 'exact current source reference');

  const aliasTarget = typeof approvedAliases.get === 'function' ? approvedAliases.get(packetRef) : null;
  if (aliasTarget) {
    const aliasRows = rows.filter((row) => clean(row.sourceRef) === clean(aliasTarget));
    if (aliasRows.length > 1) return result(input, 'AMBIGUOUS', null, null, 'approved alias resolves to multiple current observations');
    if (aliasRows.length === 1) return result(input, 'EXPLICIT_ALIAS', aliasTarget, aliasRows[0], 'approved alias to unique current source');
  }

  const content = clean(packetContentDigest);
  if (content) {
    const contentRows = rows.filter((row) => clean(row.contentDigest) === content);
    if (contentRows.length > 1) return result(input, 'AMBIGUOUS', null, null, 'content digest matches multiple current sources');
    if (contentRows.length === 1) return result(input, 'CONTENT_PROVEN', contentRows[0].sourceRef, contentRows[0], 'unique exact content digest bridge');
  }
  return result(input, 'UNRESOLVED', null, null, 'no exact, approved alias, or unique content-proven current binding');
}

export function checksumCanonicalSourceBindings(bindings = []) {
  return digest([...bindings].map((row) => ({
    packetSourceRef: clean(row.packetSourceRef), canonicalSourceRef: clean(row.canonicalSourceRef),
    bindingKind: clean(row.bindingKind), workspaceRevision: clean(row.workspaceRevision), sourceRevision: clean(row.sourceRevision),
    contentDigest: clean(row.contentDigest), checksum: clean(row.checksum),
  })).sort((a, b) => `${a.packetSourceRef}|${a.canonicalSourceRef}`.localeCompare(`${b.packetSourceRef}|${b.canonicalSourceRef}`)));
}
