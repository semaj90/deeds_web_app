/**
 * Revision-qualified validation for derived Karpathy/PageRank evidence.
 * This module is pure: it performs no I/O and never authorizes a write.
 */

export function parseQualifiedKarpathyScore(raw) {
  if (raw == null) return null;
  let value = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { return null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const score = Number(value.blend);
  const workspaceRevision = String(value.workspaceRevision ?? '');
  const sourceCohortChecksum = String(value.sourceCohortChecksum ?? '');
  const graphRevision = String(value.graphRevision ?? '');
  const featureRevision = String(value.featureRevision ?? '');
  const artifactChecksum = String(value.artifactChecksum ?? '');
  if (!Number.isFinite(score) || score < 0 || score > 1) return null;
  if (!/^sha256:[0-9a-f]{64}$/i.test(workspaceRevision)) return null;
  if (!/^[0-9a-f]{64}$/i.test(sourceCohortChecksum)) return null;
  if (!graphRevision || !featureRevision || !/^[0-9a-f]{64}$/i.test(artifactChecksum)) return null;
  return { score, workspaceRevision, sourceCohortChecksum, graphRevision, featureRevision, artifactChecksum };
}

export function hasQualifiedTraceEnvelope(result) {
  if (!result || typeof result !== 'object') return false;
  const revisions = result.evidenceRevisions ?? {};
  const workspaceRevision = result.workspaceRevision ?? revisions.workspaceRevision;
  const sourceRevision = result.sourceRevision ?? revisions.sourceRevision;
  const representationRevision = result.representationRevision ?? revisions.representationRevision;
  const graphRevision = result.graphRevision ?? revisions.graphRevision;
  const featureRevision = result.featureRevision ?? revisions.featureRevision;
  const artifactChecksum = result.artifactChecksum;
  return Boolean(
    /^sha256:[0-9a-f]{64}$/i.test(String(workspaceRevision ?? '')) &&
    /^sha256:[0-9a-f]{64}$/i.test(String(sourceRevision ?? '')) &&
    String(representationRevision ?? '').length > 0 &&
    String(graphRevision ?? '').length > 0 &&
    String(featureRevision ?? '').length > 0 &&
    /^[0-9a-f]{64}$/i.test(String(artifactChecksum ?? ''))
  );
}
