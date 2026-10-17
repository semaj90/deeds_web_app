import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { excludedWeightObservationV1, feedbackCardIdsV1 } from './token-card-weight-updater.mjs';

const script = fileURLToPath(new URL('./token-card-weight-updater.mjs', import.meta.url));

test('feedback ID lists use the declared envelope without accessing a missing payload', () => {
  assert.deepEqual(feedbackCardIdsV1({ card_ids: ['a', 'b', 'a'] }), ['a', 'b']);
  assert.deepEqual(feedbackCardIdsV1({ payload: { card_ids: ['a', 'b'] } }), ['a', 'b']);
  assert.deepEqual(feedbackCardIdsV1({ payload: { card_id: 'a' } }), ['a']);
  assert.deepEqual(feedbackCardIdsV1({ card_id: 'a', payload: { card_id: 'other' } }), ['a']);
  assert.deepEqual(feedbackCardIdsV1({ card_ids: [null] }), []);
});

test('synthetic seeds and explicit non-training flags cannot enter the weight sketch', () => {
  for (const event of [
    { retrieval_mode: 'phase19-seed' }, { event_type: 'seed_proposal' },
    { schema: 'atlas.retrieval-seed-proposal.v1' }, { trainingEligible: false },
    { trainingEligible: true, payload: { trainingEligible: false } },
    { payload: { retrieval_mode: 'phase19-seed' } },
  ]) assert.equal(excludedWeightObservationV1(event), true);
  assert.equal(excludedWeightObservationV1({ card_id: 'a' }), false);
});

test('default, apply and Redis options fail before inputs or services are accessed', () => {
  for (const args of [[], ['--apply'], ['--redis'], ['--dry-run', '--redis']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 10000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /WEIGHT_UPDATE_APPLY_BLOCKED_USE_OFFLINE_DRY_RUN/);
  }
});

test('actual offline preview excludes a legacy seed and handles multi-card feedback without writes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-weight-preview-'));
  const temp = join(directory, '.tmp');
  mkdirSync(temp);
  writeFileSync(join(temp, 'atlas-retrieval-loop.jsonl'), JSON.stringify({ card_id: 'seed', retrieval_mode: 'phase19-seed', score: 0.99 }), { flag: 'wx' });
  writeFileSync(join(temp, 'feedback-events.jsonl'), JSON.stringify({ card_ids: ['a', 'b'], thumbs_up: 1 }), { flag: 'wx' });
  const before = readdirSync(temp).sort();
  const result = spawnSync(process.execPath, [script, '--dry-run'], { cwd: directory, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  const preview = JSON.parse(result.stdout);
  assert.equal(preview.writesPerformed, false);
  assert.equal(preview.trainingEligible, false);
  assert.equal(preview.excludedObservations, 1);
  assert.deepEqual(preview.records.map((record) => record.card_id).sort(), ['a', 'b']);
  assert.ok(preview.records.every((record) => record.trainingEligible === false && record.promotionEligible === false));
  assert.deepEqual(readdirSync(temp).sort(), before);
  assert.deepEqual(readdirSync(directory), ['.tmp']);
});

test('malformed existing JSONL fails instead of silently dropping feedback', () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-weight-invalid-'));
  mkdirSync(join(directory, '.tmp'));
  writeFileSync(join(directory, '.tmp', 'feedback-events.jsonl'), 'invalid JSON', { flag: 'wx' });
  const result = spawnSync(process.execPath, [script, '--dry-run'], { cwd: directory, encoding: 'utf8', timeout: 10000 });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
});
