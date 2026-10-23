import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEmbeddingSourceClassCoverageV1 } from './embedding-source-class-coverage-v1.mjs';

const metrics = {
  chunkCount: 2,
  contentEmbeddingChunkCount: 1,
  embedding768ChunkCount: 2,
  sourceRevisionChunkCount: 0,
  workspaceRevisionChunkCount: 0,
  exactProvenContentEmbeddingChunks: 0,
  exactProvenEmbedding768Chunks: 0,
  provenLineageIdentityEmbedding768Chunks: 1,
  lineageSourceRefMatchEmbedding768Chunks: 1,
  uniqueBindingSnapshotEmbedding768Chunks: 0,
  multipleWorkspaceBindingEmbedding768Chunks: 1,
  missingBindingEmbedding768Chunks: 0,
  conflictingLineageEmbedding768Chunks: 0,
  modelRecipesJson: JSON.stringify([{ embeddingModel: 'embeddinggemma:latest', embeddingVersion: 'recipe-v1', embedding768ChunkCount: 2 }]),
};

test('joins exact source-class paths and preserves separate physical and database denominators', () => {
  const result = buildEmbeddingSourceClassCoverageV1({
    physicalClassTotals: [
      { sourceClass: 'FIRST_PARTY_SOURCE', files: 8, bytes: 80 },
      { sourceClass: 'EXTERNAL_DEPENDENCY', files: 20, bytes: 200 },
    ],
    databasePathRows: [{ relativePath: 'src/a.ts', ...metrics }],
    sourceClassByPath: new Map([['src/a.ts', 'FIRST_PARTY_SOURCE']]),
  });
  const firstParty = result.sourceClasses.find(row => row.sourceClass === 'FIRST_PARTY_SOURCE');
  assert.equal(firstParty.physicalFiles, 8);
  assert.equal(firstParty.databasePaths, 1);
  assert.equal(firstParty.embedding768ChunkCount, 2);
  assert.equal(result.databaseMetricTotals.exactProvenEmbedding768Chunks, 0);
  assert.equal(result.matchedDatabasePathCount, 1);
  assert.equal(result.canonicalAuthority, false);
});

test('abstains on duplicate physical paths and reports unmatched database paths', () => {
  const result = buildEmbeddingSourceClassCoverageV1({
    physicalClassTotals: [{ sourceClass: 'FIRST_PARTY_SOURCE', files: 2, bytes: 20 }],
    databasePathRows: [{ relativePath: 'src/shared.ts', ...metrics }, { relativePath: 'src/missing.ts', ...metrics }],
    sourceClassByPath: new Map(),
    ambiguousSourcePaths: new Set(['src/shared.ts']),
  });
  assert.equal(result.ambiguousDatabasePathCount, 1);
  assert.equal(result.unmatchedDatabasePathCount, 1);
  assert.equal(result.matchedDatabasePathCount, 0);
  assert.equal(result.ambiguousSamples[0], 'src/shared.ts');
});

test('rejects duplicate database paths and invalid model-recipe metrics', () => {
  const input = {
    physicalClassTotals: [{ sourceClass: 'FIRST_PARTY_SOURCE', files: 1, bytes: 10 }],
    databasePathRows: [{ relativePath: 'src/a.ts', ...metrics }, { relativePath: 'src/a.ts', ...metrics }],
    sourceClassByPath: new Map([['src/a.ts', 'FIRST_PARTY_SOURCE']]),
  };
  assert.throws(() => buildEmbeddingSourceClassCoverageV1(input), /DATABASE_PATH_INVALID_OR_DUPLICATE/);
  const invalidRecipe = { ...metrics, modelRecipesJson: '[{"embeddingModel":"bad","embeddingVersion":"x","embedding768ChunkCount":-1}]' };
  assert.throws(() => buildEmbeddingSourceClassCoverageV1({ ...input, databasePathRows: [{ relativePath: 'src/a.ts', ...invalidRecipe }] }), /MODEL_RECIPE_INVALID/);
});

test('retains model rows whose recipe version is explicitly unknown', () => {
  const unknownVersion = { ...metrics, modelRecipesJson: '[{"embeddingModel":"embeddinggemma:latest","embeddingVersion":null,"embedding768ChunkCount":2}]' };
  const result = buildEmbeddingSourceClassCoverageV1({
    physicalClassTotals: [{ sourceClass: 'FIRST_PARTY_SOURCE', files: 1, bytes: 10 }],
    databasePathRows: [{ relativePath: 'src/a.ts', ...unknownVersion }],
    sourceClassByPath: new Map([['src/a.ts', 'FIRST_PARTY_SOURCE']]),
  });
  assert.equal(result.sourceClasses[0].modelRecipes['["embeddinggemma:latest",null]'], 2);
});
