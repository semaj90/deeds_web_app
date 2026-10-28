/**
 * Agreement-based fusion of structural observations from several parsers (pure, read-only, proposal-only).
 *
 * This is NOT retrieval fusion (SearchRuntime owns RRF) and NOT score averaging: structural facts are exact, so sources either agree on
 * the same byte-addressed fact or they do not. Each observation is { source, kind, name, startByte, endByte? }. Facts are keyed by
 * (kind, name, startByte). Every source belongs to an independence group; two sources in the same group (for example ast-grep CLI and the
 * repo's ast-grep napi libraries, which load the same tree-sitter grammar) count as ONE witness, never as agreement.
 *
 * Status per fact:
 *   AGREED_INDEPENDENT  at least two distinct independence groups report the fact (and no conflicting end span)
 *   SINGLE_GROUP        only one group reports it (may still come from several sources in that group)
 *   CONFLICT            sources report the same key with different end spans
 * Nothing here creates identity, a confidence number, or authority. A fused fact is still proposal-only.
 */
export const FUSION_STATUSES = Object.freeze(['AGREED_INDEPENDENT', 'SINGLE_GROUP', 'CONFLICT']);

export function fuseObservations(observations, { groupOf }) {
  if (typeof groupOf !== 'function') throw new TypeError('groupOf(source) is required: independence must be declared, not assumed');
  const facts = new Map();
  for (const o of observations) {
    if (!Number.isInteger(o.startByte) || o.startByte < 0) throw new RangeError(`INVALID_START_BYTE from ${o.source}`);
    const key = `${o.kind}\u0000${o.name}\u0000${o.startByte}`;
    if (!facts.has(key)) facts.set(key, { kind: o.kind, name: o.name, startByte: o.startByte, sources: new Set(), groups: new Set(), ends: new Map() });
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
      kind: f.kind, name: f.name, startByte: f.startByte, endByte: endSpans.length === 1 ? endSpans[0] : null,
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
