import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const human = { relevanceGrade: 0, confidence: 0.9, reviewerId: 'fixture-reviewer', judgmentSource: 'HUMAN_REVIEWED', isHardNegative: true };

for (const lane of ['queue', 'pool']) {
  function run(patch = {}) {
    const directory = mkdtempSync(join(tmpdir(), `atlas-golden-${lane}-`));
    const input = join(directory, 'input.ndjson');
    const output = join(directory, 'receipt.json');
    const rows = Array.from({ length: lane === 'pool' ? 60 : 1 }, (_, index) => {
      const candidates = [0, 1, 2, 3].map((grade) => ({
        ...human, relevanceGrade: grade, isHardNegative: grade === 0,
        ...patch, packetKey: `packet:${grade}`, candidateId: `packet:${grade}`,
        sourceRef: `fixture/${grade}.ts`, summary: 'Fixture evidence', rank: grade + 1,
        workspaceRevision: `sha256:${'a'.repeat(64)}`, sourceRevision: `sha256:${'b'.repeat(64)}`,
        evidenceRefs: [`fixture/${grade}.ts#L1-L2`],
      }));
      return {
        schema: lane === 'queue' ? 'atlas.golden-relevance-review-item.v1' : 'atlas.golden-relevance-review-pool-item.v1',
        queryPacketKey: `query:${index}`, queryText: 'Fixture query', querySourceRef: 'fixture/query.ts',
        workspaceRevision: `sha256:${'a'.repeat(64)}`, sourceRevision: `sha256:${'b'.repeat(64)}`,
        embeddingModel: 'embeddinggemma:latest', representation: 'semantic_768',
        ...(lane === 'queue' ? { judgments: candidates } : { candidates }),
      };
    });
    const contents = rows.map((row) => JSON.stringify(row)).join('\n');
    writeFileSync(input, contents, { flag: 'wx' });
    const args = [`scripts/atlas/validate-golden-relevance-review-${lane}-v1.mjs`, input, `--output=${output}`];
    const process = spawnSync(globalThis.process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 15000 });
    assert.ifError(process.error);
    const report = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(report.inputChecksum, `sha256:${createHash('sha256').update(contents).digest('hex')}`);
    assert.equal(report.importAllowed, false);
    assert.equal(report.canonicalAuthority, false);
    if (lane === 'queue') {
      assert.equal(report.status, 'INCOMPLETE_FAIL_CLOSED');
      assert.equal(report.reviewedLabelFloor.met, false);
    }
    return { report, args, output };
  }

  test(`${lane}: valid declared human metadata is counted without authorizing import`, () => {
    const { report } = run();
    assert.equal(report.errors.length, 0);
    assert.equal(report.completedJudgmentCount ?? report.completedGradeCount, lane === 'queue' ? 4 : 240);
    if (lane === 'queue') {
      assert.deepEqual(report.validGradeCounts, { 0: 1, 1: 1, 2: 1, 3: 1 });
      assert.equal(report.revisionQualifiedJudgmentCount, 4);
      assert.equal(report.unqualifiedJudgmentCount, 0);
    }
  });

  for (const [label, patch] of [
    ['proxy source', { judgmentSource: 'MODEL_PROXY' }],
    ['whitespace reviewer', { reviewerId: '   ' }],
    ['nonfinite JSON number', { confidence: Infinity }],
    ['inconsistent hard negative', { relevanceGrade: 2, isHardNegative: true }],
  ]) {
    test(`${lane}: rejects ${label} without counting completed judgments`, () => {
      const { report } = run(patch);
      assert.equal(report.status, 'INCOMPLETE_FAIL_CLOSED');
      assert.equal(report.completedJudgmentCount ?? report.completedGradeCount, 0);
      assert.ok(report.errors.length > 0);
      assert.equal(report.invalidJudgmentCount ?? report.invalidGradeCount, lane === 'queue' ? 4 : 240);
    });
  }

  test(`${lane}: existing report cannot be overwritten`, () => {
    const { args, output } = run();
    const before = readFileSync(output, 'utf8');
    const retry = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 15000 });
    assert.notEqual(retry.status, 0);
    assert.match(retry.stderr, /EEXIST/);
    assert.equal(readFileSync(output, 'utf8'), before);
  });
}

