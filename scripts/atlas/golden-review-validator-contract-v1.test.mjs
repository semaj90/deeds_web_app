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
      }));
      return {
        schema: lane === 'queue' ? 'atlas.golden-relevance-review-item.v1' : 'atlas.golden-relevance-review-pool-item.v1',
        queryPacketKey: `query:${index}`, queryText: 'Fixture query', querySourceRef: 'fixture/query.ts',
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
    return { report, args, output };
  }

  test(`${lane}: valid declared human metadata is counted without authorizing import`, () => {
    const { report } = run();
    assert.equal(report.errors.length, 0);
    assert.equal(report.completedJudgmentCount ?? report.completedGradeCount, lane === 'queue' ? 4 : 240);
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
