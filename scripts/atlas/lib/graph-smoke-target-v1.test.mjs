import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDisposableGraphSmokeDatabaseUrl } from './graph-smoke-target-v1.mjs';

test('accepts an explicitly named loopback disposable PostgreSQL database', () => {
  assert.equal(
    assertDisposableGraphSmokeDatabaseUrl('postgresql://user:secret@127.0.0.1:5434/atlas_graph_test'),
    'postgresql://user:secret@127.0.0.1:5434/atlas_graph_test',
  );
});

test('rejects missing, remote, and production-looking database targets', () => {
  assert.throws(() => assertDisposableGraphSmokeDatabaseUrl(undefined), /is required/);
  assert.throws(() => assertDisposableGraphSmokeDatabaseUrl('postgres://u:p@db.internal/atlas_test'), /loopback/);
  assert.throws(() => assertDisposableGraphSmokeDatabaseUrl('postgres://u:p@localhost/legal_ai_db'), /database name/);
});

test('rejects non-PostgreSQL URLs', () => {
  assert.throws(() => assertDisposableGraphSmokeDatabaseUrl('mysql://u:p@localhost/atlas_test'), /PostgreSQL/);
});
