import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('./extract-db-usage.mjs', import.meta.url));

test('sample emits only resolved pool queries as USES_DB edges', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--sample'], {
    cwd: path.resolve(path.dirname(scriptPath), '../..'),
    encoding: 'utf8',
    timeout: 30000,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = result.stdout;
  const drizzle = Number(output.match(/Found (\d+) Drizzle operations/)?.[1]);
  const rawSql = Number(output.match(/Found (\d+) raw SQL operations/)?.[1]);
  const pool = output.match(/Emitted (\d+) resolved pool edges \((\d+) resolved, (\d+) unresolved\)/);
  const total = Number(output.match(/Total USES_DB edges: (\d+)/)?.[1]);

  assert.ok(pool, output);
  const [, emitted, resolved, unresolved] = pool.map(Number);
  assert.equal(emitted, resolved);
  assert.ok(unresolved >= 0);
  assert.equal(total, drizzle + rawSql + resolved);
  const lineage = output.match(/\[PROPOSAL-LINEAGE\] (\d+)\/(\d+) snapshot-bound; (\d+)\/(\d+) review-required; canonical writes=0/);
  assert.ok(lineage, output);
  assert.equal(Number(lineage[1]), total);
  assert.equal(Number(lineage[2]), total);
  assert.equal(Number(lineage[3]), total);
  assert.equal(Number(lineage[4]), total);
  const qdrant = output.match(/\[QDRANT-PROPOSALS\] (\d+) candidates; (\d+)\/(\d+) snapshot-bound; (\d+)\/(\d+) review-required; would write .*; canonical writes=0/);
  assert.ok(qdrant, output);
  assert.ok(Number(qdrant[1]) > 0);
  assert.equal(Number(qdrant[2]), Number(qdrant[1]));
  assert.equal(Number(qdrant[3]), Number(qdrant[1]));
  assert.equal(Number(qdrant[4]), Number(qdrant[1]));
  assert.equal(Number(qdrant[5]), Number(qdrant[1]));
  assert.match(output, /\[DRY-RUN\] Would write/);
  assert.doesNotMatch(output, /\[WRITE\]/);
});
