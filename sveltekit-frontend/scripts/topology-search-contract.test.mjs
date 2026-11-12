import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildHybridResult, topologyIdentityKey, validateSearchRequest } from './topology-search-contract.mjs';

const identity = {
  stable_key: 'stable-a',
  source_ref: 'src/a.ts',
  source_revision: `sha256:${'a'.repeat(64)}`,
  content_hash: 'b'.repeat(64),
  representation_revision: 'embeddinggemma-semantic-768-r1',
};

test('search validation accepts bounded, normalized input', () => {
  assert.deepEqual(validateSearchRequest('/search', {
    query: '  contract review  ',
    center: [1, 2, 3, 4],
    tags: [' evidence '],
  }), {
    ok: true,
    value: {
      query: 'contract review', center: [1, 2, 3, 4], radius: 0.25,
      limit: 20, somCluster: undefined, tags: ['evidence'], collection: 'codebase_chunks_768',
    },
  });
});

test('search validation rejects malformed bodies, coordinates, bounds and collections', () => {
  assert.equal(validateSearchRequest('/search', []).ok, false);
  assert.equal(validateSearchRequest('/search/cosine', { query: 12 }).ok, false);
  assert.equal(validateSearchRequest('/search', { center: [0, 0, Number.NaN, 0] }).ok, false);
  assert.equal(validateSearchRequest('/search/hybrid', { query: 'valid', limit: 101 }).ok, false);
  assert.equal(validateSearchRequest('/search/hybrid', { query: 'valid', radius: -1 }).ok, false);
  assert.equal(validateSearchRequest('/search/cosine', { query: 'valid', collection: 'private_table' }).ok, false);
  assert.equal(validateSearchRequest('/search', { tags: Array(33).fill('tag') }).ok, false);
});

test('hybrid ranking labels a usable topology merge and preserves the weighted score', () => {
  const result = buildHybridResult({
    query: 'contract', center: [0, 0, 0, 0], radius: 0.25, limit: 5,
    cosineHits: [{ id: 1, score: 0.8, payload: { ...identity, path: 'a.ts', content: 'summary' } }],
    manifoldHits: [{ ...identity, stableKey: identity.stable_key, path: 'a.ts', manifoldScore: 0.5, contentPreview: 'topology' }],
    fallbackReason: null, durationMs: 4,
  });

  assert.equal(result.rankingMode, 'hybrid');
  assert.equal(result.topologyStatus, 'used');
  assert.ok(Math.abs(result.hits[0].hybridScore - 0.68) < 1e-12);
  assert.equal(result.identityJoin.matched, 1);
});

test('same path does not join a stale revision; cosine and topology evidence remain separate', () => {
  const result = buildHybridResult({
    query: 'contract', center: [0, 0, 0, 0], radius: 0.25, limit: 5,
    cosineHits: [{ id: 1, score: 0.8, payload: { ...identity, path: 'a.ts' } }],
    manifoldHits: [{ ...identity, stable_key: undefined, stableKey: identity.stable_key, sourceRevision: `sha256:${'c'.repeat(64)}`, source_revision: `sha256:${'c'.repeat(64)}`, path: 'a.ts', manifoldScore: 0.5 }],
    fallbackReason: null, durationMs: 4,
  });

  assert.equal(result.rankingMode, 'cosine_only');
  assert.equal(result.topologyStatus, 'unmatched');
  assert.equal(result.fallbackReason, 'identity_mismatch');
  assert.equal(result.hits[0].hybridScore, 0.8);
  assert.equal(result.unmatchedTopologyHits.length, 1);
  assert.equal(result.identityJoin.matched, 0);
});

test('CPU oracle keeps duplicate paths separate and joins only the single current identity', () => {
  const current = { ...identity, stable_key: 'stable-current', source_ref: 'src/repeated.ts', path: 'src/repeated.ts' };
  const stale = { ...identity, stable_key: 'stable-stale', source_ref: 'src/repeated.ts', source_revision: `sha256:${'c'.repeat(64)}`, path: 'src/repeated.ts' };
  const result = buildHybridResult({
    query: 'current source', center: [0, 0, 0, 0], radius: 0.25, limit: 10,
    cosineHits: [
      { id: 'current', score: 0.8, payload: current },
      { id: 'stale', score: 0.7, payload: stale },
    ],
    manifoldHits: [
      { ...current, stableKey: current.stable_key, manifoldScore: 0.5 },
      { ...stale, stableKey: stale.stable_key, source_revision: `sha256:${'d'.repeat(64)}`, sourceRevision: `sha256:${'d'.repeat(64)}`, manifoldScore: 0.9 },
      { stableKey: 'unknown', path: 'src/repeated.ts', manifoldScore: 1 },
    ],
    fallbackReason: null, durationMs: 4,
  });
  assert.equal(result.identityJoin.matched, 1);
  assert.ok(Math.abs(result.hits.find((hit) => hit.id === 'current').hybridScore - 0.68) < 1e-12);
  assert.equal(result.hits.find((hit) => hit.id === 'stale').hybridScore, 0.7);
  assert.equal(result.unmatchedTopologyHits.length, 2);
  assert.equal(result.topologyStatus, 'used');
});

test('duplicate candidate identities are not merged because the join is ambiguous', () => {
  const result = buildHybridResult({
    query: 'duplicate identity', center: [0, 0, 0, 0], radius: 0.25, limit: 10,
    cosineHits: [
      { id: 'one', score: 0.8, payload: identity },
      { id: 'two', score: 0.7, payload: identity },
    ],
    manifoldHits: [{ ...identity, stableKey: identity.stable_key, manifoldScore: 0.5 }],
    fallbackReason: null, durationMs: 4,
  });
  assert.equal(result.rankingMode, 'cosine_only');
  assert.equal(result.identityJoin.matched, 0);
  assert.equal(result.unmatchedTopologyHits.length, 1);
});

test('hybrid fallback explicitly identifies unavailable topology and keeps cosine ordering', () => {
  const result = buildHybridResult({
    query: 'contract', center: null, radius: 0.25, limit: 5,
    cosineHits: [{ id: 1, score: 0.8, payload: { path: 'a.ts' } }],
    manifoldHits: [], fallbackReason: 'topology_query_failed', durationMs: 4,
  });

  assert.equal(result.rankingMode, 'cosine_only');
  assert.equal(result.topologyStatus, 'unavailable');
  assert.equal(result.fallbackReason, 'topology_query_failed');
  assert.equal(result.hits[0].hybridScore, 0.8);
});

test('identity requires stable key, source ref/revision, content hash, and representation or snapshot revision', () => {
  assert.ok(topologyIdentityKey(identity));
  assert.equal(topologyIdentityKey({ ...identity, representation_revision: undefined }), null);
  assert.equal(topologyIdentityKey({ ...identity, source_ref: undefined }), null);
  assert.equal(topologyIdentityKey({ ...identity, path: 'same.ts', stable_key: undefined }), null);
});

test('server refuses to start without operator-provided PostgreSQL configuration', () => {
  const serverPath = fileURLToPath(new URL('./topology-search-server.mjs', import.meta.url));
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    NODE_ENV: 'test',
    TOPOLOGY_SEARCH_PORT: '0',
    DATABASE_URL_DEV: 'postgresql://ignored.invalid/test',
  };
  const result = spawnSync(process.execPath, [serverPath], { env, encoding: 'utf8', timeout: 5_000 });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL must be configured/);
  assert.doesNotMatch(result.stderr, /123456|legal_admin/);
});
