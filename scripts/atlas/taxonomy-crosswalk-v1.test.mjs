import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFrozenTaxonomySnapshotV1,
  crosswalkLegacyLabelsV1,
  FROZEN_DOMAIN_TAXONOMY_V1_ORDER,
} from './taxonomy-crosswalk-v1.mjs';

test('frozen 17-entry taxonomy snapshot keeps 13 top-level and 4 child IDs distinct with stable non-alphabetical ordinals', () => {
  const snap = buildFrozenTaxonomySnapshotV1();
  assert.equal(snap.totalCount, 17);
  assert.equal(snap.topLevelCount, 13);
  assert.equal(snap.childCount, 4);
  assert.equal(snap.entries[0].domainId, 'api');
  assert.equal(snap.entries[0].ordinal, 0);
  assert.equal(snap.entries[16].domainId, 'frontend.sveltekit');
  assert.equal(snap.entries[16].ordinal, 16);

  // Reversed registry order must produce a different taxonomyRevision checksum
  const reversed = buildFrozenTaxonomySnapshotV1([...FROZEN_DOMAIN_TAXONOMY_V1_ORDER].reverse());
  assert.notEqual(reversed.taxonomyRevision, snap.taxonomyRevision);
});

test('crosswalk handles exact, case-only, unresolved legacy labels, ambiguous mappings, and conservation checks', () => {
  const snap = buildFrozenTaxonomySnapshotV1();
  const res = crosswalkLegacyLabelsV1({
    snapshot: snap,
    observedLabels: [
      { label: 'graph', sourceTable: 'atlas_packets', rowId: 'r1' },
      { label: 'Database.PostgreSQL', sourceTable: 'atlas_packets', rowId: 'r2' },
      { label: 'documentation', sourceTable: 'atlas_packets', rowId: 'r3' },
      { label: 'tool', sourceTable: 'atlas_packets', rowId: 'r4' },
      { label: 'agent', sourceTable: 'atlas_packets', rowId: 'r5' },
      { label: 'Other', sourceTable: 'atlas_packets', rowId: 'r6' },
      { label: 'ambig_label', sourceTable: 'atlas_packets', rowId: 'r7' },
      { label: 'pg_vector', sourceTable: 'atlas_packets', rowId: 'r8' },
    ],
    reviewerMappings: {
      ambig_label: ['frontend', 'api'],
      pg_vector: 'database.postgresql',
    },
  });

  assert.equal(res.status, 'CROSSWALK_VALIDATED');
  assert.equal(res.conservationPassed, true);
  assert.deepEqual(res.counts, {
    total: 8,
    exact: 1,
    caseOnly: 1,
    proposed: 1,
    unresolved: 4,
    ambiguous: 1,
  });
  assert.equal(res.proposals[1].status, 'CASE_ONLY');
  assert.equal(res.proposals[1].originalLabel, 'Database.PostgreSQL');
  assert.equal(res.proposals[1].normalizedLabel, 'database.postgresql');
  // Legacy labels must remain UNRESOLVED unless explicitly mapped
  for (const idx of [2, 3, 4, 5]) {
    assert.equal(res.proposals[idx].status, 'UNRESOLVED');
    assert.equal(res.proposals[idx].targetDomainId, null);
  }
  assert.equal(res.proposals[6].status, 'AMBIGUOUS');
  assert.deepEqual(res.proposals[6].candidates, ['frontend', 'api']);
  assert.equal(res.canonicalAuthority, false);
  assert.equal(res.writesPerformed, false);
});

test('crosswalk rejects taxonomy revision mismatch deterministically', () => {
  const res = crosswalkLegacyLabelsV1({
    observedLabels: ['graph'],
    expectedTaxonomyRevision: `sha256:${'f'.repeat(64)}`,
  });
  assert.equal(res.status, 'REVISION_MISMATCH');
  assert.equal(res.failure, 'TAXONOMY_REVISION_MISMATCH');
  assert.equal(res.conservationPassed, false);
});
