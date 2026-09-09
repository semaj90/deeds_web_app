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
  assert.match(source, /origin\.bindings\.slice\(0, requestedLimit\)/);
});

test('bounded canary readback compares against the requested limit', () => {
  assert.match(source, /Number\(row\.file_count\) === expectedCount/);
  assert.doesNotMatch(source, /file_count\) === 3/);
});

test('full mode requires its distinct authorization and selects the complete manifest', () => {
  assert.match(source, /AUTHORIZE_GRAPHIFY_FULL_WORKSPACE_SOURCE_SELECTION_V1/);
  assert.match(source, /fullMode \? origin\.bindings : origin\.bindings\.slice/);
  assert.match(source, /fullMode \? 'graphify-current-workspace-source-selection:v1'/);
  assert.match(source, /canonicalPromotionMayBeAttempted: false/);
});
