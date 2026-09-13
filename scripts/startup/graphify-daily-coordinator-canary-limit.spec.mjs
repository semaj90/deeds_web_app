import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', '..', 'sveltekit-frontend', 'scripts', 'atlas', 'graphify-daily-coordinator-canary-v1.mts'), 'utf8');

test('bounded canary accepts an explicit limit and caps it at 50', () => {
  assert.match(source, /--limit=/);
  assert.match(source, /requestedLimit < 1 \|\| requestedLimit > 50/);
  assert.match(source, /rootSources\.slice\(0, requestedLimit\)/);
});

test('bounded canary readback compares against the requested limit', () => {
  assert.match(source, /Number\(row\.file_count\) === expectedCount/);
  assert.doesNotMatch(source, /file_count\) === 3/);
});

test('full mode fails closed until downstream stage owners and completion semantics are bound', () => {
  assert.match(source, /process\.argv\.includes\('--full'\)/);
  assert.match(source, /GRAPHIFY_COORDINATOR_CANARY_FULL_MODE_BLOCKED_PENDING_STAGE_OWNER_BINDING/);
  assert.doesNotMatch(source, /AUTHORIZE_GRAPHIFY_FULL_WORKSPACE_SOURCE_SELECTION_V1/);
  assert.doesNotMatch(source, /snapshot\.sources\s*:\s*rootSources\.slice/);
  assert.match(source, /canonicalPromotionMayBeAttempted: false/);
  assert.match(source, /broadGraphifyRun: false/);
});
