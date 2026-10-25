import { createHash } from 'node:crypto';

const normalizeRef = (value) => String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
const normalizeDigest = (value) => String(value ?? '').trim().replace(/^sha256:/i, '').toLowerCase();
const text = (value) => value === null || value === undefined ? null : String(value);
const hash = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

export function reconcileSelectedSourceManifestV1({ admission, selectionPlan, snapshot }) {
  const bindings = Array.isArray(selectionPlan?.bindings) ? selectionPlan.bindings : [];
  const sources = Array.isArray(snapshot?.sources) ? snapshot.sources : [];
  const identityKey = (row) => `${normalizeRef(row.repositoryId)}:${normalizeRef(row.repositoryRelativePath ?? row.sourceRef)}`;
  const snapshotByIdentity = new Map(sources.map((row) => [identityKey(row), row]));
  const keys = bindings.map(identityKey);
  const sourceRefs = bindings.map((row) => normalizeRef(row.sourceRef));
  const rows = bindings.map((binding) => ({
    repositoryId: normalizeRef(binding.repositoryId),
    repositoryRelativePath: normalizeRef(binding.repositoryRelativePath ?? binding.sourceRef),
    sourceRef: normalizeRef(binding.sourceRef),
    sourceRevision: text(binding.codeSourceRevision),
    contentDigest: normalizeDigest(binding.contentHash),
    byteLength: Number(binding.byteLength),
  }));
  const checks = {
    planSchema: selectionPlan?.schema === 'atlas.graphify-source-selection-plan.v1',
    planReady: selectionPlan?.status === 'SOURCE_SELECTION_PLAN_READY_NOT_ADMITTED',
    admissionReady: admission?.status === 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' && admission?.authority === true,
    snapshotRevisionMatches: selectionPlan?.snapshotRevision === admission?.snapshotRevision
      && snapshot?.snapshotRevision === admission?.snapshotRevision,
    selectionCountMatches: rows.length > 0 && rows.length === selectionPlan?.sourceCount && rows.length === admission?.sourceCount,
    selectionChecksumMatches: selectionPlan?.sourceSelectionChecksum === admission?.sourceSelectionChecksum
      && selectionPlan?.sourceSelectionChecksum === hash(JSON.stringify([...keys].sort())),
    uniqueSourceIdentities: new Set(keys).size === keys.length,
    uniqueSourceRefs: new Set(sourceRefs).size === sourceRefs.length,
    everyBindingMatchesSnapshot: bindings.every((binding) => {
      const source = snapshotByIdentity.get(identityKey(binding));
      return Boolean(source)
        && normalizeRef(binding.sourceRef) === normalizeRef(source.sourceRef)
        && text(binding.codeSourceRevision) === text(source.sourceRevision)
        && normalizeDigest(binding.contentHash) === normalizeDigest(source.contentDigest)
        && Number(binding.byteLength) === Number(source.byteLength);
    }),
  };
  return { valid: Object.values(checks).every(Boolean), checks, rows };
}
