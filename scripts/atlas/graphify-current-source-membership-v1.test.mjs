import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sql = readFileSync(path.join(root, 'sveltekit-frontend/drizzle/manual/graphify_current_source_membership_v1.sql'), 'utf8');

test('current-source view reads revision-qualified V2 execution membership, not the stale legacy table', () => {
  assert.match(sql, /FROM\s+graphify_execution_file_membership_v2\s+m/i);
  assert.match(sql, /m\.code_source_revision\s+AS\s+last_seen_code_source_revision/i);
  assert.match(sql, /PARTITION BY\s+m\.repository_id\s*,\s*m\.source_ref\s*,\s*ge\.workspace_id/i);
  assert.doesNotMatch(sql, /FROM\s+graphify_execution_files\b/i);
  assert.doesNotMatch(sql, /FROM\s+graphify_files\b/i);
});

test('latest-execution selection uses completion time and a deterministic execution-ID tiebreak', () => {
  assert.match(sql, /ORDER BY\s+workspace_id\s*,\s*completed_at\s+DESC\s+NULLS LAST\s*,\s*execution_id/i);
  assert.match(sql, /ORDER BY\s+ge\.completed_at\s+DESC\s+NULLS LAST\s*,\s*m\.execution_id/i);
});
