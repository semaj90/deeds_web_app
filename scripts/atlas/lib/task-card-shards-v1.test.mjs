import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTaskCardCorpusV1, writeTaskCardShardsV1 } from './openspec-task-card-v1.mjs';

test('task-card shards round-trip deterministically and reject altered shard bytes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'task-card-shards-'));
  try {
    const output = join(directory, 'cards.json');
    const report = {
      schema: 'atlas.openspec-task-card-corpus.v1',
      cardSchema: 'atlas.openspec-task-card.v1',
      source: { workspaceHead: 'fixture-head', workspaceRevision: 'sha256:workspace' },
      summary: { taskCount: 12 },
      cards: Array.from({ length: 12 }, (_, index) => ({ stableKey: `task:${index}`, detail: 'x'.repeat(180) })),
    };
    const first = writeTaskCardShardsV1(report, output, 1100);
    const loaded = loadTaskCardCorpusV1(output);
    assert.equal(loaded.cards.length, 12);
    assert.deepEqual(loaded.cards, report.cards);
    assert.ok(first.shardCount > 1);
    assert.deepEqual(writeTaskCardShardsV1(report, output, 1100), first);

    const manifest = JSON.parse(readFileSync(output, 'utf8'));
    const shardPath = join(directory, manifest.shards[0].path);
    writeFileSync(shardPath, `${readFileSync(shardPath, 'utf8')} `);
    assert.throws(() => loadTaskCardCorpusV1(output), /TASK_CARD_SHARD_CHECKSUM_MISMATCH/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
