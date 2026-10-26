import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRuntimeOwnerDirectoryCandidatesV1 } from './runtime-owner-directory-candidates-v1.mjs';

const sha = 'a'.repeat(64);

test('maps only exact inventoried owner files and keeps runtime claims advisory', () => {
  const result = buildRuntimeOwnerDirectoryCandidatesV1({
    registry: { schema_version: 'atlas.runtime-ownership.v1', capabilities: {
      alpha: { owner: { classification: 'CANONICAL_OWNER', path: 'src/server/owner.ts' } },
      beta: { owner: { classification: 'UNKNOWN', path: 'PostgreSQL public.table' } },
      gamma: { owner: { path: 'missing/file.ts' } },
    } },
    inventoryPaths: new Set(['src/server/owner.ts']),
    directoryPaths: new Set(['src/server']),
    currentFileDigests: new Map([['src/server/owner.ts', sha]]),
  });
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], {
    capabilityId: 'alpha', ownerClassification: 'CANONICAL_OWNER', ownerPath: 'src/server/owner.ts',
    ownerFileSha256: sha, parentDirectoryPath: 'src/server',
    evidenceKind: 'DECLARED_RUNTIME_OWNER_PATH_CANDIDATE', executionProven: false, sourceRevisionQualified: false,
  });
  assert.deepEqual(result.rejected.map(row => row.reason), [
    'OWNER_PATH_NOT_IN_INVENTORY', 'OWNER_PATH_NOT_IN_INVENTORY',
  ]);
});

test('rejects incomplete inputs and directory aliases', () => {
  assert.throws(() => buildRuntimeOwnerDirectoryCandidatesV1({}), /RUNTIME_OWNER_INPUT_INVALID/);
  assert.throws(() => buildRuntimeOwnerDirectoryCandidatesV1({
    registry: { schema_version: 'wrong', capabilities: {} },
    inventoryPaths: new Set(), directoryPaths: new Set(['.']), currentFileDigests: new Map(),
  }), /RUNTIME_OWNER_INPUT_INVALID/);
  assert.throws(() => buildRuntimeOwnerDirectoryCandidatesV1({
    registry: { schema_version: 'atlas.runtime-ownership.v1', capabilities: {} },
    inventoryPaths: new Set(), directoryPaths: new Map(), currentFileDigests: new Map(),
  }), /RUNTIME_OWNER_INPUT_INVALID/);
  const result = buildRuntimeOwnerDirectoryCandidatesV1({
    registry: { schema_version: 'atlas.runtime-ownership.v1', capabilities: {
      alpha: { owner: { path: 'src/../outside.ts' } },
    } },
    inventoryPaths: new Set(['src/../outside.ts']), directoryPaths: new Set(['src']), currentFileDigests: new Map(),
  });
  assert.equal(result.rows.length, 0);
  assert.equal(result.rejected[0].reason, 'OWNER_PATH_NOT_SINGLE_REPOSITORY_FILE');
});
