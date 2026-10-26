import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { hashGoldenReviewCohortV1, readGoldenReviewValidationEvidenceV1 } from './lib/golden-review-journal-v1.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
function fixture(patch = {}, inputSuffix = '') {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-golden-readback-'));
  const inputPath = join(directory, 'queue.ndjson');
  const reportPath = join(directory, 'validation.json');
  const source = JSON.stringify({ schema: 'atlas.golden-relevance-review-item.v1', queryPacketKey: 'query:one',
    querySourceRef: 'fixture/query.ts', queryText: 'Fixture', judgments: [{ packetKey: 'packet:one', relevanceGrade: null }] });
  const receipt = {
    schema: 'atlas.golden-relevance-review-queue-validation-v1', inputPath,
    inputChecksum: hashGoldenReviewCohortV1(source), canonicalAuthority: false, importAllowed: false, databaseWrites: false,
    queryCount: 1, judgmentCount: 1, completedJudgmentCount: 0, blankJudgmentCount: 1,
    invalidJudgmentCount: 0, hardNegativeCount: 0, ...patch,
  };
  writeFileSync(inputPath, source + inputSuffix, { flag: 'wx' });
  writeFileSync(reportPath, JSON.stringify(receipt), { flag: 'wx' });
  return { directory, inputPath, reportPath, args: [`--golden-validation-report=${reportPath}`, `--golden-review-input=${inputPath}`] };
}

test('explicit selection is required; historical reports are not implicit evidence', () => {
  const result = readGoldenReviewValidationEvidenceV1(root, []);
  assert.equal(result.exists, false);
  assert.equal(result.path, null);
  assert.equal(result.value.firstBlockingInvariant, 'EXPLICIT_GOLDEN_RECEIPT_AND_INPUT_REQUIRED');
});

test('readback binds receipt bytes, input bytes and recomputed counts without promotion', () => {
  const input = fixture();
  const result = readGoldenReviewValidationEvidenceV1(root, input.args);
  assert.equal(result.value.status, 'GOLDEN_VALIDATION_INPUT_BOUND');
  assert.equal(result.value.inputChecksum, hashGoldenReviewCohortV1(readFileSync(input.inputPath)));
  assert.equal(result.value.validationReceiptChecksum, hashGoldenReviewCohortV1(readFileSync(input.reportPath)));
  assert.equal(result.value.firstBlockingInvariant, 'HUMAN_REVIEWED_JUDGMENTS_PENDING');
  assert.equal(result.value.importAllowed, false);
});

for (const [label, patch, suffix, reason] of [
  ['modified cohort bytes', {}, '\n', 'GOLDEN_VALIDATION_INPUT_CHECKSUM_MISMATCH'],
  ['forged completed count', { completedJudgmentCount: 1 }, '', 'GOLDEN_VALIDATION_COUNTS_MISMATCH'],
  ['unbound input path', { inputPath: 'other.ndjson' }, '', 'GOLDEN_VALIDATION_INPUT_PATH_MISMATCH'],
  ['wrong schema', { schema: 'fixture.other' }, '', 'GOLDEN_VALIDATION_SCHEMA_MISMATCH'],
  ['import claim', { importAllowed: true }, '', 'GOLDEN_VALIDATION_AUTHORITY_FLAGS_INVALID'],
]) {
  test(`rejects ${label}`, () => {
    const input = fixture(patch, suffix);
    const result = readGoldenReviewValidationEvidenceV1(root, input.args);
    assert.equal(result.exists, false);
    assert.equal(result.value.status, 'GOLDEN_VALIDATION_REJECTED');
    assert.equal(result.value.firstBlockingInvariant, reason);
  });
}

for (const script of ['audit-parent-atlas-promotion-gates-v1.mjs', 'audit-promotion-board-reconcile-v2.mjs']) {
  test(`${script} consumes explicit readback and preserves prior reports`, () => {
    const input = fixture();
    const output = join(input.directory, 'audit.json');
    const args = [`scripts/atlas/${script}`, ...input.args, `--output=${output}`];
    const child = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 30000 });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    const report = JSON.parse(readFileSync(output, 'utf8'));
    const evidence = script.startsWith('audit-parent')
      ? report.independentLaneFindings.judgment.validationReadback
      : report.board.judgmentCorpus.validationReadback.value;
    assert.equal(evidence.status, 'GOLDEN_VALIDATION_INPUT_BOUND');
    assert.equal(evidence.firstBlockingInvariant, 'HUMAN_REVIEWED_JUDGMENTS_PENDING');
    assert.equal(evidence.importAllowed, false);
    if (report.board) {
      assert.equal(report.board.promotion.safeToImportJudgments, false);
      assert.equal(report.board.promotion.safeToConfigureRerank, false);
    }
    const before = readFileSync(output, 'utf8');
    const retry = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 30000 });
    assert.notEqual(retry.status, 0);
    assert.equal(readFileSync(output, 'utf8'), before);
  });
}
