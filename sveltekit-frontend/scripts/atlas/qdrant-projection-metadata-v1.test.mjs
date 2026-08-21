#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  assertQdrantPointIdMatchesPostgresV1,
  buildQdrantPointMetadataV1,
  validateQdrantProjectionMetadataV1,
} from './qdrant-projection-metadata-v1.mjs';

const good = {
  relative_path: 'src/lib/server/atlas/example.ts',
  content_hash: '0123456789abcdef',
  chunk_id: 'chunk-existing-1',
};

assert.equal(validateQdrantProjectionMetadataV1(good), good);
assert.equal(
  buildQdrantPointMetadataV1({ relativePath: good.relative_path, contentHash: good.content_hash }),
  'card:src/lib/server/atlas/example.ts:0123456789abcdef',
);
assert.equal(assertQdrantPointIdMatchesPostgresV1('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'), true);

assert.throws(() => validateQdrantProjectionMetadataV1({ ...good, content_hash: null }), /CONTENT_HASH_REQUIRED/);
assert.throws(() => validateQdrantProjectionMetadataV1({ ...good, content_hash: '' }), /CONTENT_HASH_REQUIRED/);
assert.throws(() => validateQdrantProjectionMetadataV1({ ...good, relative_path: null }), /SOURCE_REF_REQUIRED/);
assert.throws(() => validateQdrantProjectionMetadataV1({ ...good, chunk_id: null }), /CHUNK_ID_REQUIRED/);
assert.throws(() => buildQdrantPointMetadataV1({ relativePath: good.relative_path, contentHash: null }), /CONTENT_HASH_REQUIRED/);
assert.throws(
  () => assertQdrantPointIdMatchesPostgresV1('11111111-1111-1111-1111-111111111111', 'card:path:hash'),
  /QDRANT_POINT_ID_NOT_POSTGRES_UUID/,
);

console.log('qdrant-projection-metadata-v1: PASS');
