import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const scripts = ['derive-openspec-ids.mjs', 'derive-gsd-ids.mjs'];

for (const name of scripts) {
  const file = path.join(dir, name);
  const text = readFileSync(file, 'utf8');

  test(`${name}: --apply and --apply=... are refused with exit 3 before any work`, () => {
    for (const flag of ['--apply', '--apply=true']) {
      const r = spawnSync(process.execPath, [file, flag], { encoding: 'utf8', timeout: 20000 });
      assert.equal(r.status, 3, `${flag}: ${r.stderr}`);
      assert.match(r.stderr, /BLOCKED_APPLY/);
      assert.equal(r.stdout, '');
    }
  });

  test(`${name}: static guard - no Postgres client, no live SQL writer, no title-keyed predicate outside comments`, () => {
    const code = text.split(/\r?\n/).filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*')).join('\n');
    assert.doesNotMatch(code, /from 'pg'/);
    assert.doesNotMatch(code, /new pg\./);
    assert.doesNotMatch(code, /pool\./);
    assert.doesNotMatch(code, /UPDATE\s+atlas_packets/i);
    assert.doesNotMatch(code, /WHERE\s+title_id/i);
    assert.match(code, /REGISTRY_LUT_01D_APPLY_DISABLED/);
  });

  test(`${name}: consumes the packet-key planner and never reports apply-ready`, () => {
    assert.match(text, /planPacketKeyIdUpdatesV1/);
    assert.match(text, /applyReady = false/);
    assert.match(text, /sourceBindingEvidence = 'NOT_PROVIDED'/);
    assert.match(text, /reportExplicit/);
  });
}
