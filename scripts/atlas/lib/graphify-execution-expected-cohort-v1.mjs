import { createHash } from 'node:crypto';

const sha256 = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const sortedConcatChecksum = (values) => sha256([...values].sort().join(''));
const unprefix = (value) => String(value).replace(/^sha256:/, '');

export function resolveGraphifyExecutionExpectedCohortV1({ admission, snapshot, hygiene }) {
  if (admission?.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true) {
    throw new Error('ADMITTED_WORKSPACE_REVISION_REQUIRED');
  }
  if (snapshot?.snapshotRevision !== admission.snapshotRevision || !Array.isArray(snapshot.sources)) {
    throw new Error('ADMITTED_SNAPSHOT_REVISION_MISMATCH');
  }
  if (hygiene?.schema !== 'atlas.canonical-source-inventory-hygiene.v1'
    || hygiene.status !== 'SOURCE_INVENTORY_HYGIENE_PASS'
    || hygiene.authority !== false
    || hygiene.canonicalAuthority !== false
    || hygiene.writesPerformed !== false
    || hygiene.datastoreWritesPerformed !== false) {
    throw new Error('SOURCE_SELECTION_HYGIENE_NOT_QUALIFIED');
  }
  if (hygiene.snapshotRevision !== admission.snapshotRevision
    || hygiene.snapshotMembershipChecksum !== snapshot.sourceMembershipChecksum
    || hygiene.snapshotMembershipChecksum !== admission.snapshotMembershipChecksum
    || hygiene.sourceInventoryChecksum !== admission.sourceInventoryChecksum
    || hygiene.sourceSelectionChecksum !== admission.sourceSelectionChecksum) {
    throw new Error('SOURCE_SELECTION_HYGIENE_ADMISSION_MISMATCH');
  }

  const selectedEntries = hygiene.canonicalSources;
  if (!Array.isArray(selectedEntries)
    || selectedEntries.length !== hygiene.canonicalSourceCount
    || selectedEntries.length !== admission.sourceCount) {
    throw new Error('SOURCE_SELECTION_COHORT_COUNT_MISMATCH');
  }
  const selectedIdentityKeys = selectedEntries.map((entry) => String(entry.sourceIdentityKey ?? ''));
  if (selectedIdentityKeys.some((key) => !key) || new Set(selectedIdentityKeys).size !== selectedIdentityKeys.length) {
    throw new Error('SOURCE_SELECTION_IDENTITY_KEYS_INVALID');
  }
  if (sha256(JSON.stringify([...selectedIdentityKeys].sort())) !== admission.sourceSelectionChecksum) {
    throw new Error('SOURCE_SELECTION_CHECKSUM_MISMATCH');
  }

  const selectedByIdentity = new Map(selectedEntries.map((entry) => [entry.sourceIdentityKey, entry]));
  const sources = snapshot.sources.filter((source) => selectedByIdentity.has(source.sourceIdentityKey));
  if (sources.length !== selectedEntries.length) throw new Error('SOURCE_SELECTION_MEMBER_MISSING_FROM_SNAPSHOT');
  const sourceByIdentity = new Map(sources.map((source) => [source.sourceIdentityKey, source]));
  for (const entry of selectedEntries) {
    const source = sourceByIdentity.get(entry.sourceIdentityKey);
    if (!source
      || source.sourceRevision !== entry.sourceRevision
      || unprefix(source.contentDigest) !== unprefix(entry.contentDigest)
      || Number(source.byteLength) !== Number(entry.byteLength)) {
      throw new Error(`SOURCE_SELECTION_SNAPSHOT_BINDING_MISMATCH:${entry.sourceIdentityKey}`);
    }
  }

  const refs = sources.map((source) => String(source.sourceRef));
  const identityKeys = sources.map((source) => String(source.sourceIdentityKey));
  return {
    sources,
    sourceByRef: new Map(sources.map((source) => [String(source.sourceRef), source])),
    expectedSourceCount: sources.length,
    expectedRefChecksum: sortedConcatChecksum(refs),
    expectedIdentityChecksum: sortedConcatChecksum(identityKeys),
    expectedContentChecksum: sha256(JSON.stringify(sources.map((source) => [
      source.sourceIdentityKey,
      source.sourceRevision,
      source.byteLength,
    ]))),
  };
}
