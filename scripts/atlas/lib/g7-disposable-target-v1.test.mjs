import test from 'node:test';
import assert from 'node:assert/strict';
import { assertG7DisposableContainerV1, parseG7DisposableTargetV1 } from './g7-disposable-target-v1.mjs';

test('accepts only explicitly named loopback G7 fixture targets on dedicated ports', () => {
  assert.deepEqual(
    parseG7DisposableTargetV1('postgresql://fixture:secret@127.0.0.1:55440/atlas_scratch_g7'),
    {
      url: 'postgresql://fixture:secret@127.0.0.1:55440/atlas_scratch_g7',
      host: '127.0.0.1',
      port: '55440',
      database: 'atlas_scratch_g7',
    },
  );
});

test('rejects omitted, non-loopback, production-port, and non-fixture database targets', () => {
  assert.throws(() => parseG7DisposableTargetV1(undefined), /G7_DISPOSABLE_DATABASE_URL_REQUIRED/);
  assert.throws(() => parseG7DisposableTargetV1('postgres://fixture:secret@db.internal:55440/atlas_scratch_g7'), /HOST_NOT_LOOPBACK/);
  assert.throws(() => parseG7DisposableTargetV1('postgres://fixture:secret@127.0.0.1:5434/atlas_scratch_g7'), /PORT_NOT_APPROVED/);
  assert.throws(() => parseG7DisposableTargetV1('postgres://fixture:secret@127.0.0.1:55440/g7_disposable_scratch'), /NAME_NOT_APPROVED/);
});

test('accepts only the expected PostgreSQL 18 fixture image, labels, and loopback binding', () => {
  const container = {
    Config: {
      Image: 'pgvector/pgvector:pg18',
      Labels: { 'atlas.disposable': 'true', 'atlas.fixture': 'g7-registration' },
      Env: ['POSTGRES_USER=fixture', 'POSTGRES_PASSWORD=fixture-secret'],
    },
    NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55440' }] } },
  };
  assert.equal(assertG7DisposableContainerV1(container, '55440', 'postgresql://fixture:fixture-secret@127.0.0.1:55440/atlas_scratch_g7'), true);
  assert.throws(() => assertG7DisposableContainerV1({ ...container, Config: { ...container.Config, Image: 'postgres:18' } }, '55440', 'postgresql://fixture:fixture-secret@127.0.0.1:55440/atlas_scratch_g7'), /IMAGE_INVALID/);
  assert.throws(() => assertG7DisposableContainerV1({ ...container, Config: { ...container.Config, Labels: {} } }, '55440', 'postgresql://fixture:fixture-secret@127.0.0.1:55440/atlas_scratch_g7'), /LABELS_INVALID/);
  assert.throws(() => assertG7DisposableContainerV1({ ...container, NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '55440' }] } } }, '55440', 'postgresql://fixture:fixture-secret@127.0.0.1:55440/atlas_scratch_g7'), /BINDING_INVALID/);
  assert.throws(() => assertG7DisposableContainerV1(container, '55440', 'postgresql://other:prod-secret@127.0.0.1:55440/atlas_scratch_g7'), /CREDENTIALS_DO_NOT_MATCH_CONTAINER/);
});
