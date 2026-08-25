import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDatabaseConnectionFingerprint, connectionSource } from './lib/database-connection-fingerprint.mjs';

test('fingerprint is deterministic and excludes credentials', () => {
  const one = buildDatabaseConnectionFingerprint({
    database_name: 'legal_ai_db', current_user: 'legal_admin', session_user: 'legal_admin',
    current_schema: 'public', configured_search_path: '"$user", public',
    effective_search_path: ['pg_catalog', 'public'], server_version: '18.4',
    server_address: '127.0.0.1', server_port: 5434, password: 'must-not-appear',
  }, [{ schema_name: 'public', relation_name: 'atlas_packets', relkind: 'r', visible_in_search_path: true }]);
  const two = buildDatabaseConnectionFingerprint({
    database_name: 'legal_ai_db', current_user: 'legal_admin', session_user: 'legal_admin',
    current_schema: 'public', configured_search_path: '"$user", public',
    effective_search_path: ['pg_catalog', 'public'], server_version: '18.4',
    server_address: '127.0.0.1', server_port: 5434,
  }, [{ schema_name: 'public', relation_name: 'atlas_packets', relkind: 'r', visible_in_search_path: true }]);
  assert.deepEqual(one, two);
  assert.equal(JSON.stringify(one).includes('must-not-appear'), false);
  assert.equal(one.fingerprintSha256.length, 64);
});

test('connection source reports the configured owner without exposing a URL', () => {
  assert.equal(connectionSource({ DATABASE_URL: 'postgresql://user:secret@host/db' }), 'DATABASE_URL');
  assert.equal(connectionSource({ DB_HOST: '127.0.0.1', DB_PORT: '5434' }), 'EXPLICIT_DB_CONFIG');
  assert.equal(connectionSource({}), 'FALLBACK_DEFAULTS');
});