test('queue: rejects an unbalanced cohort below the per-grade floor', () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-golden-floor-'));
  const input = join(directory, 'input.ndjson');
  const output = join(directory, 'receipt.json');
  const grades = [...Array(20).fill(0), ...Array(5).fill(1), ...Array(5).fill(2), ...Array(170).fill(3)];
  const rows = Array.from({ length: 50 }, (_, index) => ({
    schema: 'atlas.golden-relevance-review-item.v1', queryPacketKey: `query:${index}`,
    queryText: 'Fixture query', querySourceRef: 'fixture/query.ts',
    workspaceRevision: `sha256:${'a'.repeat(64)}`, sourceRevision: `sha256:${'b'.repeat(64)}`,
    judgments: grades.slice(index * 4, index * 4 + 4).map((grade, candidateIndex) => ({ ...human,
      relevanceGrade: grade, isHardNegative: grade === 0, packetKey: `packet:${index}:${candidateIndex}`,
      sourceRef: `fixture/${index}/${candidateIndex}.ts`, workspaceRevision: `sha256:${'a'.repeat(64)}`,
      sourceRevision: `sha256:${'b'.repeat(64)}`, evidenceRefs: [`fixture/${index}/${candidateIndex}.ts#L1-L2`] })),
  }));
  writeFileSync(input, rows.map((row) => JSON.stringify(row)).join('\n'), { flag: 'wx' });
  const result = spawnSync(globalThis.process.execPath, [
    'scripts/atlas/validate-golden-relevance-review-queue-v1.mjs', input, `--output=${output}`,
  ], { cwd: root, encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  const report = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(report.status, 'INCOMPLETE_FAIL_CLOSED');
  assert.equal(report.completedJudgmentCount, 200);
  assert.equal(report.reviewedLabelFloor.met, false);
  assert.equal(report.reviewedLabelFloor.gradeFloorMet, false);
  assert.deepEqual(report.validGradeCounts, { 0: 20, 1: 5, 2: 5, 3: 170 });
});

test('queue: requires 200 balanced judgments before independent import review', () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-golden-balanced-floor-'));
  const input = join(directory, 'input.ndjson');
  const output = join(directory, 'receipt.json');
  const rows = Array.from({ length: 50 }, (_, index) => ({
    schema: 'atlas.golden-relevance-review-item.v1', queryPacketKey: `query:${index}`,
    queryText: 'Fixture query', querySourceRef: 'fixture/query.ts',
    workspaceRevision: `sha256:${'a'.repeat(64)}`, sourceRevision: `sha256:${'b'.repeat(64)}`,
    judgments: Array.from({ length: 4 }, (_, grade) => ({ ...human, relevanceGrade: grade,
      isHardNegative: grade === 0, packetKey: `packet:${index}:${grade}`,
      sourceRef: `fixture/${index}/${grade}.ts`, workspaceRevision: `sha256:${'a'.repeat(64)}`,
      sourceRevision: `sha256:${'b'.repeat(64)}`, evidenceRefs: [`fixture/${index}/${grade}.ts#L1-L2`] })),
  }));
  writeFileSync(input, rows.map((row) => JSON.stringify(row)).join('\n'), { flag: 'wx' });
  const result = spawnSync(globalThis.process.execPath, [
    'scripts/atlas/validate-golden-relevance-review-queue-v1.mjs', input, `--output=${output}`,
  ], { cwd: root, encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  const report = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(report.status, 'READY_FOR_IMPORT_REVIEW');
  assert.equal(report.completedJudgmentCount, 200);
  assert.equal(report.reviewedLabelFloor.met, true);
  assert.equal(report.importAllowed, false);
  assert.equal(report.revisionQualifiedJudgmentCount, 200);
});

test('queue: human grades without source and evidence revisions are not training-eligible', () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-golden-unqualified-'));
  const input = join(directory, 'input.ndjson');
  const output = join(directory, 'receipt.json');
  const row = {
    schema: 'atlas.golden-relevance-review-item.v1', queryPacketKey: 'query:unqualified',
    queryText: 'Fixture query', querySourceRef: 'fixture/query.ts',
    workspaceRevision: `sha256:${'a'.repeat(64)}`, sourceRevision: `sha256:${'b'.repeat(64)}`,
    judgments: [0, 1, 2, 3].map((grade) => ({ ...human, relevanceGrade: grade, isHardNegative: grade === 0,
      packetKey: `packet:${grade}`, sourceRef: `fixture/${grade}.ts`, workspaceRevision: `sha256:${'a'.repeat(64)}`,
      sourceRevision: null, evidenceRefs: [] })),
  };
  writeFileSync(input, JSON.stringify(row), { flag: 'wx' });
  const result = spawnSync(process.execPath, [
    'scripts/atlas/validate-golden-relevance-review-queue-v1.mjs', input, `--output=${output}`,
  ], { cwd: root, encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  const report = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(report.completedJudgmentCount, 4);
  assert.equal(report.revisionQualifiedJudgmentCount, 0);
  assert.equal(report.unqualifiedJudgmentCount, 4);
  assert.equal(report.reviewedLabelFloor.met, false);
  assert.equal(report.status, 'INCOMPLETE_FAIL_CLOSED');
});
