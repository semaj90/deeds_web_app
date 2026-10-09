import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadTaskTriageCorpusV1, writeTaskTriageShardsV1 } from './openspec-task-triage-shards-v1.mjs';

function corpusFixture(cardCount = 40) {
  return {
    schema: 'atlas.openspec-task-triage-corpus.v1',
    generatedAt: '2026-10-09T00:00:00.000Z',
    workspaceHead: 'fixture-head',
    taskPopulationRevision: 'sha256:population',
    taskCardCorpus: {
      schema: 'atlas.openspec-task-card-corpus.v1',
      source: { workspaceHead: 'fixture-head', workspaceRevision: 'sha256:workspace' },
      summary: { taskCount: cardCount },
      cards: Array.from({ length: cardCount }, (_, index) => ({
        stableKey: `task-${String(index).padStart(3, '0')}`,
        sourcePath: 'openspec/change/tasks.md',
        sourceLine: index + 1,
        taskRevision: `sha256:task-${index}`,
        detail: 'bounded fixture task evidence '.repeat(8),
      })),
    },
    reportManifestCorpus: { schema: 'atlas.report-artifact-manifest-corpus.v1', artifacts: [], summary: { artifactCount: 0 } },
    supersessionLinks: [],
    retrievalPolicy: { defaultStates: ['CURRENT'], historyOnlyStates: [] },
    summary: { taskCount: cardCount, reportArtifactCount: 0, canonicalAuthority: false, mutationAuthorized: false },
    writesPerformed: false,
  };
}

test('shards oversized triage rows and reconstructs the same logical corpus', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'atlas-triage-shards-'));
  try {
    const output = path.join(directory, 'triage.json');
    const source = corpusFixture();
    const result = writeTaskTriageShardsV1(source, output, 1200);
    const repeated = writeTaskTriageShardsV1(source, output, 1200);
    const readback = loadTaskTriageCorpusV1(output);
    assert.deepEqual(repeated, result);
    assert.equal(result.rowCount, source.taskCardCorpus.cards.length);
    assert.ok(result.shardCount > 1);
    assert.ok(result.manifestBytes < 10_000_000);
    assert.deepEqual(readback, source);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects a modified triage shard on independent readback', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'atlas-triage-shards-tamper-'));
  try {
    const output = path.join(directory, 'triage.json');
    writeTaskTriageShardsV1(corpusFixture(4), output, 1200);
    const manifest = JSON.parse(readFileSync(output, 'utf8'));
    const shardPath = path.resolve(path.dirname(output), manifest.shards[0].path);
    writeFileSync(shardPath, `${readFileSync(shardPath, 'utf8')}tampered\n`);
    assert.throws(() => loadTaskTriageCorpusV1(output), /TRIAGE_SHARD_CHECKSUM_MISMATCH/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
