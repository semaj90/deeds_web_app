import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildPhase19SeedProposalsV1 } from './phase19-retrieval-loop-seed.mjs';

const script = fileURLToPath(new URL('./phase19-retrieval-loop-seed.mjs', import.meta.url));

test('missing values stay unknown and no cosine, reward or learned score is invented', () => {
  const [proposal] = buildPhase19SeedProposalsV1([{ card_id: 'card:one' }], []);
  assert.equal(proposal.sourceRef, null);
  assert.equal(proposal.observedScore, null);
  assert.equal(proposal.trainingEligible, false);
  assert.equal(proposal.canonicalAuthority, false);
  assert.equal(proposal.event_type, 'seed_proposal');
  assert.ok(!('cosine_sim' in proposal));
  assert.ok(!('score' in proposal));
  assert.ok(!('feedback' in proposal));
});

test('preserves supplied observations but does not promote them', () => {
  const first = buildPhase19SeedProposalsV1([{ card_id: 'c', score: 0 }], [{ card_id: 'c', sourceRef: 'fixture/source.ts' }]);
  const second = buildPhase19SeedProposalsV1([{ card_id: 'c', score: 0 }], [{ card_id: 'c', sourceRef: 'fixture/source.ts' }]);
  assert.deepEqual(first, second);
  assert.equal(first[0].observedScore, 0);
  assert.equal(first[0].sourceRef, 'fixture/source.ts');
  assert.equal(first[0].sourceAuthorityStatus, 'NOT_ESTABLISHED');
});

test('rejects missing/duplicate identity, source conflicts and invalid observations', () => {
  for (const rows of [[{}], [{ card_id: ' ' }], [{ card_id: 'c' }, { card_id: 'c' }]]) {
    assert.throws(() => buildPhase19SeedProposalsV1(rows, []), /INVALID_PHASE18_IDENTITY/);
  }
  assert.throws(() => buildPhase19SeedProposalsV1([{ card_id: 'c' }], [{ card_id: 'c' }, { card_id: 'c' }]), /INVALID_PHASE17_IDENTITY/);
  assert.throws(() => buildPhase19SeedProposalsV1([{ card_id: 'c', sourceRef: 'one' }], [{ card_id: 'c', sourceRef: 'two' }]), /SOURCE_REF_CONFLICT/);
  for (const score of [NaN, Infinity, '0.8']) {
    assert.throws(() => buildPhase19SeedProposalsV1([{ card_id: 'c', score }], []), /INVALID_SCORE_OBSERVATION/);
  }
});

test('bounded batches reject invalid limits', () => {
  for (const limit of [NaN, 0, -1, 2001, 1.5]) {
    assert.throws(() => buildPhase19SeedProposalsV1([{ card_id: 'c' }], [], limit), /INVALID_BATCH_LIMIT/);
  }
  assert.equal(buildPhase19SeedProposalsV1([{ card_id: 'a' }, { card_id: 'b' }], [], 1).length, 1);
});

test('CLI blocks default and apply before opening any input', () => {
  for (const args of [[], ['--apply'], ['--dry-run', '--apply']]) {
    const result = spawnSync(process.execPath, [script, ...args, '--phase18-input=missing'], { encoding: 'utf8', timeout: 10000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PHASE19_SEED_APPLY_BLOCKED_USE_DRY_RUN/);
    assert.doesNotMatch(result.stderr, /ENOENT/);
  }
});

test('actual dry-run preserves exact input checksums and writes no feedback files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-phase19-preview-'));
  const phase18 = join(directory, 'phase18.jsonl');
  const phase17 = join(directory, 'phase17.jsonl');
  writeFileSync(phase18, '{"card_id":"c","score":0.4}', { flag: 'wx' });
  writeFileSync(phase17, '{"card_id":"c","sourceRef":"fixture/source.ts"}', { flag: 'wx' });
  const before = readdirSync(directory).sort();
  const result = spawnSync(process.execPath, [script, '--dry-run', `--phase18-input=${phase18}`, `--phase17-input=${phase17}`],
    { cwd: directory, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  const preview = JSON.parse(result.stdout);
  assert.equal(preview.status, 'PROPOSALS_ONLY_APPLY_BLOCKED');
  assert.equal(preview.writesPerformed, false);
  assert.equal(preview.trainingEligible, false);
  assert.equal(preview.phase18InputChecksum, `sha256:${createHash('sha256').update(readFileSync(phase18)).digest('hex')}`);
  assert.equal(preview.phase17InputChecksum, `sha256:${createHash('sha256').update(readFileSync(phase17)).digest('hex')}`);
  assert.deepEqual(readdirSync(directory).sort(), before);
});
