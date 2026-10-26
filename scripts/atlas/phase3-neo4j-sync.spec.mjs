import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('./phase3-neo4j-sync.mjs', import.meta.url));

test('reset is refused unless apply is explicitly selected', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--reset'], {
    cwd: path.resolve(path.dirname(scriptPath), '../..'),
    encoding: 'utf8',
    timeout: 60000,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--reset requires explicit --apply/);
});
