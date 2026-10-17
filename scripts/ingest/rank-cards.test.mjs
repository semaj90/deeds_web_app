import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('./rank-cards.mjs', import.meta.url));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-card-rank-'));
  const cards = join(root, 'cards');
  const embeddings = join(root, '.opencode', 'embeddings');
  mkdirSync(cards);
  mkdirSync(embeddings, { recursive: true });
  for (const id of ['b', 'a']) {
    const cardPath = join(cards, `${id}.json`);
    writeFileSync(cardPath, JSON.stringify({ id, title: 'Fixture card', source: 'fixture/source.ts', text: 'Fixture explanation.' }), { flag: 'wx' });
    utimesSync(cardPath, 1000, 1000);
  }
  writeFileSync(join(embeddings, 'a.json'), JSON.stringify({ id: 'a', vector: Array(768).fill(1) }), { flag: 'wx' });
  return { root, cards };
}

test('legacy cache and missing vector remain missing semantic signals in a no-write preview', () => {
  const { root, cards } = fixture();
  const before = readdirSync(root).sort();
  const result = spawnSync(process.execPath, [script, '--dry-run', '--top', '2'], {
    cwd: root, env: { ...process.env, NESCHROM_DIR: root }, encoding: 'utf8', timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const line = result.stdout.split(/\r?\n/).find((item) => item.startsWith('ATLAS_RANKING_PREVIEW='));
  assert.ok(line, result.stdout);
  const report = JSON.parse(line.slice('ATLAS_RANKING_PREVIEW='.length));
  assert.equal(report.modelRequestsPerformed, false);
  assert.equal(report.writesPerformed, false);
  assert.equal(report.promotionEligible, false);
  assert.deepEqual(report.ranked.map((card) => card.id), ['a', 'b']);
  assert.ok(report.ranked.every((card) => card.signals.semantic === null && card.signals.semanticPresence === false));
  assert.equal(report.ranked[0].signals.semanticStatus, 'UNQUALIFIED_LEGACY_CACHE');
  assert.equal(report.ranked[1].signals.semanticStatus, 'MISSING_VECTOR');
  assert.ok(report.ranked.every((card) => card.trainingEligible === false && card.canonicalAuthority === false));
  assert.deepEqual(readdirSync(root).sort(), before);
  assert.deepEqual(readdirSync(cards).sort(), ['a.json', 'b.json']);
});

test('default/apply calls reject instead of writing a ranking artifact', () => {
  const { root } = fixture();
  for (const args of [[], ['--apply'], ['--dry-run', '--apply']]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd: root, env: { ...process.env, NESCHROM_DIR: root }, encoding: 'utf8', timeout: 10000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /LEGACY_CARD_RANKING_APPLY_BLOCKED_USE_DRY_RUN/);
  }
  assert.deepEqual(readdirSync(root).sort(), ['.opencode', 'cards']);
});

test('invalid requested candidate count rejects', () => {
  const { root } = fixture();
  for (const limit of ['0', '-1', '6000', 'NaN']) {
    const result = spawnSync(process.execPath, [script, '--dry-run', '--top', limit], {
      cwd: root, env: { ...process.env, NESCHROM_DIR: root }, encoding: 'utf8', timeout: 10000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /INVALID_CARD_RANKING_BATCH_LIMIT/);
  }
});
