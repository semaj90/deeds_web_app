import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCohortCrosswalkV1 } from './build-cohort-6527-crosswalk-v1.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('TASK-01: Cohort 6527 crosswalk maps every ordinal to a unique canonical_task_key without synthetic IDs', () => {
  const receipt = buildCohortCrosswalkV1();

  assert.equal(receipt.schema, 'atlas.openspec-cohort-6527-crosswalk.v1');
  assert.equal(receipt.canonicalAuthority, false);
  assert.equal(receipt.writesPerformed, false);
  assert.equal(receipt.reconciliationStats.totalCohortOrdinals, 6527);
  assert.equal(receipt.invariants.primaryKeyUniqueCount, 6527);
  assert.equal(receipt.invariants.canonicalTaskKeyUniqueCount, 6527);
  assert.equal(receipt.invariants.zeroSyntheticOrdinalIdsMinted, true);

  // Sum of join categories equals 6,527
  const s = receipt.reconciliationStats;
  assert.equal(
    s.exactSourceLineJoin + s.shiftedLineStableKeyJoin + s.secondaryOpenSpecRoot + s.newSinceWorkboardSnapshot,
    6527
  );

  // Sum of community route statuses equals 6,527
  assert.equal(
    s.communityStatusCounts.CONFIGURED +
      s.communityStatusCounts.UNAVAILABLE_SCRIPT_MISSING +
      s.communityStatusCounts.UNROUTED,
    6527
  );

  // Verify JSONL artifact exists and has 6,527 rows with zero task:ordinal:* IDs
  const jsonlPath = resolve(REPO_ROOT, receipt.membersArtifact.path);
  assert.ok(existsSync(jsonlPath), 'Members JSONL artifact must exist');

  const lines = readFileSync(jsonlPath, 'utf8').trim().split('\n');
  assert.equal(lines.length, 6527);

  for (let i = 0; i < lines.length; i++) {
    const row = JSON.parse(lines[i]);
    assert.equal(row.task_ordinal, i);
    assert.ok(!row.canonical_task_key.startsWith('task:ordinal:'), `Synthetic ID forbidden at ordinal ${i}`);
    assert.ok(row.canonical_task_key.includes('#'), `Canonical key must be <change>#<hash> at ordinal ${i}`);
    assert.ok(row.source_claim_hash.startsWith('sha256:'), `Claim hash must be sha256 at ordinal ${i}`);
  }
});
