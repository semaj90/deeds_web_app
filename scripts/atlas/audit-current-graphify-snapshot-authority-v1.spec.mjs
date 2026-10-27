import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('./audit-current-graphify-snapshot-authority-v1.mts', import.meta.url), 'utf8');

test('snapshot authority audit requires explicit database configuration and read-only SQL', () => {
  assert.match(source, /resolveDatabaseUrl\(loadRepoEnv\(process\.env\)\)/);
  assert.match(source, /client\.query\('BEGIN READ ONLY'\)/);
  assert.match(source, /client\.query\('ROLLBACK'\)/);
  assert.doesNotMatch(source, /postgres(?:ql)?:\/\/[^\s'"`]+@/i);
});

test('optional audit receipts are restricted to the scratch Atlas directory', () => {
  assert.match(source, /process\.argv\.findIndex\(\(arg\) => arg === '--report-dir' \|\| arg\.startsWith\('--report-dir='\)\)/);
  assert.match(source, /slice\('--report-dir='\.length\)/);
  assert.match(source, /REPORT_DIR_REQUIRED/);
  assert.match(source, /REPORT_DIR_MUST_BE_UNDER_TMP_ATLAS/);
  assert.match(source, /resolve\(root, '\.tmp\/atlas'\)/);
});

test('snapshot authority compares execution membership with the admitted selected cohort', () => {
  assert.match(source, /reconcileSelectedSourceManifestV1\(\{ admission, selectionPlan, snapshot \}\)/);
  assert.match(source, /members\.length === selectedPlanBindings\.length/);
  assert.match(source, /sourceRefSetChecksum === selectedSourceRefChecksum/);
  assert.doesNotMatch(source, /members\.length === workspace\.sourceCount/);
});
