import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./build-qualified-schema-topology.mjs', import.meta.url), 'utf8');

test('schema topology collection uses configured credentials and a read-only transaction', () => {
  assert.match(source, /resolveDatabaseUrl\(loadRepoEnv\(process\.env\)\)/);
  assert.doesNotMatch(source, /postgres(?:ql)?:\/\/[^\s'"`]+:[^\s'"`]+@/i);
  assert.match(source, /BEGIN READ ONLY/);
  assert.match(source, /SHOW transaction_read_only/);
  assert.match(source, /POSTGRES_TRANSACTION_NOT_READ_ONLY/);
  assert.match(source, /current_database\(\)/);
  assert.match(source, /POSTGRES_18_REQUIRED/);
  assert.match(source, /ROLLBACK/);
  assert.doesNotMatch(source, /GREATEST\(\s*0\s*,\s*c\.reltuples/i);
  assert.match(source, /c\.reltuples::bigint AS estimated_rows/);
});

test('unknown row estimates remain distinct from zero estimates', () => {
  assert.match(source, /const hasEstimate = Number\.isFinite\(estimatedRows\) && estimatedRows >= 0/);
  assert.match(source, /const rowCount = hasEstimate \? estimatedRows : null/);
  assert.match(source, /UNKNOWN_UNANALYZED/);
  assert.match(source, /ZERO_ESTIMATE/);
  assert.match(source, /unknownRowEstimateRelations/);
});
