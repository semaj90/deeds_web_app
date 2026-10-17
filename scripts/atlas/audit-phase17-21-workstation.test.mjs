import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { phase } from './audit-phase17-21-workstation.mjs';

test('historical operational and eval labels do not establish current phase acceptance', () => {
  for (const [id, recorded] of [[17, 'PARTIAL'], [18, 'OPERATIONAL'], [19, 'OPERATIONAL'], [20, 'OPERATIONAL'], [21, 'EVAL_GATED']]) {
    const result = phase(id, recorded, 95, ['historical claim'], ['proof required']);
    assert.equal(result.status, 'NOT_PROVEN');
    assert.equal(result.recorded_status, recorded);
    assert.equal(result.completion_pct, null);
    assert.equal(result.historical_estimate_pct, 95);
    assert.equal(result.promotionEligible, false);
    assert.equal(result.mapped_receipts, 0);
  }
});

test('offline actual audit has no operational proof or measured completion claim', () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-workstation-audit-'));
  const output = join(directory, 'audit.json');
  const script = fileURLToPath(new URL('./audit-phase17-21-workstation.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--offline', `--output=${output}`], { encoding: 'utf8', timeout: 30000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(report.overall, 'PARTIAL');
  assert.equal(report.completion_pct, null);
  assert.equal(report.operational_probes_performed, false);
  assert.equal(report.summary_lane.status, 'NOT_PROBED');
  assert.equal(report.summary_lane.chat_model, null);
  assert.equal(report.promotionEligible, false);
  assert.ok(report.phases.every((item) => item.status === 'NOT_PROVEN' && item.completion_pct === null));
  assert.deepEqual(report.accelerator_boundary.operational, []);
  assert.doesNotMatch(readFileSync(`${output}.md`, 'utf8'), /null%/);
  const before = readFileSync(output, 'utf8');
  const retry = spawnSync(process.execPath, [script, '--offline', `--output=${output}`], { encoding: 'utf8', timeout: 30000 });
  assert.notEqual(retry.status, 0);
  assert.match(retry.stderr, /EEXIST/);
  assert.equal(readFileSync(output, 'utf8'), before);
});
