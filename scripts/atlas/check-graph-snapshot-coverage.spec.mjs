import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./check-graph-snapshot-coverage.mjs', import.meta.url), 'utf8');

test('graph snapshot catalog audit uses configured credentials and read-only transaction', () => {
  assert.match(source, /resolveDatabaseUrl\(loadRepoEnv\(process\.env\)\)/);
  assert.match(source, /BEGIN READ ONLY/);
  assert.match(source, /SHOW transaction_read_only/);
  assert.match(source, /POSTGRES_TRANSACTION_NOT_READ_ONLY/);
  assert.match(source, /ROLLBACK/);
  assert.match(source, /databaseWrites:\s*false/);
  assert.match(source, /pg_get_indexdef\(index_class\.oid\) AS indexdef/);
  assert.match(source, /index_state\.indisvalid/);
  assert.match(source, /index_state\.indisready/);
  assert.doesNotMatch(source, /password\s*:\s*['"][^'"]+['"]/i);
});
