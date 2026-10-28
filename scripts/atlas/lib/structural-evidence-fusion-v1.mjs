/**
 * Agreement-based fusion of structural observations from several parsers (pure, read-only, proposal-only).
 *
 * This is NOT retrieval fusion (SearchRuntime owns RRF) and NOT score averaging: structural facts are exact, so sources either agree on
 * the same byte-addressed fact or they do not. Each observation is { source, kind, name, startByte, endByte? }. Facts are keyed by
 * (kind, name, startByte). Every source belongs to an independence group; two sources in the same group (for example ast-grep CLI and the
 * repo's ast-grep napi libraries, which load the same tree-sitter grammar) count as ONE witness, never as agreement.
 *
 * The key also carries sourceRef and sourceDigest when supplied, so facts from different files or different bytes never merge.
 * Native kinds go through the reviewed KIND_NORMALIZATION map.
 *
 * Status per fact:
 *   AGREED_INDEPENDENT  at least two distinct independence groups report the fact (and no conflicting end span)
 *   SINGLE_GROUP        only one group reports it (may still come from several sources in that group)
 *   CONFLICT            sources report the same key with different end spans
 * Nothing here creates identity, a confidence number, or authority. A fused fact is still proposal-only.
 */
/** Reviewed map from producer-native node kinds to one semantic role. An unknown native kind is rejected, never guessed. */
export const KIND_NORMALIZATION = Object.freeze({
  RUNE_CALL: 'RUNE_CALL',
  import_statement: 'IMPORT_DECLARATION', ImportDeclaration: 'IMPORT_DECLARATION',
  function_declaration: 'FUNCTION_DECLARATION', generator_function_declaration: 'FUNCTION_DECLARATION', FunctionDeclaration: 'FUNCTION_DECLARATION',
});
export const normalizeKind = (nativeKind) => {
  if (!Object.hasOwn(KIND_NORMALIZATION, nativeKind)) throw new RangeError(`UNREVIEWED_NATIVE_KIND ${nativeKind}`);
  return KIND_NORMALIZATION[nativeKind];
};

export const FUSION_STATUSES = Object.freeze(['AGREED_INDEPENDENT', 'SINGLE_GROUP', 'CONFLICT']);

export function fuseObservations(observations, { groupOf }) {
  if (typeof groupOf !== 'function') throw new TypeError('groupOf(source) is required: independence must be declared, not assumed');
  const facts = new Map();
  for (const o of observations) {
    if (!Number.isInteger(o.startByte) || o.startByte < 0) throw new RangeError(`INVALID_START_BYTE from ${o.source}`);
    const kind = o.nativeKind !== undefined ? normalizeKind(o.nativeKind) : o.kind;
    const sourceRef = o.sourceRef ?? null;
    const sourceDigest = o.sourceDigest ?? null;
    const key = [sourceRef, sourceDigest, kind, o.name, o.startByte].join('\u0000');
    if (!facts.has(key)) facts.set(key, { sourceRef, sourceDigest, kind, name: o.name, startByte: o.startByte, sources: new Set(), groups: new Set(), ends: new Map() });
    const f = facts.get(key);
    f.sources.add(o.source);
    f.groups.add(groupOf(o.source));
    if (Number.isInteger(o.endByte)) {
      if (!f.ends.has(o.endByte)) f.ends.set(o.endByte, new Set());
      f.ends.get(o.endByte).add(o.source);
    }
  }
  const fused = [...facts.values()].map((f) => {
    const endSpans = [...f.ends.keys()].sort((a, b) => a - b);
    const status = endSpans.length > 1 ? 'CONFLICT' : f.groups.size >= 2 ? 'AGREED_INDEPENDENT' : 'SINGLE_GROUP';
    return {
      sourceRef: f.sourceRef, sourceDigest: f.sourceDigest, kind: f.kind, name: f.name, startByte: f.startByte, endByte: endSpans.length === 1 ? endSpans[0] : null,
      status, sources: [...f.sources].sort(), independentGroups: [...f.groups].sort(),
      conflictingEnds: status === 'CONFLICT' ? endSpans.map((e) => ({ endByte: e, sources: [...f.ends.get(e)].sort() })) : undefined,
      proposalOnly: true, canonicalAuthority: false,
    };
  });
  fused.sort((a, b) => a.startByte - b.startByte || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  const byStatus = {};
  for (const f of fused) byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
  return { schema: 'atlas.structural-evidence-fusion.v1', facts: fused, byStatus, proposalOnly: true, canonicalAuthority: false, writesPerformed: false };
}
