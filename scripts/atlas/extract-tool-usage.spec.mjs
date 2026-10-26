import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('./extract-tool-usage.mjs', import.meta.url));

test('sample USES_TOOL proposals are snapshot-bound and review-only', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--sample'], {
    cwd: path.resolve(path.dirname(scriptPath), '../..'),
    encoding: 'utf8',
    timeout: 60000,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = result.stdout;
  const edgeCount = Number(output.match(/Total USES_TOOL edges extracted: (\d+)/)?.[1]);
  const lineage = output.match(/\[PROPOSAL-LINEAGE\] (\d+)\/(\d+) snapshot-bound; (\d+)\/(\d+) review-required; canonical writes=0/);

  assert.ok(edgeCount > 0, output);
  assert.ok(lineage, output);
  assert.equal(Number(lineage[1]), edgeCount);
  assert.equal(Number(lineage[2]), edgeCount);
  assert.equal(Number(lineage[3]), edgeCount);
  assert.equal(Number(lineage[4]), edgeCount);
  assert.match(output, /\[DRY-RUN\] Would write/);
  assert.doesNotMatch(output, /\[WRITE\]/);
});
