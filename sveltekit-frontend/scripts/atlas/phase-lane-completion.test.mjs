import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyFreshness, classifyRefreshPromotion, classifySeedCoverage } from './phase-lane-completion.mjs';

async function fixture(source, output) {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-lane-proof-'));
  const sourcePath = join(directory, 'source.jsonl');
  const outputPath = join(directory, 'output.jsonl');
  await writeFile(sourcePath, source, { flag: 'wx' });
  await writeFile(outputPath, output, { flag: 'wx' });
  await utimes(sourcePath, 1000, 1000);
  await utimes(outputPath, 2000, 2000);
  return { sourcePath, outputPath };
}

test('file existence/freshness alone never qualifies promotion', async () => {
  const { sourcePath, outputPath } = await fixture('source', 'output');
  assert.equal(await classifyFreshness(outputPath, sourcePath), 'FRESHNESS_OBSERVED_PROOF_REQUIRED');
  assert.equal(await classifyRefreshPromotion(outputPath, { exists: true }), 'ARTIFACT_PRESENT_PROOF_REQUIRED');
});

test('missing seed IDs reject even with a newer output mtime', async () => {
  const { sourcePath, outputPath } = await fixture('{"card_id":"a"}\n{"card_id":"b"}', '{"card_id":"a"}');
  assert.equal(await classifySeedCoverage(outputPath, sourcePath), 'SEED_ID_COVERAGE_INCOMPLETE');
});

for (const [label, source, output, expected] of [
  ['empty source', '', '{"card_id":"a"}', 'EMPTY_SEED_EVIDENCE'],
  ['empty output', '{"card_id":"a"}', '', 'EMPTY_SEED_EVIDENCE'],
  ['malformed input', 'not JSON', '{"card_id":"a"}', 'INVALID_SEED_EVIDENCE'],
  ['malformed output', '{"card_id":"a"}', '{"card_id":"a"}\nbad', 'INVALID_SEED_EVIDENCE'],
  ['missing identity', '{}', '{"card_id":"a"}', 'INVALID_SEED_EVIDENCE'],
  ['duplicate identity', '{"card_id":"a"}\n{"card_id":"a"}', '{"card_id":"a"}', 'INVALID_SEED_EVIDENCE'],
]) {
  test(`${label} cannot pass seed coverage`, async () => {
    const { sourcePath, outputPath } = await fixture(source, output);
    assert.equal(await classifySeedCoverage(outputPath, sourcePath), expected);
  });
}

test('complete seed IDs remain diagnostic and stale outputs stay stale', async () => {
  const { sourcePath, outputPath } = await fixture('{"card_id":"a"}', '{"card_id":"a"}');
  assert.equal(await classifySeedCoverage(outputPath, sourcePath), 'SEED_IDS_COVERED_PROOF_REQUIRED');
  await utimes(sourcePath, 3000, 3000);
  assert.equal(await classifySeedCoverage(outputPath, sourcePath), 'STALE_NEEDS_REGEN');
});

test('missing source does not pass freshness or seed coverage', async () => {
  const { sourcePath, outputPath } = await fixture('', '');
  assert.equal(await classifyFreshness(outputPath, `${sourcePath}.missing`), 'MISSING_SOURCE');
  assert.equal(await classifySeedCoverage(outputPath, `${sourcePath}.missing`), 'MISSING_SOURCE');
});
