#!/usr/bin/env node

/**
 * SOURCE-EVIDENCE-AUTHORITY-01 selector proof (pure fixture matrix).
 *
 * Proves the SELECTOR LOGIC ITSELF against constructed fixtures -- no
 * database, no Graphify execution, no writes. The live selector
 * (select-current-source-evidence-authority-v1.mts) replays this same
 * pure logic against real data separately.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { selectCurrentSourceRun, validateSourcePopulation } from './lib/current-source-evidence-authority-selector.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outPath = path.join(root, 'docs', 'reports', 'current-source-evidence-authority-selector-proof-v1.json');
const sha256 = (v) => `sha256:${crypto.createHash('sha256').update(v, 'utf8').digest('hex')}`;

const CURRENT = {
  workspaceId: 'ws-current',
  workspaceRevision: 'sha256:' + 'a'.repeat(64),
  sourceManifestDigest: 'a'.repeat(64),
};
const STALE_REVISION = 'sha256:' + 'b'.repeat(64);
const STALE_DIGEST = 'b'.repeat(64);

function run(overrides) {
  return {
    run_id: 'run-default',
    workspace_id: CURRENT.workspaceId,
    status: 'COMPLETED',
    workspace_revision: CURRENT.workspaceRevision,
    source_manifest_digest: CURRENT.sourceManifestDigest,
    file_row_count: 5,
    ...overrides,
  };
}

const cases = [];
function expect(name, actual, expected) {
  cases.push({ name, actual, expected, pass: actual === expected });
}

// 1. completed, exact current binding -> SELECT
{
  const runs = [run({ run_id: 'r1' })];
  const result = selectCurrentSourceRun(runs, CURRENT);
  expect('completed_exact_current_binding_select', result.status, 'CANDIDATE_SELECTED');
  expect('completed_exact_current_binding_select_id', result.selectedRunId, 'r1');
}

// 2. completed, stale workspace -> REJECT
{
  const runs = [run({ run_id: 'r2', workspace_revision: STALE_REVISION, source_manifest_digest: STALE_DIGEST })];
  const result = selectCurrentSourceRun(runs, CURRENT);
  expect('completed_stale_workspace_reject', result.status, 'NO_CURRENT_COMPLETED_BOUND_SOURCE_OWNER');
  expect('completed_stale_workspace_reject_reason', result.classified[0].reasons.includes('STALE_WORKSPACE_REVISION'), true);
}

// 3. completed, unbound -> REJECT
{
  const runs = [run({ run_id: 'r3', file_row_count: 0 })];
  const result = selectCurrentSourceRun(runs, CURRENT);
  expect('completed_unbound_reject', result.status, 'NO_CURRENT_COMPLETED_BOUND_SOURCE_OWNER');
  expect('completed_unbound_reject_reason', result.classified[0].reasons.includes('UNBOUND_NEVER_SOURCE_AUTHORITY'), true);
}

// 4. running, exact binding -> REJECT (RUNNING never outranks, even with exact identity)
{
  const runs = [run({ run_id: 'r4', status: 'RUNNING' })];
  const result = selectCurrentSourceRun(runs, CURRENT);
  expect('running_exact_binding_reject', result.status, 'NO_CURRENT_COMPLETED_BOUND_SOURCE_OWNER');
  expect('running_exact_binding_reject_reason', result.classified[0].reasons.includes('RUNNING_NEVER_SOURCE_AUTHORITY'), true);
}

// 5. running, unbound -> REJECT
{
  const runs = [run({ run_id: 'r5', status: 'RUNNING', file_row_count: 0 })];
  const result = selectCurrentSourceRun(runs, CURRENT);
  expect('running_unbound_reject', result.status, 'NO_CURRENT_COMPLETED_BOUND_SOURCE_OWNER');
}

// 6. two exact completed candidates -> AMBIGUOUS, FAIL CLOSED (never latest-by-timestamp)
{
  const runs = [run({ run_id: 'r6a' }), run({ run_id: 'r6b' })];
  const result = selectCurrentSourceRun(runs, CURRENT);
  expect('two_exact_completed_ambiguous', result.status, 'AMBIGUOUS_CURRENT_SOURCE_OWNER');
  expect('two_exact_completed_ambiguity_count', result.ambiguityCount, 2);
  expect('two_exact_completed_no_selection', result.selectedRunId, null);
}

// 7. workspace_id mismatch -> REJECT even with matching revision/digest
{
  const runs = [run({ run_id: 'r7', workspace_id: 'ws-other' })];
  const result = selectCurrentSourceRun(runs, CURRENT);
  expect('workspace_id_mismatch_reject', result.status, 'NO_CURRENT_COMPLETED_BOUND_SOURCE_OWNER');
  expect('workspace_id_mismatch_reason', result.classified[0].reasons.includes('WORKSPACE_ID_MISMATCH'), true);
}

// 8. empty source population -> REJECT (run-level, after selection)
{
  const validation = validateSourcePopulation([]);
  expect('empty_source_population_reject', validation.status, 'EMPTY_SOURCE_POPULATION');
  expect('empty_source_population_invalid_flag', validation.valid, false);
}

// 9. missing sourceRevision -> REJECT (run-level)
{
  const validation = validateSourcePopulation([{ source_ref: 'a.ts', source_revision: null, content_hash: null }]);
  expect('missing_source_revision_reject', validation.status, 'SOURCE_POPULATION_INVALID');
  expect('missing_source_revision_count', validation.missingSourceRevisionCount, 1);
}

// 10. synthetic/malformed revision -> REJECT (run-level)
{
  const validation = validateSourcePopulation([{ source_ref: 'a.ts', source_revision: 'sha256:not-a-real-hash', content_hash: null }]);
  expect('synthetic_revision_reject', validation.status, 'SOURCE_POPULATION_INVALID');
  expect('synthetic_revision_count', validation.syntheticRevisionCount, 1);
}

// 10b. content_hash disagrees with sourceRevision -> also synthetic/REJECT
{
  const validation = validateSourcePopulation([{ source_ref: 'a.ts', source_revision: `sha256:${'c'.repeat(64)}`, content_hash: 'd'.repeat(64) }]);
  expect('mismatched_content_hash_reject', validation.status, 'SOURCE_POPULATION_INVALID');
  expect('mismatched_content_hash_count', validation.syntheticRevisionCount, 1);
}

// 11. valid, well-formed, agreeing population -> VALID (positive control)
{
  const digest = 'e'.repeat(64);
  const validation = validateSourcePopulation([{ source_ref: 'a.ts', source_revision: `sha256:${digest}`, content_hash: digest }]);
  expect('valid_population_positive_control', validation.status, 'SOURCE_POPULATION_VALID');
  expect('valid_population_source_count', validation.sourceCount, 1);
}

// 12. duplicate sourceRef within one run -> REJECT
{
  const digest = 'f'.repeat(64);
  const validation = validateSourcePopulation([
    { source_ref: 'a.ts', source_revision: `sha256:${digest}`, content_hash: digest },
    { source_ref: 'a.ts', source_revision: `sha256:${digest}`, content_hash: digest },
  ]);
  expect('duplicate_source_ref_reject', validation.status, 'SOURCE_POPULATION_INVALID');
  expect('duplicate_source_ref_count', validation.duplicateSourceRefCount, 1);
}

// 13. deterministic replay: same fixture input selects the same run and produces the same classification every time
{
  const runs = [run({ run_id: 'r13' })];
  const a = selectCurrentSourceRun(runs, CURRENT);
  const b = selectCurrentSourceRun(runs, CURRENT);
  expect('deterministic_replay', JSON.stringify(a) === JSON.stringify(b), true);
}

const failed = cases.filter((c) => !c.pass);
const proof = {
  schema: 'atlas.current-source-evidence-authority-selector-proof.v1',
  gate: 'SOURCE-EVIDENCE-AUTHORITY-01',
  mode: 'PURE_FIXTURE_NO_DATABASE',
  status: failed.length === 0 ? 'SELECTOR_PROVEN' : 'SELECTOR_PROOF_FAILED',
  totalCases: cases.length,
  passedCases: cases.length - failed.length,
  failedCases: failed,
  cases,
  canonicalAuthority: false,
  writesPerformed: false,
};
proof.proofChecksum = sha256(JSON.stringify(cases));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: proof.status, totalCases: proof.totalCases, passedCases: proof.passedCases, failedCases: failed.map((c) => c.name), out: outPath }, null, 2));
if (proof.status !== 'SELECTOR_PROVEN') process.exit(1);
