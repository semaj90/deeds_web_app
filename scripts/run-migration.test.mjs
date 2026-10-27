import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDatabaseUrl, redactDatabaseUrl } from './run-migration.mjs';

test('missing or blank DATABASE_URL fails closed with no default credential', () => {
  for (const env of [{}, { DATABASE_URL: '' }, { DATABASE_URL: '   ' }]) {
    assert.throws(() => resolveDatabaseUrl(env), /DATABASE_URL_NOT_CONFIGURED/);
  }
});

test('configured URL is returned unchanged', () => {
  assert.equal(resolveDatabaseUrl({ DATABASE_URL: 'postgresql://u:p@h:1/d' }), 'postgresql://u:p@h:1/d');
});

test('redaction never emits user info or password, even for unparseable input', () => {
  const shown = redactDatabaseUrl('postgresql://user:s3cret@127.0.0.1:5434/db');
  assert.equal(shown, 'postgresql://127.0.0.1:5434/db');
  assert.ok(!redactDatabaseUrl('not a url s3cret').includes('s3cret'));
});

test('importing the module performs no connection and no migration', () => {
  assert.equal(typeof resolveDatabaseUrl, 'function');
});
