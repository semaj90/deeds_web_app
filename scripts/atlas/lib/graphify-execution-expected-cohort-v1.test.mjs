import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { resolveGraphifyExecutionExpectedCohortV1 } from './graphify-execution-expected-cohort-v1.mjs';

const digest = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const selected = [
  { sourceIdentityKey: 'repo:root:src/a.ts', sourceRef: 'src/a.ts', sourceRevision: digest('a'), contentDigest: digest('a').slice(7), byteLength: 1 },
  { sourceIdentityKey: 'repo:root:src/b.ts', sourceRef: 'src/b.ts', sourceRevision: digest('b'), contentDigest: digest('b').slice(7), byteLength: 1 },
];
const excluded = { sourceIdentityKey: 'repo:root:.tmp/noise.json', sourceRef: '.tmp/noise.json', sourceRevision: digest('x'), contentDigest: digest('x').slice(7), byteLength: 1 };
const snapshot = {
  snapshotRevision: digest('snapshot'),
  sourceMembershipChecksum: digest('membership'),
  sources: [...selected, excluded],
};
const admission = {
  status: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED', authority: true,
  snapshotRevision: snapshot.snapshotRevision,
  snapshotMembershipChecksum: snapshot.sourceMembershipChecksum,
  sourceInventoryChecksum: digest('inventory'),
  sourceSelectionChecksum: digest(JSON.stringify(selected.map((source) => source.sourceIdentityKey).sort())),
  sourceCount: selected.length,
};
const hygiene = {
  schema: 'atlas.canonical-source-inventory-hygiene.v1',
  status: 'SOURCE_INVENTORY_HYGIENE_PASS', authority: false,
  canonicalAuthority: false, writesPerformed: false, datastoreWritesPerformed: false,
  snapshotRevision: snapshot.snapshotRevision,
  snapshotMembershipChecksum: snapshot.sourceMembershipChecksum,
  sourceInventoryChecksum: admission.sourceInventoryChecksum,
  sourceSelectionChecksum: admission.sourceSelectionChecksum,
  canonicalSourceCount: selected.length,
  canonicalSources: selected.map(({ sourceIdentityKey, sourceRevision, contentDigest, byteLength }) => ({ sourceIdentityKey, sourceRevision, contentDigest, byteLength })),
};

test('uses the admitted canonical subset, not every candidate in the sealed snapshot', () => {
  const cohort = resolveGraphifyExecutionExpectedCohortV1({ admission, snapshot, hygiene });
  assert.equal(snapshot.sources.length, 3);
  assert.equal(cohort.expectedSourceCount, 2);
  assert.deepEqual(cohort.sources.map((source) => source.sourceRef), ['src/a.ts', 'src/b.ts']);
  assert.equal(cohort.sourceByRef.has(excluded.sourceRef), false);
});

test('rejects stale hygiene selection receipts', () => {
  assert.throws(() => resolveGraphifyExecutionExpectedCohortV1({
    admission,
    snapshot,
    hygiene: { ...hygiene, sourceSelectionChecksum: digest('stale') },
  }), /SOURCE_SELECTION_HYGIENE_ADMISSION_MISMATCH/);
});

test('rejects selected rows whose revisions or bytes disagree with the sealed snapshot', () => {
  const mismatched = {
    ...hygiene,
    canonicalSources: hygiene.canonicalSources.map((entry) => entry.sourceIdentityKey === selected[0].sourceIdentityKey
      ? { ...entry, sourceRevision: digest('changed') }
      : entry),
  };
  assert.throws(() => resolveGraphifyExecutionExpectedCohortV1({ admission, snapshot, hygiene: mismatched }), /SOURCE_SELECTION_SNAPSHOT_BINDING_MISMATCH/);
});

test('rejects duplicate canonical identities despite a matching row count', () => {
  const duplicate = {
    ...hygiene,
    canonicalSources: [hygiene.canonicalSources[0], hygiene.canonicalSources[0]],
  };
  assert.throws(() => resolveGraphifyExecutionExpectedCohortV1({ admission, snapshot, hygiene: duplicate }), /SOURCE_SELECTION_IDENTITY_KEYS_INVALID/);
});
