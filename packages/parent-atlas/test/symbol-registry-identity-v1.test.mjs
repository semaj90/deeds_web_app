import assert from 'node:assert/strict';
import test from 'node:test';
import { createSymbolRegistryRepository } from '../dist/core/symbol-registry-repository.js';

const hash = (value) => value.repeat(64).slice(0, 64);
const sourceRevision = (value) => `sha256:${hash(value)}`;

function nomination(overrides = {}) {
  return {
    schema: 'atlas.structural-symbol-nomination.v1',
    nomination_id: 'nomination:parse-widget',
    symbol_key: 'typescript:class:Widget',
    identity_status: 'nominated',
    role: 'definition',
    kind: 'class',
    language: 'typescript',
    name: 'Widget',
    qualified_name: 'ui.Widget',
    source_ref: 'src/ui.ts',
    source_revision: sourceRevision('a'),
    workspace_revision: sourceRevision('b'),
    upstream_file_id: 'file:ui',
    upstream_node_id: 'node:widget:r1',
    upstream_chunk_id: 'chunk:widget:r1',
    byte_start: 10,
    byte_end: 80,
    parent_route: ['module'],
    declaration_hash: hash('c'),
    exported: true,
    extractor: 'treesitter_chunker',
    extractor_revision: 'treesitter-chunker:v4',
    ...overrides,
  };
}

function mockPool() {
  const statements = [];
  const client = {
    async query(sql, values = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push({ sql: normalized, values });
      if (normalized.startsWith('SELECT stable_symbol_id, basis')) return { rows: [] };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  return { pool: { connect: async () => client }, statements };
}

async function promote(repo, value) {
  return repo.promoteNomination({
    nomination: value,
    registry_revision: 'registry:fixture-v1',
    producer_revision: 'gis:fixture-v1',
    allow_create: true,
    evidence_refs: ['evidence:fixture'],
  });
}

test('logical symbol identity is stable across source revisions while symbol versions remain revision-qualified', async () => {
  const firstDb = mockPool();
  const secondDb = mockPool();
  const first = await promote(createSymbolRegistryRepository(firstDb.pool), nomination());
  const second = await promote(createSymbolRegistryRepository(secondDb.pool), nomination({
    source_revision: sourceRevision('d'),
    workspace_revision: sourceRevision('e'),
    upstream_node_id: 'node:widget:r2',
    upstream_chunk_id: 'chunk:widget:r2',
    byte_start: 20,
    byte_end: 95,
    declaration_hash: hash('f'),
  }));

  assert.equal(first.resolution.stable_symbol_id, second.resolution.stable_symbol_id);
  assert.notEqual(first.version.symbol_version_id, second.version.symbol_version_id);
  assert.equal(first.version.source_revision, sourceRevision('a'));
  assert.equal(second.version.source_revision, sourceRevision('d'));
});

test('source byte spans are persisted as version evidence and do not define symbol identity', async () => {
  const firstDb = mockPool();
  const shiftedDb = mockPool();
  const first = await promote(createSymbolRegistryRepository(firstDb.pool), nomination());
  const shifted = await promote(createSymbolRegistryRepository(shiftedDb.pool), nomination({
    byte_start: 40,
    byte_end: 110,
  }));

  assert.equal(first.resolution.stable_symbol_id, shifted.resolution.stable_symbol_id);
  assert.equal(first.version.symbol_version_id, shifted.version.symbol_version_id);
  const versionInsert = (db) => db.statements.find(({ sql }) => sql.includes('INSERT INTO atlas_symbol_versions'));
  assert.equal(versionInsert(firstDb).values[12], 10);
  assert.equal(versionInsert(firstDb).values[13], 80);
  assert.equal(versionInsert(shiftedDb).values[12], 40);
  assert.equal(versionInsert(shiftedDb).values[13], 110);
});

test('symbol creation remains explicitly gated', async () => {
  const db = mockPool();
  const repo = createSymbolRegistryRepository(db.pool);
  await assert.rejects(
    repo.promoteNomination({ nomination: nomination(), registry_revision: 'registry:fixture-v1', producer_revision: 'gis:fixture-v1', allow_create: false }),
    /SYMBOL_PROMOTION_REQUIRES_EXPLICIT_ALLOW_CREATE/,
  );
  assert.equal(db.statements.length, 0);
});

test('symbol promotion rejects non-SHA source or workspace revisions before database access', async () => {
  for (const invalid of [
    nomination({ source_revision: '1bb240fb20f1d4ba5651d8a4da9a10c9d6337aaf' }),
    nomination({ source_revision: 'workspace:0' }),
    nomination({ workspace_revision: 'workspace:0' }),
  ]) {
    const db = mockPool();
    await assert.rejects(
      promote(createSymbolRegistryRepository(db.pool), invalid),
      /SYMBOL_PROMOTION_REQUIRES_SHA256_SOURCE_AND_WORKSPACE_REVISIONS/,
    );
    assert.equal(db.statements.length, 0);
  }
});
