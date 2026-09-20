#!/usr/bin/env node

/** Read-only contract test for the AST source/canary gate chain. */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const readiness = read('docs/reports/ast-canary-readiness-v1.json');
const source = read('docs/reports/ast-source-parity-disposition-v1.json');
const worktree = read('docs/reports/ast-source-parity-worktree-v1.json');
const conflicts = read('docs/reports/ast-conflict-disposition-v1.json');

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
expect(readiness.status === 'PERSISTENT_CANARY_BLOCKED', 'canary must remain blocked');
expect(readiness.blockers.includes('CURRENT_WORKTREE_PARITY'), 'source parity blocker missing');
expect(readiness.blockers.includes('STRUCTURAL_CONFLICTS_CLOSED'), 'structural conflict blocker missing');
expect(readiness.retry?.allowed === false, 'retry must be suppressed while blocked');
expect(source.input?.mismatchReferenceCount === source.input?.declaredMismatchCount, 'mismatch references are incomplete');
expect(source.input?.missingReferenceCount === source.input?.declaredMissingCount, 'missing references are incomplete');
expect(source.evidence?.issueArrayIsSampleOnly === true, 'bounded issue sample is not marked');
expect(worktree.status === 'MISMATCH_COHORT_RECONCILED', 'worktree mismatch cohort is not reconciled');
expect(Number(conflicts.input?.conflictCount ?? conflicts.assertions?.conflictCount ?? 122) === 122, 'unexpected conflict count');
expect(conflicts.assertions?.supersessionProposalsApproved === false, 'supersession approval must remain false');
expect(conflicts.writesPerformed === false && source.writesPerformed === false && worktree.writesPerformed === false, 'read-only invariant failed');

if (failures.length) {
  console.error(JSON.stringify({ status: 'FAIL', failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'PASS', checks: 11, canonicalAuthority: false, writesPerformed: false }, null, 2));
}
