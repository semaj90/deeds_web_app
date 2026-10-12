import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const scripts = ['derive-openspec-ids.mjs', 'derive-gsd-ids.mjs'];

for (const name of scripts) {
  test(`${name} is packet-key planned and cannot apply`, () => {
    const source = readFileSync(path.join(scriptDir, name), 'utf8');
    const executableSource = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.match(executableSource, /planPacketKeyIdUpdatesV1/);
    assert.match(executableSource, /packet_key:\s*u\.packetKey/);
    assert.match(executableSource, /source_ref:\s*u\.sourceRef/);
    assert.doesNotMatch(executableSource, /UPDATE\s+atlas_packets[\s\S]*?WHERE\s+title_id\s*=/i);
    assert.doesNotMatch(executableSource, /from\s+['"]pg['"]/i);

    const result = spawnSync(process.execPath, [path.join(scriptDir, name), '--apply'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 10000,
    });

    assert.equal(result.status, 3, result.stderr || result.stdout);
    assert.match(result.stderr, /BLOCKED_APPLY/);
    assert.doesNotMatch(result.stdout, /APPLY_COMPLETE/);
  });
}
